const { eq } = require('drizzle-orm');
const { db } = require('../db');
const { pushSubscriptions, notificacoes, usuarios } = require('../db/schema');
const { enviarPush } = require('./push');
const { enviarNotificacaoWhatsapp } = require('./sendflow');

/**
 * Notifica um usuário por todos os canais disponíveis:
 *  1. Registra a notificação in-app (sino do painel)
 *  2. Dispara Web Push para todas as inscrições do usuário
 *  3. Dispara mensagem WhatsApp pelo chip dedicado do SendFlow
 *
 * Tudo best-effort: nenhum canal derruba o fluxo principal.
 */
async function notificarUsuario({
  userId,
  titulo,
  mensagem,
  tipo = 'info',
  demandaId = null,
  url = '/',
  canais = { inApp: true, push: true, whatsapp: true },
}) {
  if (!userId) return;

  // 1. In-app
  if (canais.inApp !== false) {
    try {
      await db.insert(notificacoes).values({
        userId,
        demandaId,
        titulo,
        mensagem,
        tipo,
        url,
      });
    } catch (err) {
      console.error('Erro ao registrar notificação in-app:', err.message);
    }
  }

  // Busca dados do usuário (whatsapp) e inscrições em paralelo.
  const [[usuario], subs] = await Promise.all([
    db.select().from(usuarios).where(eq(usuarios.id, userId)).limit(1),
    db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)),
  ]).catch(() => [[null], []]);

  // 2. Web Push
  if (canais.push !== false && subs.length) {
    const payload = { titulo, mensagem, tipo, url, demandaId };
    await Promise.all(
      subs.map(async (sub) => {
        const { gone } = await enviarPush(sub, payload);
        if (gone) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)).catch(() => {});
        }
      })
    );
  }

  // 3. SendFlow (chip dedicado)
  if (canais.whatsapp !== false && usuario?.whatsapp) {
    const texto = `*${titulo}*\n\n${mensagem}`;
    enviarNotificacaoWhatsapp({ whatsapp: usuario.whatsapp, mensagem: texto })
      .catch((err) => console.error('Erro SendFlow notify:', err.message));
  }
}

/** Notifica todos os admins ativos (usado quando operador envia p/ aprovação). */
async function notificarAdmins(params) {
  try {
    const admins = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.role, 'admin'));
    await Promise.all(
      admins
        .filter((a) => a.ativo)
        .map((a) => notificarUsuario({ ...params, userId: a.id }))
    );
  } catch (err) {
    console.error('Erro ao notificar admins:', err.message);
  }
}

module.exports = { notificarUsuario, notificarAdmins };
