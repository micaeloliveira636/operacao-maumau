/**
 * Cliente do SendFlow (contrato real).
 *
 *  Auth: header  Authorization: Bearer <token>
 *  Base: https://sendflow.pro
 *  (verificado contra a API real: cf1.sendflow.pro e x-api-key retornam 404/401)
 *
 *  GET  /sendapi/releases/{releaseId}                      -> { accountIds: [...] }
 *  POST /sendapi/actions/send-text-message/{accountId}     -> { releaseId, messageText, scheduledTo, options }
 *  POST /sendapi/actions/send-image-message/{accountId}    -> { releaseId, url, caption, scheduledTo, options }
 *  POST /sendapi/actions/send-video-message/{accountId}    -> idem imagem
 *  POST /sendapi/actions/delete                            -> { actions: [actionId, ...] }
 *
 *  options = { shippingSpeed: slow|normal|fast|none, mentionAll: boolean }
 *
 * O ENVIO é POR CONTA: uma chamada para cada accountId do release.
 * Toda config (URL, token, paths) vem da tabela `configuracoes` (Ajustes),
 * com fallback para variáveis de ambiente.
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

async function fetchComTimeout(url, opts = {}, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Chips (accountIds) da campanha — fonte autoritativa é o `release.accountIds`
 * (confirmado no manual e testado: ATIVOS 2 = 5 chips). Buscar SEMPRE fresco,
 * pois os chips caem/entram ao longo do dia. Vazio = campanha sem chips agora
 * (ex.: caíram todos) — o chamador deve pular/avisar, NÃO usar outros chips.
 */
async function buscarAccountIds(releaseId) {
  const b = await base();
  const H = await headers();
  const relPath = (await cfg.get('sendflow_releases_path')) || '/releases/:releaseId';
  const relUrl = b + relPath.replace(':releaseId', encodeURIComponent(releaseId));

  const rr = await fetchComTimeout(relUrl, { headers: H });
  if (!rr.ok) {
    const txt = await rr.text().catch(() => '');
    throw new Error(`Release ${releaseId}: ${rr.status} ${txt.slice(0, 160)}`);
  }
  const rel = await rr.json().catch(() => ({}));
  const ids = Array.isArray(rel.accountIds) ? rel.accountIds.filter(Boolean).map(String) : [];
  if (ids.length === 0) {
    throw new Error(`Campanha sem chips no momento (accountIds vazio) — release ${releaseId}`);
  }
  return ids;
}

/**
 * Agenda UMA ação para UMA conta (o SendFlow envia por accountId).
 * @returns {Promise<{ok, actionId?, error?, raw?}>}
 */
