const express = require('express');
const { eq, desc } = require('drizzle-orm');
const { db } = require('../db');
const { copysLancamento } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');

const router = express.Router();

const TIPOS_VALIDOS = ['sistema', 'anuncio', 'parceria'];

// GET /copys — lista todas (qualquer usuário autenticado pode consultar)
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await db
      .select()
      .from(copysLancamento)
      .orderBy(desc(copysLancamento.ativo), copysLancamento.ordem, desc(copysLancamento.createdAt));
    return res.json({ copys: result });
  } catch (err) {
    console.error('Erro ao listar copys:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /copys/:id — detalhe
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [copy] = await db
      .select()
      .from(copysLancamento)
      .where(eq(copysLancamento.id, req.params.id))
      .limit(1);
    if (!copy) return res.status(404).json({ error: 'Copy não encontrada' });
    return res.json({ copy });
  } catch (err) {
    console.error('Erro ao buscar copy:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /copys — criar (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { nome, conteudo, ordem, ativo, tipo } = req.body;

    if (!nome || !conteudo) {
      return res.status(400).json({ error: 'Campos obrigatórios: nome, conteudo' });
    }
    if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
      return res.status(400).json({ error: `tipo deve ser um de: ${TIPOS_VALIDOS.join(', ')}` });
    }

    const [nova] = await db.insert(copysLancamento).values({
      nome,
      conteudo,
      ordem: ordem ?? 0,
      ativo: ativo ?? false,
      tipo: tipo || null,
    }).returning();

    await logActivity({
      userId: req.user.id,
      action: 'copy.criada',
      metadata: { nome, tipo },
      ipAddress: req.ip,
    });

    return res.status(201).json({ copy: nova });
  } catch (err) {
    console.error('Erro ao criar copy:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /copys/:id — editar (admin only)
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [copy] = await db
      .select()
      .from(copysLancamento)
      .where(eq(copysLancamento.id, req.params.id))
      .limit(1);
    if (!copy) return res.status(404).json({ error: 'Copy não encontrada' });

    const updates = {};
    if (req.body.nome !== undefined) updates.nome = req.body.nome;
    if (req.body.conteudo !== undefined) updates.conteudo = req.body.conteudo;
    if (req.body.ordem !== undefined) updates.ordem = req.body.ordem;
    if (typeof req.body.ativo === 'boolean') updates.ativo = req.body.ativo;
    if (req.body.tipo !== undefined) {
      if (req.body.tipo && !TIPOS_VALIDOS.includes(req.body.tipo)) {
        return res.status(400).json({ error: `tipo inválido` });
      }
      updates.tipo = req.body.tipo || null;
    }
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(copysLancamento)
      .set(updates)
      .where(eq(copysLancamento.id, req.params.id))
      .returning();

    await logActivity({
      userId: req.user.id,
      action: 'copy.editada',
      metadata: { id: copy.id, campos: Object.keys(updates) },
      ipAddress: req.ip,
    });

    return res.json({ copy: updated });
  } catch (err) {
    console.error('Erro ao editar copy:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// DELETE /copys/:id — deletar (admin only)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [copy] = await db
      .select()
      .from(copysLancamento)
      .where(eq(copysLancamento.id, req.params.id))
      .limit(1);
    if (!copy) return res.status(404).json({ error: 'Copy não encontrada' });

    await db.delete(copysLancamento).where(eq(copysLancamento.id, req.params.id));

    await logActivity({
      userId: req.user.id,
      action: 'copy.deletada',
      metadata: { nome: copy.nome },
      ipAddress: req.ip,
    });

    return res.json({ message: 'Copy deletada' });
  } catch (err) {
    console.error('Erro ao deletar copy:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
