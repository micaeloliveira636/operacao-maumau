/**
 * Cliente do SendFlow usado pelo painel para:
 *  1. buscar accountIds de um release (antes de cada envio)
 *  2. agendar ações (texto/imagem/vídeo) diretamente na API
 *  3. enviar notificações operacionais pelo chip dedicado
 *
 * Toda a configuração (URL base, token, paths, chip) vem da tabela
 * `configuracoes` (editável em Ajustes) com fallback para variáveis de ambiente.
 *
 * IMPORTANTE: o contrato exato do endpoint de ENVIO do SendFlow pode variar.
 * Por isso o path de envio e o formato são centralizados aqui e o path é
 * configurável. Se o SendFlow usar outro caminho/campo, ajuste em um lugar só.
 */
const cfg = require('./config');

function normalizarNumero(whatsapp) {
  return String(whatsapp || '').replace(/\D/g, '');
}

async function base() {
  const url = (await cfg.get('sendflow_api_url')) || '';
  return url.replace(/\/$/, '');
}

async function headers() {
  const token = await cfg.get('sendflow_api_token');
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function estaConfigurado() {
  const [url, token] = await Promise.all([
    cfg.get('sendflow_api_url'),
    cfg.get('sendflow_api_token'),
  ]);
  return Boolean(url && token);
}

async function fetchComTimeout(url, opts = {}, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Busca os accountIds "frescos" de um release.
 * GET {base}{releases_path com :releaseId substituído}
 * Tenta extrair accountIds de vários formatos comuns de resposta.
 */
async function buscarAccountIds(releaseId) {
  const b = await base();
  const path = (await cfg.get('sendflow_releases_path')) || '/sendapi/releases/:releaseId';
  const url = b + path.replace(':releaseId', encodeURIComponent(releaseId));

  const resp = await fetchComTimeout(url, { headers: await headers() });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Falha ao buscar release ${releaseId}: ${resp.status} ${txt.slice(0, 160)}`);
  }
  const json = await resp.json().catch(() => ({}));

  // formatos aceitos: {accountIds:[]} | {accounts:[{id}]} | {data:{accountIds}} | {release:{accountIds}}
  const cand =
    json.accountIds ||
    json.data?.accountIds ||
    json.release?.accountIds ||
    (Array.isArray(json.accounts) ? json.accounts.map((a) => a.id || a.accountId) : null) ||
    (Array.isArray(json.data?.accounts) ? json.data.accounts.map((a) => a.id || a.accountId) : null);

  if (!Array.isArray(cand) || cand.length === 0) {
    throw new Error(`Release ${releaseId} sem accountIds na resposta`);
  }
  return cand.filter(Boolean).map(String);
}

/**
 * Agenda uma ação no SendFlow.
 * POST {base}{send_path} com o corpo montado a partir dos parâmetros.
 * @returns {Promise<{ok, actionId?, error?, raw?}>}
 */
async function agendarAcao({
  tipo, // 'text' | 'image' | 'video'
  releaseId,
  accountIds,
  url, // URL da mídia (image/video)
  mensagem, // texto (text) ou legenda da mídia
  scheduledTo, // ISO 8601 com offset
  shippingSpeed, // slow | normal | fast | none
  mentionAll, // boolean
}) {
  const b = await base();
  const path = (await cfg.get('sendflow_send_path')) || '/sendapi/actions';
  const endpoint = b + path;

  const body = {
    type: tipo,
    releaseId,
    accountIds,
    scheduledTo,
    shippingSpeed,
    mentionAll: Boolean(mentionAll),
  };
  if (tipo === 'text') {
    body.message = mensagem;
    body.text = mensagem;
  } else {
    body.url = url;
    body.mediaUrl = url;
    body.caption = mensagem || '';
    body.message = mensagem || '';
  }

  try {
    const resp = await fetchComTimeout(endpoint, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify(body),
    });
    const raw = await resp.text().catch(() => '');
    let json = {};
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      json = { raw };
    }
    if (!resp.ok) {
      return { ok: false, error: `${resp.status}: ${raw.slice(0, 200)}` };
    }
    const actionId =
      json.actionId || json.id || json.data?.actionId || json.data?.id || null;
    return { ok: true, actionId, raw: json };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Testa a conexão buscando um release conhecido. */
async function testarConexao(releaseId) {
  if (!(await estaConfigurado())) {
    return { ok: false, error: 'SendFlow não configurado (URL e token)' };
  }
  try {
    const ids = await buscarAccountIds(releaseId);
    return { ok: true, accountIds: ids.length, exemplo: ids.slice(0, 3) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** Chip dedicado: mensagem de texto direta para um número (notificações). */
async function enviarNotificacaoWhatsapp({ whatsapp, mensagem }) {
  const [b, chip] = await Promise.all([base(), cfg.get('sendflow_notify_account')]);
  if (!b || !chip || !(await cfg.get('sendflow_api_token'))) {
    return { ok: false, skipped: true, error: 'Chip de notificação não configurado' };
  }
  const numero = normalizarNumero(whatsapp);
  if (!numero) return { ok: false, skipped: true, error: 'WhatsApp ausente' };

  const path = (await cfg.get('sendflow_notify_path')) || '/sendapi/messages/text';
  const url = b + path;
  const body = { accountId: chip, phone: numero, number: numero, message: mensagem, text: mensagem };

  try {
    const resp = await fetchComTimeout(url, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify(body),
    }, 10000);
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return { ok: false, error: `${resp.status}: ${t.slice(0, 160)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  buscarAccountIds,
  agendarAcao,
  testarConexao,
  estaConfigurado,
  enviarNotificacaoWhatsapp,
};
