/**
 * Cliente do SendFlow (contrato real, verificado ponta-a-ponta).
 *
 *  Auth: header  Authorization: Bearer <token>
 *  Base: https://sendapi.sendflow.pro   (accountId vai NO CORPO, nunca na URL)
 *
 *  GET  /releases/{releaseId}          -> { accountIds: [...] }  (chips da campanha)
 *  POST /actions/send-{text|image|video}-message
 *         body { releaseId, accountIds:[...], messageText | url+caption, scheduledTo, options } -> { id }
 *  POST /actions/send-messages         (batch; usado só p/ MENÇÃO — mídia separada do texto)
 *  POST /actions/delete                -> { actions: [actionId, ...] }
 *
 *  options = { shippingSpeed: slow|normal|fast|none }
 *
 * UMA AÇÃO POR CAMPANHA: uma única chamada com TODOS os accountIds no array
 * (o SendFlow distribui o envio entre os chips). NÃO enviar um chip por chamada
 * — isso cria N ações e o grupo recebe a mensagem N vezes.
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

// Throttle global: garante um intervalo mínimo entre chamadas ao SendFlow
// (evita estourar o rate limit por segundo no "Montar o dia").
let ultimaChamada = 0;
const INTERVALO_MIN_MS = 650;
async function respeitarIntervalo() {
  const espera = ultimaChamada + INTERVALO_MIN_MS - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimaChamada = Date.now();
}

// Cache local do bloqueio de API key: quando o SendFlow devolve api-key-blocked,
// guardamos até quando não adianta chamar. Enquanto bloqueado, curto-circuitamos
// SEM bater na API (cada request durante o bloqueio estende a punição).
let bloqueadoAte = 0;
function respostaBloqueada() {
  const restante = Math.max(0, bloqueadoAte - Date.now());
  const body = JSON.stringify({ code: 'api-key-blocked', message: 'api-key-blocked (cache local)', retryAfterMs: restante });
  return { ok: false, status: 403, async text() { return body; }, clone() { return this; } };
}

// Fetch com throttle + retry automático quando o SendFlow responde
// 403 rate-limit-exceeded (limite TEMPORÁRIO, diferente do api-key-blocked).
// Espera o retryAfterMs (com teto) e tenta de novo. NÃO faz retry em
// api-key-blocked (bloqueio longo — registra bloqueadoAte e para de chamar).
async function fetchSendflow(url, opts = {}, ms = 20000) {
  if (Date.now() < bloqueadoAte) return respostaBloqueada();
  for (let tentativa = 0; ; tentativa++) {
    await respeitarIntervalo();
    const resp = await fetchComTimeout(url, opts, ms);
    if (resp.status === 403) {
      const txt = await resp.clone().text().catch(() => '');
      if (/api-key-blocked/i.test(txt)) {
        const m = txt.match(/retryAfterMs"?\s*:\s*(\d+)/);
        bloqueadoAte = Date.now() + Math.min(m ? Number(m[1]) : 3600000, 24 * 3600000);
        return resp;
      }
      if (/rate-limit-exceeded/i.test(txt) && tentativa < 2) {
        const m = txt.match(/retryAfterMs"?\s*:\s*(\d+)/);
        const espera = Math.min(m ? Number(m[1]) : 1000, 65000);
        await new Promise((r) => setTimeout(r, espera + 150));
        continue;
      }
    }
    return resp;
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

  const rr = await fetchSendflow(relUrl, { headers: H });
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
 * Agenda UMA ação para a campanha, usando TODOS os chips de uma vez
 * (accountIds no corpo — o SendFlow distribui o envio entre as contas).
 * IMPORTANTE: é UMA ação por campanha, não uma por chip; passar um chip por
 * chamada faz o grupo receber a mensagem N vezes (uma por chip).
 * @returns {Promise<{ok, actionId?, error?, raw?}>}
 */
async function agendarAcao({
  tipo, // 'text' | 'image' | 'video'
  accountIds, // array de chips da campanha
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

  const ids = (Array.isArray(accountIds) ? accountIds : [accountIds]).filter(Boolean).map(String);
  const options = { shippingSpeed: shippingSpeed || 'slow' };
  const comum = { releaseId, accountIds: ids, scheduledTo, options };
  const body =
    tipo === 'text'
      ? { ...comum, messageText: mensagem || '' }
      : { ...comum, url, caption: mensagem || '' };

  // OBS: a menção a todos (mentionAll) NÃO existe neste endpoint simples —
  // quando pedida, o motor roteia para `agendarComMencao` (/actions/send-messages).
  // Aqui o parâmetro é ignorado de propósito.
  void mentionAll;

  try {
    const resp = await fetchSendflow(endpoint, {
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
 * Uma ação por campanha, com todos os chips no array (igual ao `agendarAcao`).
 * @returns {Promise<{ok, actionId?, error?, raw?}>}
 */
async function agendarComMencao({
  tipo, // 'text' | 'image' | 'video'
  accountIds, // array de chips da campanha
  releaseId,
  url, // mídia (image/video); ignorado se tipo 'text'
  mensagem, // o texto que marca todos
  scheduledTo,
  shippingSpeed,
}) {
  const b = await base();
  const acoes = (await cfg.get('sendflow_send_path')) || '/actions';
  const endpoint = `${b}${acoes}/send-messages`;
  const ids = (Array.isArray(accountIds) ? accountIds : [accountIds]).filter(Boolean).map(String);

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
    accounts: ids,
    to: { type: 'release', ids: [releaseId] },
    data: { messages },
    scheduledTo,
    options: { shippingSpeed: shippingSpeed || 'slow' },
  };

  try {
    const resp = await fetchSendflow(endpoint, {
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
    const resp = await fetchSendflow(`${b}${acoes}/delete`, {
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
// Zera o cache local de bloqueio (ex.: quando o token é trocado em Ajustes,
// a chave nova não está bloqueada — precisa poder tentar de novo).
function limparBloqueio() {
  bloqueadoAte = 0;
}

async function testarConexao(releaseId) {
  limparBloqueio(); // o teste deve realmente bater na API, mesmo se a antiga bloqueou
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
  limparBloqueio,
};
