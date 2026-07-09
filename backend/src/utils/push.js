const webpush = require('web-push');

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@maumau.com';

let configured = false;

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
    configured = true;
  } catch (err) {
    console.error('Falha ao configurar VAPID:', err.message);
  }
} else {
  console.warn('VAPID não configurado — push notifications desativadas.');
}

/**
 * Envia uma notificação push para uma inscrição.
 * Retorna { ok, gone } — gone=true quando a inscrição expirou (404/410)
 * e deve ser removida do banco.
 */
async function enviarPush(subscription, payload) {
  if (!configured) return { ok: false, gone: false };

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload)
    );
    return { ok: true, gone: false };
  } catch (err) {
    const gone = err.statusCode === 404 || err.statusCode === 410;
    if (!gone) console.error('Erro ao enviar push:', err.statusCode, err.body || err.message);
    return { ok: false, gone };
  }
}

function isConfigured() {
  return configured;
}

function getPublicKey() {
  return VAPID_PUBLIC || null;
}

module.exports = { enviarPush, isConfigured, getPublicKey };
