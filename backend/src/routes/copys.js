const express = require('express');
const { eq, asc, desc } = require('drizzle-orm');
const { db } = require('../db');
const { copyFolders, copyMensagens } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const cloudinary = require('../utils/cloudinary');
const sendflow = require('../utils/sendflow');

const router = express.Router();

const TIPOS_MSG = ['text', 'image', 'video', 'audio'];

// ───────────────────────── PASTAS ─────────────────────────

// GET /copys/folders — lista pastas com contagem de mensagens
router.get('/folders', requireAuth, async (req, res) => {
  try {
    const folders = await db.select().from(copyFolders).orderBy(desc(copyFolders.createdAt));
    const msgs = await db.select({ id: copyMensagens.id, folderId: copyMensagens.folderId }).from(copyMensagens);
    const cont = {};
    for (const m of msgs) cont[m.folderId] = (cont[m.folderId] || 0) + 1;
    return res.json({ folders: folders.map((f) => ({ ...f, totalMensagens: cont[f.id] || 0 })) });
  } catch (err) {
    console.error('Erro ao listar pastas de copy:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /copys/folders/:id — pasta + mensagens (ordenadas)
router.get('/folders/:id', requireAuth, async (req, res) => {
  try {
    const [folder] = await db.select().from(copyFolders).where(eq(copyFolders.id, req.params.id)).limit(1);
    if (!folder) return res.status(404).json({ error: 'Pasta não encontrada' });
    const mensagens = await db
      .select().from(copyMensagens)
      .where(eq(copyMensagens.folderId, folder.id))
      .orderBy(asc(copyMensagens.ordem));
    return res.json({ folder, mensagens });
  } catch (err) {
    console.error('Erro ao buscar pasta de copy:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /copys/folders — criar pasta (admin)
router.post('/folders', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { nome, descricao } = req.body || {};
    if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'Nome obrigatório' });
    const [nova] = await db.insert(copyFolders).values({ nome: String(nome).trim(), descricao: descricao || null }).returning();
    await logActivity({ userId: req.user.id, action: 'copy.pasta.criada', metadata: { nome }, ipAddress: req.ip });
    return res.status(201).json({ folder: { ...nova, totalMensagens: 0 } });
  } catch (err) {
    console.error('Erro ao criar pasta de copy:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /copys/folders/:id — renomear (admin)
router.patch('/folders/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const updates = { updatedAt: new Date() };
    if (req.body.nome !== undefined) updates.nome = String(req.body.nome).trim();
    if (req.body.descricao !== undefined) updates.descricao = req.body.descricao || null;
    const [f] = await db.update(copyFolders).set(updates).where(eq(copyFolders.id, req.params.id)).returning();
    if (!f) return res.status(404).json({ error: 'Pasta não encontrada' });
    return res.json({ folder: f });
  } catch (err) {
    console.error('Erro ao editar pasta de copy:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /copys/folders/:id — apaga a pasta e as mensagens (cascade)
router.delete('/folders/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [f] = await db.select().from(copyFolders).where(eq(copyFolders.id, req.params.id)).limit(1);
    if (!f) return res.status(404).json({ error: 'Pasta não encontrada' });
    await db.delete(copyFolders).where(eq(copyFolders.id, req.params.id));
    await logActivity({ userId: req.user.id, action: 'copy.pasta.deletada', metadata: { nome: f.nome }, ipAddress: req.ip });
    return res.json({ message: 'Pasta deletada' });
  } catch (err) {
    console.error('Erro ao deletar pasta de copy:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /copys/folders/:id/assinatura — assinatura Cloudinary p/ subir mídia da pasta
router.post('/folders/:id/assinatura', requireAuth, requireAdmin, async (req, res) => {
  try {
    return res.json(cloudinary.assinarUploadCopy(req.params.id));
  } catch (err) {
    console.error('Erro ao assinar upload de copy:', err);
    return res.status(500).json({ error: err.message || 'Erro interno' });
  }
});

// ──────────────────────── MENSAGENS ────────────────────────

// POST /copys/folders/:id/mensagens — adiciona mensagem na pasta (admin)
router.post('/folders/:id/mensagens', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [folder] = await db.select().from(copyFolders).where(eq(copyFolders.id, req.params.id)).limit(1);
    if (!folder) return res.status(404).json({ error: 'Pasta não encontrada' });

    const { tipo, texto, offsetMin, publicId, format } = req.body || {};
    if (!TIPOS_MSG.includes(tipo)) return res.status(400).json({ error: `tipo deve ser: ${TIPOS_MSG.join(', ')}` });

    let url = null;
    if (tipo !== 'text') {
      if (!publicId) return res.status(400).json({ error: 'Mídia sem publicId (faça o upload primeiro)' });
      url = cloudinary.urlEntregaCopy({ publicId, tipo, format });
    } else if (!String(texto || '').trim()) {
      return res.status(400).json({ error: 'Texto obrigatório' });
    }

    // nova mensagem vai pro fim (maior ordem + 1)
    const existentes = await db.select({ ordem: copyMensagens.ordem }).from(copyMensagens).where(eq(copyMensagens.folderId, folder.id));
    const proxOrdem = existentes.reduce((mx, m) => Math.max(mx, m.ordem), -1) + 1;

    const [nova] = await db.insert(copyMensagens).values({
      folderId: folder.id,
      ordem: proxOrdem,
      tipo,
      texto: texto || null,
      url,
      offsetMin: Number.isFinite(+offsetMin) ? Math.max(0, +offsetMin) : 0,
    }).returning();
    return res.status(201).json({ mensagem: nova });
  } catch (err) {
    console.error('Erro ao criar mensagem de copy:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /copys/mensagens/:id — edita texto/offset/ordem (admin)
router.patch('/mensagens/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const updates = {};
    if (req.body.texto !== undefined) updates.texto = req.body.texto || null;
    if (req.body.offsetMin !== undefined) updates.offsetMin = Math.max(0, +req.body.offsetMin || 0);
    if (req.body.ordem !== undefined) updates.ordem = +req.body.ordem || 0;
    const [m] = await db.update(copyMensagens).set(updates).where(eq(copyMensagens.id, req.params.id)).returning();
    if (!m) return res.status(404).json({ error: 'Mensagem não encontrada' });
    return res.json({ mensagem: m });
  } catch (err) {
    console.error('Erro ao editar mensagem de copy:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /copys/mensagens/:id (admin)
router.delete('/mensagens/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [m] = await db.select().from(copyMensagens).where(eq(copyMensagens.id, req.params.id)).limit(1);
    if (!m) return res.status(404).json({ error: 'Mensagem não encontrada' });
    await db.delete(copyMensagens).where(eq(copyMensagens.id, req.params.id));
    return res.json({ message: 'Mensagem deletada' });
  } catch (err) {
    console.error('Erro ao deletar mensagem de copy:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// ─────────────────── GRUPOS (p/ escolher no envio) ───────────────────

// GET /copys/grupos?releaseId=... — grupos da campanha (id/gid/nome)
router.get('/grupos', requireAuth, requireAdmin, async (req, res) => {
  try {
    const releaseId = req.query.releaseId;
    if (!releaseId) return res.status(400).json({ error: 'releaseId obrigatório' });
    // Cache de 60s (SEM fresh): escolher grupo não precisa de dado fresco, e
    // forçar fresh a cada troca de campanha estourava o rate limit / bloqueio.
    const grupos = await sendflow.buscarGrupos(releaseId);
    return res.json({ grupos });
  } catch (err) {
    return res.status(502).json({ error: err.message || 'Falha ao buscar grupos' });
  }
});

// ─────────────────────────── ENVIO ───────────────────────────

// POST /copys/folders/:id/enviar — agenda TODAS as mensagens em cascata pros
// grupos escolhidos (em dia normal a copy sai pra 2-3 grupos de uma vez).
// body: { releaseId, grupoIds: [gid], data 'YYYY-MM-DD', hora 'HH:mm' }
// Aceita `grupoId` solto por compatibilidade com o formato antigo.
router.post('/folders/:id/enviar', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { releaseId, grupoIds, grupoId, data, hora } = req.body || {};
    const gids = [...new Set((Array.isArray(grupoIds) ? grupoIds : [grupoId]).filter(Boolean))];
    if (!releaseId || gids.length === 0) return res.status(400).json({ error: 'releaseId e ao menos um grupo obrigatórios' });
    if (!data || !hora) return res.status(400).json({ error: 'data e hora de início obrigatórias' });

    const [folder] = await db.select().from(copyFolders).where(eq(copyFolders.id, req.params.id)).limit(1);
    if (!folder) return res.status(404).json({ error: 'Pasta não encontrada' });

    const mensagens = await db.select().from(copyMensagens)
      .where(eq(copyMensagens.folderId, folder.id)).orderBy(asc(copyMensagens.ordem));
    if (mensagens.length === 0) return res.status(400).json({ error: 'Pasta sem mensagens' });

    // início em ISO -03:00; cascata soma os offsets em ms
    const inicioMs = new Date(`${data}T${hora}:00-03:00`).getTime();
    if (!Number.isFinite(inicioMs)) return res.status(400).json({ error: 'Data/hora inválida' });
    if (inicioMs <= Date.now()) return res.status(400).json({ error: 'A hora de início já passou — escolha um horário futuro' });

    if (!(await sendflow.estaConfigurado())) return res.status(400).json({ error: 'SendFlow não configurado (Ajustes)' });

    let accountIds;
    try {
      accountIds = await sendflow.buscarAccountIds(releaseId, { fresh: true });
    } catch (e) {
      return res.status(502).json({ error: `Campanha sem chips agora: ${e.message}` });
    }

    const resultados = { agendadas: 0, erros: [], plano: [] };
    let t = inicioMs;
    for (let i = 0; i < mensagens.length; i++) {
      const m = mensagens[i];
      if (i > 0) t += (m.offsetMin || 0) * 60000;
      const scheduledTo = new Date(t).toISOString();

      const envio = await sendflow.agendarAcao({
        tipo: m.tipo,
        accountIds,
        releaseId,
        url: m.tipo === 'text' ? null : m.url,
        mensagem: m.texto || '',
        scheduledTo,
        shippingSpeed: 'slow',
        grupoIds: gids,
      });

      if (!envio.ok) {
        // rate limit / bloqueio de key: para o lote (não adianta insistir)
        if (/api-key-blocked|rate-limit-exceeded|\b429\b/i.test(envio.error || '')) {
          resultados.erros.push(`Interrompido no #${i + 1}: ${envio.error}. O que já foi agendado está salvo.`);
          break;
        }
        resultados.erros.push(`Mensagem #${i + 1}: ${envio.error}`);
        continue;
      }
      resultados.agendadas += 1;
      resultados.plano.push({ ordem: m.ordem, tipo: m.tipo, scheduledTo });
    }

    await logActivity({
      userId: req.user.id, action: 'copy.enviada',
      metadata: { folder: folder.nome, grupoIds: gids, agendadas: resultados.agendadas },
      ipAddress: req.ip,
    });

    return res.json({ ok: resultados.erros.length === 0 && resultados.agendadas > 0, ...resultados });
  } catch (err) {
    console.error('Erro ao enviar copy:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
