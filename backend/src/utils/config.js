const { db } = require('../db');
const { configuracoes } = require('../db/schema');
const { eq } = require('drizzle-orm');

// Configurações editáveis pelo painel (tabela configuracoes) com fallback
// para variáveis de ambiente. Cache curto para não bater no banco toda hora.

// chave interna -> variável de ambiente equivalente (fallback)
const ENV_FALLBACK = {
  sendflow_api_url: 'SENDFLOW_API_URL',
  sendflow_api_token: 'SENDFLOW_API_KEY',
  sendflow_notify_account: 'SENDFLOW_NOTIFY_ACCOUNT',
  sendflow_releases_path: null, // default fixo abaixo
  sendflow_send_path: null,
  sendflow_notify_path: 'SENDFLOW_NOTIFY_PATH',
  sendflow_accounts_path: null,
  release_ativos1: null,
  release_ativos2: null,
  release_aquecimento: null,
};

// Contrato REAL confirmado (jul/2026) via swagger da API:
//   host  https://sendapi.sendflow.pro  (NÃO sendflow.pro/sendapi)
//   GET  /releases/:releaseId            -> dados do release
//   GET  /accounts                       -> contas (usa as isAuthenticated)
//   POST /actions/send-{tipo}-message    -> { releaseId, accountIds, ... }
//   POST /actions/delete                 -> { actions: [...] }
const DEFAULTS = {
  sendflow_api_url: 'https://sendapi.sendflow.pro',
  sendflow_releases_path: '/releases/:releaseId',
  sendflow_send_path: '/actions', // base; vira /send-{tipo}-message
  sendflow_accounts_path: '/accounts',
  sendflow_notify_path: '/actions/send-text-message',
  release_ativos1: 'LS061jlmh7U9iJ6v4SUN',
  release_ativos2: '8C9Xo8rsvshj6zNYRYYf',
  release_aquecimento: 'IRy3PxVIfh85kQrus2LN',
};

// chaves consideradas sensíveis (mascaradas na leitura pública)
const SENSIVEIS = ['sendflow_api_token'];

let cache = null;
let cacheAt = 0;
const TTL = 15000; // 15s

async function carregarBanco() {
  const linhas = await db.select().from(configuracoes);
  const map = {};
  for (const l of linhas) map[l.chave] = l.valor;
  return map;
}

async function getAll() {
  const agora = Date.now();
  if (cache && agora - cacheAt < TTL) return cache;
  let banco = {};
  try {
    banco = await carregarBanco();
  } catch (e) {
    console.error('Erro ao ler configuracoes:', e.message);
  }
  const merged = {};
  for (const chave of Object.keys(ENV_FALLBACK)) {
    const doBanco = banco[chave];
    const envVar = ENV_FALLBACK[chave];
    const doEnv = envVar ? process.env[envVar] : undefined;
    merged[chave] = doBanco ?? doEnv ?? DEFAULTS[chave] ?? '';
  }
  cache = merged;
  cacheAt = agora;
  return merged;
}

async function get(chave) {
  const all = await getAll();
  return all[chave];
}

async function setMany(pares) {
  for (const [chave, valor] of Object.entries(pares)) {
    if (!(chave in ENV_FALLBACK)) continue; // só chaves conhecidas
    await db
      .insert(configuracoes)
      .values({ chave, valor: valor ?? null, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: configuracoes.chave,
        set: { valor: valor ?? null, updatedAt: new Date() },
      });
  }
  cache = null; // invalida
}

// Versão para exibir no painel (mascara segredos e marca origem default).
async function getPublic() {
  const all = await getAll();
  const out = {};
  for (const [chave, valor] of Object.entries(all)) {
    if (SENSIVEIS.includes(chave)) {
      out[chave] = valor ? '••••••••' : '';
      out[`${chave}_definido`] = Boolean(valor);
    } else {
      out[chave] = valor;
    }
  }
  return out;
}

module.exports = { get, getAll, setMany, getPublic, DEFAULTS, ENV_FALLBACK };
