/**
 * Cliente do "chip dedicado" do SendFlow para notificações operacionais.
 *
 * Este é um número/conta separado do fluxo de campanhas — serve só para avisar
 * os operadores por WhatsApp ("Nova demanda atribuída", "Demanda aprovada", etc).
 *
 * A integração é 100% best-effort: se o SendFlow falhar ou não estiver configurado,
 * o painel continua funcionando normalmente (a notificação PWA é o canal primário).
 *
 * Variáveis de ambiente:
 *  SENDFLOW_API_URL          base da API (ex.: https://api.sendflow.pro)
 *  SENDFLOW_API_KEY          token de autenticação (Bearer)
 *  SENDFLOW_NOTIFY_PATH      caminho do endpoint de envio de texto direto
 *                            (default: /v1/messages/text)
 *  SENDFLOW_NOTIFY_ACCOUNT   id da conta/chip dedicado que dispara os avisos
 */

const API_URL = (process.env.SENDFLOW_API_URL || '').replace(/\/$/, '');
const API_KEY = process.env.SENDFLOW_API_KEY;
const NOTIFY_PATH = process.env.SENDFLOW_NOTIFY_PATH || '/v1/messages/text';
const NOTIFY_ACCOUNT = process.env.SENDFLOW_NOTIFY_ACCOUNT;

function isConfigured() {
  return Boolean(API_URL && API_KEY && NOTIFY_ACCOUNT);
}

// Normaliza número de WhatsApp para dígitos (com DDI).
function normalizarNumero(whatsapp) {
  return String(whatsapp || '').replace(/\D/g, '');
}

/**
 * Envia uma mensagem de texto pelo chip dedicado.
 * @returns {Promise<{ok:boolean, skipped?:boolean, error?:string}>}
 */
async function enviarNotificacaoWhatsapp({ whatsapp, mensagem }) {
  if (!isConfigured()) {
    return { ok: false, skipped: true, error: 'SendFlow não configurado' };
  }
  const numero = normalizarNumero(whatsapp);
  if (!numero) {
    return { ok: false, skipped: true, error: 'WhatsApp do destinatário ausente' };
  }

  const url = `${API_URL}${NOTIFY_PATH}`;
  const body = {
    accountId: NOTIFY_ACCOUNT,
    phone: numero,
    number: numero,
    message: mensagem,
    text: mensagem,
  };

  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 10000);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const detalhe = await resp.text().catch(() => '');
      return { ok: false, error: `SendFlow ${resp.status}: ${detalhe.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { enviarNotificacaoWhatsapp, isConfigured };
