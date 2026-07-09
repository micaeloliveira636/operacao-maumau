const express = require('express');
const { eq, and } = require('drizzle-orm');
const { db } = require('../db');
const { arquivos, demandas } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { assinarUpload, montarFolder, urlEntrega, deletarAsset, validarFormato } = require('../utils/cloudinary');

const router = express.Router();

// Carrega a demanda e aplica a regra de acesso (operador só mexe nas suas).
async function carregarDemanda(req, res, next) {
  try {
    const demandaId = req.params.demandaId || req.body.demandaId;
    if (!demandaId) {
      return res.status(400).json({ error: 'demandaId obrigatório' });
    }

    const [demanda] = await db
      .select()
      .from(demandas)
      .where(eq(demandas.id, demandaId))
      .limit(1);

    if (!demanda) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    if (req.user.role === 'operador' && demanda.atribuidoA !== req.user.id) {
      return res.status(403).json({ error: 'Sem permissão sobre esta demanda' });
    }

    req.demanda = demanda;
    next();
  } catch (err) {
    console.error('Erro ao carregar demanda:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}

// Estados que não permitem mais alterar arquivos.
const ESTADOS_TRAVADOS = ['aprovado', 'agendamento_pendente', 'agendado', 'concluido'];

// POST /arquivos/assinatura — gera a assinatura Cloudinary para upload direto
router.post('/assinatura', requireAuth, carregarDemanda, async (req, res) => {
  try {
    if (ESTADOS_TRAVADOS.includes(req.demanda.status)) {
      return res.status(400).json({ error: 'Demanda travada para upload neste status' });
    }

    const dados = assinarUpload({
      demandaId: req.demanda.id,
      dataAlvo: req.demanda.dataAlvo,
      categoria: req.demanda.categoria,
    });
    return res.json(dados);
  } catch (err) {
    console.error('Erro ao assinar upload:', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
});

// POST /arquivos — registra no banco um arquivo já enviado ao Cloudinary
router.post('/', requireAuth, carregarDemanda, async (req, res) => {
  try {
    if (ESTADOS_TRAVADOS.includes(req.demanda.status)) {
      return res.status(400).json({ error: 'Demanda travada neste status' });
    }

    const {
      cloudinaryPublicId,
      tipo,
      formatoOriginal,
      ordem,
      horario,
      legendaCustom,
    } = req.body;

    if (!cloudinaryPublicId || !tipo || !formatoOriginal || ordem === undefined) {
      return res.status(400).json({
        error: 'Campos obrigatórios: cloudinaryPublicId, tipo, formatoOriginal, ordem',
      });
    }

    if (!['imagem', 'video'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo deve ser imagem ou video' });
    }

    if (!validarFormato(formatoOriginal)) {
      return res.status(400).json({ error: `Formato não permitido: ${formatoOriginal}` });
    }

    // Segurança: o public_id retornado precisa estar na pasta esperada da demanda.
    const folderEsperado = montarFolder({
      demandaId: req.demanda.id,
      dataAlvo: req.demanda.dataAlvo,
      categoria: req.demanda.categoria,
    });
    if (!String(cloudinaryPublicId).startsWith(folderEsperado + '/')) {
      return res.status(400).json({ error: 'public_id fora da pasta autorizada' });
    }

    const formatoEntrega = tipo === 'video' ? 'mp4' : 'jpg';
    const cloudinaryUrl = urlEntrega({ publicId: cloudinaryPublicId, tipo });

    const [novo] = await db.insert(arquivos).values({
      demandaId: req.demanda.id,
      cloudinaryPublicId,
      cloudinaryUrl,
      tipo,
      formatoOriginal: String(formatoOriginal).toLowerCase(),
      formatoEntrega,
      ordem,
      horario: horario || null,
      legendaCustom: legendaCustom || null,
      status: 'pendente',
      uploadedBy: req.user.id,
    }).returning();

    // Ao subir o primeiro arquivo, move a demanda de pendente -> em_andamento.
    if (req.demanda.status === 'pendente') {
      await db.update(demandas)
        .set({ status: 'em_andamento', updatedAt: new Date() })
        .where(eq(demandas.id, req.demanda.id));
    }

    await logActivity({
      demandaId: req.demanda.id,
      userId: req.user.id,
      action: 'arquivo.enviado',
      metadata: { arquivoId: novo.id, ordem, tipo },
      ipAddress: req.ip,
    });

    return res.status(201).json({ arquivo: novo });
  } catch (err) {
    console.error('Erro ao registrar arquivo:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /arquivos/demanda/:demandaId — lista arquivos de uma demanda
router.get('/demanda/:demandaId', requireAuth, carregarDemanda, async (req, res) => {
  try {
    const files = await db
      .select()
      .from(arquivos)
      .where(eq(arquivos.demandaId, req.demanda.id))
      .orderBy(arquivos.ordem);
    return res.json({ arquivos: files });
  } catch (err) {
    console.error('Erro ao listar arquivos:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /arquivos/:id/aprovar — admin aprova um arquivo
router.patch('/:id/aprovar', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [arquivo] = await db
      .select()
      .from(arquivos)
      .where(eq(arquivos.id, req.params.id))
      .limit(1);

    if (!arquivo) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    const [updated] = await db
      .update(arquivos)
      .set({ status: 'aprovado' })
      .where(eq(arquivos.id, req.params.id))
      .returning();

    await logActivity({
      demandaId: arquivo.demandaId,
      userId: req.user.id,
      action: 'arquivo.aprovado',
      metadata: { arquivoId: arquivo.id },
      ipAddress: req.ip,
    });

    return res.json({ arquivo: updated });
  } catch (err) {
    console.error('Erro ao aprovar arquivo:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /arquivos/:id/rejeitar — admin rejeita um arquivo
router.patch('/:id/rejeitar', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [arquivo] = await db
      .select()
      .from(arquivos)
      .where(eq(arquivos.id, req.params.id))
      .limit(1);

    if (!arquivo) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    const [updated] = await db
      .update(arquivos)
      .set({ status: 'rejeitado' })
      .where(eq(arquivos.id, req.params.id))
      .returning();

    await logActivity({
      demandaId: arquivo.demandaId,
      userId: req.user.id,
      action: 'arquivo.rejeitado',
      metadata: { arquivoId: arquivo.id, motivo: req.body?.motivo || null },
      ipAddress: req.ip,
    });

    return res.json({ arquivo: updated });
  } catch (err) {
    console.error('Erro ao rejeitar arquivo:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /arquivos/:id — remove do banco e do Cloudinary
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const [arquivo] = await db
      .select()
      .from(arquivos)
      .where(eq(arquivos.id, req.params.id))
      .limit(1);

    if (!arquivo) {
      return res.status(404).json({ error: 'Arquivo não encontrado' });
    }

    // Verifica permissão via demanda dona.
    const [demanda] = await db
      .select()
      .from(demandas)
      .where(eq(demandas.id, arquivo.demandaId))
      .limit(1);

    if (req.user.role === 'operador') {
      if (!demanda || demanda.atribuidoA !== req.user.id) {
        return res.status(403).json({ error: 'Sem permissão' });
      }
      if (ESTADOS_TRAVADOS.includes(demanda.status)) {
        return res.status(400).json({ error: 'Demanda travada neste status' });
      }
    }

    // Remove primeiro do Cloudinary (best-effort), depois do banco.
    await deletarAsset({ publicId: arquivo.cloudinaryPublicId, tipo: arquivo.tipo });
    await db.delete(arquivos).where(eq(arquivos.id, req.params.id));

    await logActivity({
      demandaId: arquivo.demandaId,
      userId: req.user.id,
      action: 'arquivo.deletado',
      metadata: { arquivoId: arquivo.id, publicId: arquivo.cloudinaryPublicId },
      ipAddress: req.ip,
    });

    return res.json({ message: 'Arquivo deletado' });
  } catch (err) {
    console.error('Erro ao deletar arquivo:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