async function agendarAcao({
  tipo, // 'text' | 'image' | 'video'
  accountId,
  releaseId,
  url, // mídia (image/video)
  mensagem, // texto (text) ou legenda/caption (mídia)
  scheduledTo, // ISO 8601 com offset -03:00
  shippingSpeed,
  mentionAll,
}) {
  const b = await base();
  const acoes = (await cfg.get('sendflow_send_path')) || '/actions';
  // Envio de CAMPANHA: /actions/send-{tipo}-message  (accountIds no corpo).
  const endpoint = `${b}${acoes}/send-${tipo}-message`;

  const options = { shippingSpeed: shippingSpeed || 'slow' };
  const comum = { releaseId, accountIds: [String(accountId)], scheduledTo, options };
  const body =
    tipo === 'text'
      ? { ...comum, messageText: mensagem || '' }
      : { ...comum, url, caption: mensagem || '' };

  // OBS: a menção a todos (mentionAll) NÃO existe neste endpoint simples —
  // quando pedida, o motor roteia para `agendarComMencao` (/actions/send-messages).
  // Aqui o parâmetro é ignorado de propósito.
  void mentionAll;

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
    if (!resp.ok) return { ok: false, error: `${resp.status}: ${raw.slice(0, 200)}` };

    const actionId =
      json.actionId || json.id || json.data?.actionId || json.data?.id || json.action?.id || null;
    return { ok: true, actionId, raw: json };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Agenda um envio COM MENÇÃO A TODOS (marca todo o grupo).
 * A menção só existe no endpoint batch /actions/send-messages e exige a mídia
 * SEPARADA do texto: manda a mídia (sem legenda) e depois o texto marcando todos.
 * Uma chamada por conta (accountId), igual ao `agendarAcao`.
 * @returns {Promise<{ok, actionId?, error?, raw?}>}
 */
async function agendarComMencao({
  tipo, // 'text' | 'image' | 'video'
  accountId,
  releaseId,
  url, // mídia (image/video); ignorado se tipo 'text'
  mensagem, // o texto que marca todos
  scheduledTo,
  shippingSpeed,
}) {
  const b = await base();
  const acoes = (await cfg.get('sendflow_send_path')) || '/actions';
  const endpoint = `${b}${acoes}/send-messages`;

  const messages = [];
  // mídia primeiro, sem legenda (o texto vai separado pra poder mencionar)
  if (tipo !== 'text' && url) {
    const chave = tipo === 'video' ? 'video' : 'image';
    messages.push({ type: `${chave}Message`, message: { [chave]: { url }, caption: '' } });
  }
  // texto que marca todo o grupo
  messages.push({
    type: 'extendedTextMessage',
    message: { text: mensagem || '' },
    options: { mentionAllParticipants: true },
  });

  const body = {
    releaseId,
    accountsFrom: 'accounts',
    accounts: [String(accountId)],
    to: { type: 'release', ids: [releaseId] },
    data: { messages },
    scheduledTo,
    options: { shippingSpeed: shippingSpeed || 'slow' },
  };

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
    if (!resp.ok) return { ok: false, error: `${resp.status}: ${raw.slice(0, 200)}` };

    const actionId =
      json.id || json.actionId || json.data?.id || json.data?.actionId || json.action?.id || null;
    return { ok: true, actionId, raw: json };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/** POST /sendapi/actions/delete — remove ações agendadas. */
async function deletarAcoes(actionIds) {
  if (!Array.isArray(actionIds) || actionIds.length === 0) return { ok: true, deletadas: 0 };
  const b = await base();
  const acoes = (await cfg.get('sendflow_send_path')) || '/actions';
  try {
    const resp = await fetchComTimeout(`${b}${acoes}/delete`, {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({ actions: actionIds }),
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => '');
      return { ok: false, error: `${resp.status}: ${t.slice(0, 160)}` };
    }
    return { ok: true, deletadas: actionIds.length };
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

/**
 * Chip dedicado de avisos (opcional).
 * OBS: a API do SendFlow envia para um RELEASE, não para um número avulso.
 * Só funciona se houver um release/chip dedicado configurado.
 */
async function enviarNotificacaoWhatsapp({ whatsapp, mensagem }) {
  const [b, chip, token] = await Promise.all([
    base(),
    cfg.get('sendflow_notify_account'),
    cfg.get('sendflow_api_token'),
  ]);
  if (!b || !chip || !token) {
    return { ok: false, skipped: true, error: 'Chip de notificação não configurado' };
  }
  const numero = normalizarNumero(whatsapp);
  if (!numero) return { ok: false, skipped: true, error: 'WhatsApp ausente' };

  const path = (await cfg.get('sendflow_notify_path')) || '/sendapi/actions/send-text-message';
  try {
    const resp = await fetchComTimeout(
      `${b}${path}/${encodeURIComponent(chip)}`,
      {
        method: 'POST',
        headers: await headers(),
        body: JSON.stringify({ phone: numero, number: numero, messageText: mensagem }),
      },
      10000
    );
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
  agendarComMencao,
  deletarAcoes,
  testarConexao,
  estaConfigurado,
  enviarNotificacaoWhatsapp,
};
