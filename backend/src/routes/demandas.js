const express = require('express');
const { eq, desc, and } = require('drizzle-orm');
const { db } = require('../db');
const { demandas, arquivos } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const { notificarUsuario, notificarAdmins } = require('../utils/notify');

const router = express.Router();

// Status válidos e transições permitidas
const TRANSICOES = {
  pendente: ['em_andamento'],
  em_andamento: ['enviado'],
  enviado: ['aprovado', 'rejeitado'],
  rejeitado: ['em_andamento'],
  aprovado: ['agendamento_pendente'],
  agendamento_pendente: ['agendado', 'erro_agendamento'],
  erro_agendamento: ['agendamento_pendente'],
  agendado: ['concluido'],
};

// GET /demandas — lista
router.get('/', requireAuth, async (req, res) => {
  try {
    let query = db.select().from(demandas).orderBy(desc(demandas.createdAt));

    // Operador só vê as suas
    if (req.user.role === 'operador') {
      query = db
        .select()
        .from(demandas)
        .where(eq(demandas.atribuidoA, req.user.id))
        .orderBy(desc(demandas.createdAt));
    }

    const result = await query;
    return res.json({ demandas: result });
  } catch (err) {
    console.error('Erro ao listar demandas:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /demandas/:id — detalhe
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [demanda] = await db
      .select()
      .from(demandas)
      .where(eq(demandas.id, req.params.id))
      .limit(1);

    if (!demanda) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    // Operador só acessa as suas
    if (req.user.role === 'operador' && demanda.atribuidoA !== req.user.id) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    // Busca arquivos da demanda
    const files = await db
      .select()
      .from(arquivos)
      .where(eq(arquivos.demandaId, demanda.id))
      .orderBy(arquivos.ordem);

    return res.json({ demanda, arquivos: files });
  } catch (err) {
    console.error('Erro ao buscar demanda:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /demandas — criar (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      titulo, categoria, descricao, dataAlvo, horarios,
      campanhasDestino, releaseIds, atribuidoA,
      legenda, mencionar, velocidade, prioridade,
    } = req.body;

    if (!titulo || !categoria || !dataAlvo || !horarios || !atribuidoA) {
      return res.status(400).json({ error: 'Campos obrigatórios: titulo, categoria, dataAlvo, horarios, atribuidoA' });
    }

    const [novaDemanda] = await db.insert(demandas).values({
      titulo,
      categoria,
      descricao: descricao || null,
      dataAlvo,
      horarios,
      campanhasDestino: campanhasDestino || [],
      releaseIds: releaseIds || [],
      atribuidoA,
      criadoPor: req.user.id,
      legenda: legenda || null,
      mencionar: mencionar || false,
      velocidade: velocidade || 'slow',
      prioridade: prioridade || 'normal',
    }).returning();

    await logActivity({
      demandaId: novaDemanda.id,
      userId: req.user.id,
      action: 'demanda.criada',
      metadata: { titulo, categoria },
      ipAddress: req.ip,
    });

    // Notifica o operador atribuído.
    if (atribuidoA) {
      notificarUsuario({
        userId: atribuidoA,
        titulo: 'Nova demanda atribuída',
        mensagem: `${titulo} — categoria ${categoria}. Prazo: ${dataAlvo}.`,
        tipo: 'info',
        demandaId: novaDemanda.id,
        url: `/demandas/${novaDemanda.id}`,
      });
    }

    return res.status(201).json({ demanda: novaDemanda });
  } catch (err) {
    console.error('Erro ao criar demanda:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /demandas/:id — editar (admin only)
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [demanda] = await db
      .select()
      .from(demandas)
      .where(eq(demandas.id, req.params.id))
      .limit(1);

    if (!demanda) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    // Não permite editar se já agendada ou concluída
    if (['agendado', 'concluido'].includes(demanda.status)) {
      return res.status(400).json({ error: 'Não é possível editar demanda neste status' });
    }

    const allowedFields = [
      'titulo', 'categoria', 'descricao', 'dataAlvo', 'horarios',
      'campanhasDestino', 'releaseIds', 'atribuidoA',
      'legenda', 'mencionar', 'velocidade', 'prioridade',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(demandas)
      .set(updates)
      .where(eq(demandas.id, req.params.id))
      .returning();

    await logActivity({
      demandaId: updated.id,
      userId: req.user.id,
      action: 'demanda.editada',
      metadata: { campos: Object.keys(updates) },
      ipAddress: req.ip,
    });

    return res.json({ demanda: updated });
  } catch (err) {
    console.error('Erro ao editar demanda:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /demandas/:id/status — mudar status
router.patch('/:id/status', requireAuth, async (req, res) => {
  try {
    const { novoStatus, motivoRejeicao } = req.body;

    const [demanda] = await db
      .select()
      .from(demandas)
      .where(eq(demandas.id, req.params.id))
      .limit(1);

    if (!demanda) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    // Operador só acessa as suas
    if (req.user.role === 'operador' && demanda.atribuidoA !== req.user.id) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    // Valida transição
    const transicoesPermitidas = TRANSICOES[demanda.status] || [];
    if (!transicoesPermitidas.includes(novoStatus)) {
      return res.status(400).json({
        error: `Transição inválida: ${demanda.status} → ${novoStatus}`,
        permitidas: transicoesPermitidas,
      });
    }

    // Ações que requerem admin
    const acoesAdmin = ['aprovado', 'rejeitado', 'agendamento_pendente', 'agendado', 'concluido'];
    if (acoesAdmin.includes(novoStatus) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Apenas admin pode realizar esta ação' });
    }

    // Rejeição requer motivo
    if (novoStatus === 'rejeitado' && !motivoRejeicao) {
      return res.status(400).json({ error: 'Motivo de rejeição é obrigatório' });
    }

    // Enviar pra aprovação: valida se tem arquivos suficientes
    if (novoStatus === 'enviado') {
      const files = await db
        .select()
        .from(arquivos)
        .where(eq(arquivos.demandaId, demanda.id));

      if (files.length === 0) {
        return res.status(400).json({ error: 'Demanda sem arquivos' });
      }

      if (files.length !== demanda.horarios.length) {
        return res.status(400).json({
          error: `Quantidade de arquivos (${files.length}) diferente dos horários (${demanda.horarios.length})`,
        });
      }
    }

    const updates = {
      status: novoStatus,
      updatedAt: new Date(),
    };

    if (novoStatus === 'rejeitado') {
      updates.motivoRejeicao = motivoRejeicao;
    }

    const [updated] = await db
      .update(demandas)
      .set(updates)
      .where(eq(demandas.id, req.params.id))
      .returning();

    await logActivity({
      demandaId: updated.id,
      userId: req.user.id,
      action: `demanda.${novoStatus}`,
      metadata: { de: demanda.status, para: novoStatus, motivo: motivoRejeicao },
      ipAddress: req.ip,
    });

    // Notificações por transição.
    if (novoStatus === 'enviado') {
      notificarAdmins({
        titulo: 'Demanda enviada para aprovação',
        mensagem: `${demanda.titulo} está pronta para revisão.`,
        tipo: 'alerta',
        demandaId: demanda.id,
        url: `/demandas/${demanda.id}`,
      });
    } else if (novoStatus === 'aprovado' && demanda.atribuidoA) {
      notificarUsuario({
        userId: demanda.atribuidoA,
        titulo: 'Demanda aprovada',
        mensagem: `${demanda.titulo} foi aprovada.`,
        tipo: 'sucesso',
        demandaId: demanda.id,
        url: `/demandas/${demanda.id}`,
      });
    } else if (novoStatus === 'rejeitado' && demanda.atribuidoA) {
      notificarUsuario({
        userId: demanda.atribuidoA,
        titulo: 'Demanda rejeitada',
        mensagem: `${demanda.titulo} foi rejeitada. Motivo: ${motivoRejeicao}`,
        tipo: 'erro',
        demandaId: demanda.id,
        url: `/demandas/${demanda.id}`,
      });
    }

    return res.json({ demanda: updated });
  } catch (err) {
    console.error('Erro ao mudar status:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /demandas/:id/agendamento-payload — payload para Claude
router.get('/:id/agendamento-payload', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [demanda] = await db
      .select()
      .from(demandas)
      .where(eq(demandas.id, req.params.id))
      .limit(1);

    if (!demanda) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    if (demanda.status !== 'aprovado') {
      return res.status(400).json({ error: 'Demanda precisa estar aprovada para agendar' });
    }

    // Busca apenas arquivos aprovados
    const files = await db
      .select()
      .from(arquivos)
      .where(and(
        eq(arquivos.demandaId, demanda.id),
        eq(arquivos.status, 'aprovado')
      ))
      .orderBy(arquivos.ordem);

    if (files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo aprovado nesta demanda' });
    }

    // Monta payload
    const campanhas = demanda.campanhasDestino.map((nome, i) => ({
      nome,
      releaseId: demanda.releaseIds[i] || null,
    }));

    const payload = {
      demandaId: demanda.id,
      titulo: demanda.titulo,
      categoria: demanda.categoria,
      dataAlvo: demanda.dataAlvo,
      campanhas,
      mencionar: demanda.mencionar,
      velocidade: demanda.velocidade,
      arquivos: files.map(f => ({
        id: f.id,
        ordem: f.ordem,
        horario: f.horario,
        tipo: f.tipo,
        url: f.cloudinaryUrl,
        legenda: f.legendaCustom || demanda.legenda,
      })),
    };

    return res.json(payload);
  } catch (err) {
    console.error('Erro ao gerar payload:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /demandas/:id — deletar (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [demanda] = await db
      .select()
      .from(demandas)
      .where(eq(demandas.id, req.params.id))
      .limit(1);

    if (!demanda) {
      return res.status(404).json({ error: 'Demanda não encontrada' });
    }

    if (['agendado', 'concluido'].includes(demanda.status)) {
      return res.status(400).json({ error: 'Não é possível deletar demanda agendada ou concluída' });
    }

    await db.delete(demandas).where(eq(demandas.id, req.params.id));

    await logActivity({
      userId: req.user.id,
      action: 'demanda.deletada',
      metadata: { titulo: demanda.titulo },
      ipAddress: req.ip,
    });

    return res.json({ message: 'Demanda deletada' });
  } catch (err) {
    console.error('Erro ao deletar demanda:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
