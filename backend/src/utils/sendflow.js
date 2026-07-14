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
// (evita estourar o rate limit por segundo no "Montar o dia"). Com uma pequena
// variação aleatória pra não bater sempre no mesmo "tick" do limitador.
let ultimaChamada = 0;
const INTERVALO_MIN_MS = 950;
async function respeitarIntervalo() {
  // Se estamos em cooldown de rate limit, espera até ele passar (o limitador
  // conta VIOLAÇÕES: bater durante a punição só acumula mais violação).
  const alvo = Math.max(ultimaChamada + INTERVALO_MIN_MS, limiteAte);
  const espera = alvo - Date.now();
  if (espera > 0) await new Promise((r) => setTimeout(r, espera + Math.floor(Math.random() * 120)));
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

// Cooldown de rate limit (403 rate-limit-exceeded). Diferente do bloqueio de key:
// é curto (o SendFlow pede "aguarde ~1 min"). O ponto CRÍTICO: o limitador conta
// violações, então NÃO se faz retry (cada nova batida = nova violação, e 5
// violações = bloqueio temporário). Em vez disso, registramos até quando não
// pode chamar e curto-circuitamos TODAS as chamadas (agendamento E cron) nessa
// janela — assim uma violação não vira cinco.
let limiteAte = 0;
function respostaLimitada() {
  const restante = Math.max(0, limiteAte - Date.now());
  const body = JSON.stringify({ code: 'rate-limit-exceeded', message: 'rate-limit-exceeded (cooldown local)', retryAfterMs: restante });
  return { ok: false, status: 429, async text() { return body; }, clone() { return this; } };
}

// Fetch com throttle + tratamento de rate limit SEM retry (retry gera violação).
// Ao levar rate-limit-exceeded, registra o cooldown e devolve o erro na hora;
// as próximas chamadas esperam o cooldown passar (ou são curto-circuitadas).
async function fetchSendflow(url, opts = {}, ms = 20000) {
  if (Date.now() < bloqueadoAte) return respostaBloqueada();
  if (Date.now() < limiteAte) return respostaLimitada();
  await respeitarIntervalo();
  const resp = await fetchComTimeout(url, opts, ms);
  if (resp.status === 403 || resp.status === 429) {
    const txt = await resp.clone().text().catch(() => '');
    if (/api-key-blocked/i.test(txt)) {
      const m = txt.match(/retryAfterMs"?\s*:\s*(\d+)/);
      bloqueadoAte = Date.now() + Math.min(m ? Number(m[1]) : 3600000, 24 * 3600000);
    } else if (/rate-limit-exceeded/i.test(txt) || resp.status === 429) {
      const m = txt.match(/retryAfterMs"?\s*:\s*(\d+)/);
      // teto de 5 min; piso de 60s (o SendFlow pede ~1 min entre requisições).
      const espera = Math.min(Math.max(m ? Number(m[1]) : 60000, 60000), 5 * 60000);
      limiteAte = Date.now() + espera;
    }
  }
  return resp;
}

/**
 * Chips (accountIds) da campanha — fonte autoritativa é o `release.accountIds`
 * (confirmado no manual e testado: ATIVOS 2 = 5 chips). Buscar SEMPRE fresco,
 * pois os chips caem/entram ao longo do dia. Vazio = campanha sem chips agora
 * (ex.: caíram todos) — o chamador deve pular/avisar, NÃO usar outros chips.
 */
// Cache curto dos chips por release (corta a rajada de GETs quando o "Montar o
// dia" agenda várias demandas seguidas nas mesmas campanhas). TTL curto porque
// os chips caem/entram ao longo do dia. O cron de reconferência passa
// { fresh:true } pra ignorar o cache (é justamente ele que detecta a mudança).
const chipsCache = new Map(); // releaseId -> { ids, ts }
const CHIPS_TTL_MS = 60000;

async function buscarAccountIds(releaseId, { fresh = false } = {}) {
  if (!fresh) {
    const c = chipsCache.get(String(releaseId));
    if (c && Date.now() - c.ts < CHIPS_TTL_MS && c.ids.length) return c.ids;
  }
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
  chipsCache.set(String(releaseId), { ids, ts: Date.now() });
  return ids;
}

/**
 * Grupos (com id) de um release. Fonte: GET /releases/:id/groups -> array
 * [{ id, name, ... }]. Usado pra segmentar o envio por grupos específicos
 * (ex.: ATIVOS 1 entrada com 2 links — cada link vai pra um conjunto de grupos
 * separado por nome). Cache curto igual aos chips.
 */
const gruposCache = new Map(); // releaseId -> { grupos, ts }
async function buscarGrupos(releaseId, { fresh = false } = {}) {
  if (!fresh) {
    const c = gruposCache.get(String(releaseId));
    if (c && Date.now() - c.ts < CHIPS_TTL_MS && c.grupos.length) return c.grupos;
  }
  const b = await base();
  const H = await headers();
  const rr = await fetchSendflow(`${b}/releases/${encodeURIComponent(releaseId)}/groups`, { headers: H });
  if (!rr.ok) {
    const txt = await rr.text().catch(() => '');
    throw new Error(`Grupos do release ${releaseId}: ${rr.status} ${txt.slice(0, 160)}`);
  }
  const arr = await rr.json().catch(() => []);
  const grupos = (Array.isArray(arr) ? arr : arr.items || [])
    .filter((g) => g && g.id)
    .map((g) => ({ id: String(g.id), name: String(g.name || '') }));
  if (grupos.length) gruposCache.set(String(releaseId), { grupos, ts: Date.now() });
  return grupos;
}

/**
 * Agenda UMA ação para a campanha, usando TODOS os chips de uma vez
 * (accountIds no corpo — o SendFlow distribui o envio entre as contas).
 * IMPORTANTE: é UMA ação por campanha, não uma por chip; passar um chip por
 * chamada faz o grupo receber a mensagem N vezes (uma por chip).
 * Se `grupoIds` vier preenchido, o envio é segmentado (só esses grupos) via
 * /actions/send-messages com to:{type:'groups'} — senão vai pra release inteira.
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
  grupoIds, // opcional: segmenta o envio nesses grupos
}) {
  void mentionAll; // menção roteia p/ agendarComMencao; aqui é ignorado

  // Envio SEGMENTADO por grupos -> batch /actions/send-messages (única forma
  // que aceita to:{type:'groups'}). Uma mensagem (mídia c/ legenda OU texto).
  if (Array.isArray(grupoIds) && grupoIds.length) {
    return agendarParaGrupos({ tipo, accountIds, releaseId, url, mensagem, scheduledTo, shippingSpeed, grupoIds });
  }

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
 * Envio SEGMENTADO para grupos específicos (sem menção). Única forma suportada
 * é o batch /actions/send-messages com to:{type:'groups', ids:[...]}. Uma única
 * mensagem: mídia com legenda (imageMessage/videoMessage) OU texto.
 * @returns {Promise<{ok, actionId?, error?, raw?}>}
 */
async function agendarParaGrupos({
  tipo, accountIds, releaseId, url, mensagem, scheduledTo, shippingSpeed, grupoIds,
}) {
  const b = await base();
  const acoes = (await cfg.get('sendflow_send_path')) || '/actions';
  const endpoint = `${b}${acoes}/send-messages`;
  const ids = (Array.isArray(accountIds) ? accountIds : [accountIds]).filter(Boolean).map(String);
  const gIds = (Array.isArray(grupoIds) ? grupoIds : []).filter(Boolean).map(String);

  let msg;
  if (tipo === 'text') {
    msg = { type: 'extendedTextMessage', message: { text: mensagem || '' } };
  } else {
    const chave = tipo === 'video' ? 'video' : 'image';
    msg = { type: `${chave}Message`, message: { [chave]: { url }, caption: mensagem || '' } };
  }

  const body = {
    releaseId,
    accountsFrom: 'accounts',
    accounts: ids,
    to: { type: 'groups', ids: gIds },
    data: { messages: [msg] },
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
  grupoIds, // opcional: segmenta a menção nesses grupos
}) {
  const b = await base();
  const acoes = (await cfg.get('sendflow_send_path')) || '/actions';
  const endpoint = `${b}${acoes}/send-messages`;
  const ids = (Array.isArray(accountIds) ? accountIds : [accountIds]).filter(Boolean).map(String);
  const gIds = (Array.isArray(grupoIds) ? grupoIds : []).filter(Boolean).map(String);

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
    // segmenta nos grupos indicados; sem grupos -> release inteira
    to: gIds.length ? { type: 'groups', ids: gIds } : { type: 'release', ids: [releaseId] },
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
  buscarGrupos,
  agendarAcao,
  agendarParaGrupos,
  agendarComMencao,
  deletarAcoes,
  testarConexao,
  estaConfigurado,
  enviarNotificacaoWhatsapp,
  limparBloqueio,
};
