const express = require('express');
const { eq } = require('drizzle-orm');
const { db } = require('../db');
const { usuarios } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { hashPassword, sanitizeUser } = require('../utils/auth');
const { logActivity } = require('../utils/logger');

const router = express.Router();

// GET /usuarios — lista (admin only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await db.select().from(usuarios);
    return res.json({ usuarios: result.map(sanitizeUser) });
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /usuarios — criar (admin only)
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { nome, email, senha, whatsapp, role } = req.body;

    if (!nome || !email || !senha || !whatsapp || !role) {
      return res.status(400).json({ error: 'Campos obrigatórios: nome, email, senha, whatsapp, role' });
    }

    if (!['admin', 'operador'].includes(role)) {
      return res.status(400).json({ error: 'Role deve ser admin ou operador' });
    }

    // Verifica email duplicado
    const [existente] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, email.toLowerCase().trim()))
      .limit(1);

    if (existente) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const [novoUsuario] = await db.insert(usuarios).values({
      nome,
      email: email.toLowerCase().trim(),
      senhaHash: hashPassword(senha),
      whatsapp,
      role,
    }).returning();

    await logActivity({
      userId: req.user.id,
      action: 'usuario.criado',
      metadata: { nome, email, role },
      ipAddress: req.ip,
    });

    return res.status(201).json({ usuario: sanitizeUser(novoUsuario) });
  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /usuarios/:id — editar (admin only)
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, req.params.id))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const updates = {};
    if (req.body.nome) updates.nome = req.body.nome;
    if (req.body.whatsapp) updates.whatsapp = req.body.whatsapp;
    if (req.body.role && ['admin', 'operador'].includes(req.body.role)) updates.role = req.body.role;
    if (typeof req.body.ativo === 'boolean') updates.ativo = req.body.ativo;
    if (req.body.senha) updates.senhaHash = hashPassword(req.body.senha);
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(usuarios)
      .set(updates)
      .where(eq(usuarios.id, req.params.id))
      .returning();

    await logActivity({
      userId: req.user.id,
      action: 'usuario.editado',
      metadata: { editado: user.nome, campos: Object.keys(updates) },
      ipAddress: req.ip,
    });

    return res.json({ usuario: sanitizeUser(updated) });
  } catch (err) {
    console.error('Erro ao editar usuário:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
