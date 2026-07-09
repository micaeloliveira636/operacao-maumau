const express = require('express');
const { eq, and, desc } = require('drizzle-orm');
const { db } = require('../db');
const { pushSubscriptions, notificacoes } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { getPublicKey, isConfigured } = require('../utils/push');
const { notificarUsuario } = require('../utils/notify');

const router = express.Router();

// GET /notificacoes/vapid-public-key — chave pública p/ o service worker inscrever
router.get('/vapid-public-key', requireAuth, (req, res) => {
  return res.json({ publicKey: getPublicKey(), enabled: isConfigured() });
});

// POST /notificacoes/subscribe — registra/atualiza uma inscrição de push
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'Inscrição inválida' });
    }

    // Upsert por endpoint (único).
    const [existente] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .limit(1);

    if (existente) {
      await db
        .update(pushSubscriptions)
        .set({ userId: req.user.id, p256dh: keys.p256dh, auth: keys.auth })
        .where(eq(pushSubscriptions.id, existente.id));
    } else {
      await db.insert(pushSubscriptions).values({
        userId: req.user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers['user-agent'] || null,
      });
    }

    return res.status(201).json({ message: 'Inscrição registrada' });
  } catch (err) {
    console.error('Erro ao inscrever push:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /notificacoes/unsubscribe — remove uma inscrição
router.post('/unsubscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) {
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    }
    return res.json({ message: 'Inscrição removida' });
  } catch (err) {
    console.error('Erro ao remover inscrição:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /notificacoes/test — dispara uma notificação de teste pro próprio usuário
router.post('/test', requireAuth, async (req, res) => {
  await notificarUsuario({
    userId: req.user.id,
    titulo: 'Notificação de teste',
    mensagem: 'Se você recebeu isto, as notificações estão funcionando.',
    tipo: 'info',
    url: '/',
  });
  return res.json({ message: 'Notificação de teste enviada' });
});

// GET /notificacoes — feed in-app do usuário
router.get('/', requireAuth, async (req, res) => {
  try {
    const lista = await db
      .select()
      .from(notificacoes)
      .where(eq(notificacoes.userId, req.user.id))
      .orderBy(desc(notificacoes.createdAt))
      .limit(50);
    const naoLidas = lista.filter((n) => !n.lida).length;
    return res.json({ notificacoes: lista, naoLidas });
  } catch (err) {
    console.error('Erro ao listar notificações:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /notificacoes/:id/lida — marca uma como lida
router.patch('/:id/lida', requireAuth, async (req, res) => {
  try {
    await db
      .update(notificacoes)
      .set({ lida: true })
      .where(and(eq(notificacoes.id, req.params.id), eq(notificacoes.userId, req.user.id)));
    return res.json({ message: 'Marcada como lida' });
  } catch (err) {
    console.error('Erro ao marcar notificação:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PATCH /notificacoes/todas-lidas — marca todas como lidas
router.patch('/todas-lidas', requireAuth, async (req, res) => {
  try {
    await db
      .update(notificacoes)
      .set({ lida: true })
      .where(eq(notificacoes.userId, req.user.id));
    return res.json({ message: 'Todas marcadas como lidas' });
  } catch (err) {
    console.error('Erro ao marcar todas:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
