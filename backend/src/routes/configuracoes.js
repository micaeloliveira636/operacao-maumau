const express = require('express');
const { eq } = require('drizzle-orm');
const { db } = require('../db');
const { configuracoes } = require('../db/schema');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const cfg = require('../utils/config');
const sendflow = require('../utils/sendflow');

const router = express.Router();

// GET /configuracoes — lê config (token mascarado)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const config = await cfg.getPublic();
    // Heartbeat da verificação de chips/grupos — o painel avisa se está atrasada
    // (se o cron morrer, a checagem de grupo novo para em silêncio).
    let ultimaReconferencia = null;
    try {
      const [linha] = await db.select().from(configuracoes)
        .where(eq(configuracoes.chave, 'ultima_reconferencia')).limit(1);
      if (linha?.valor) ultimaReconferencia = JSON.parse(linha.valor);
    } catch {}
    return res.json({ config, ultimaReconferencia });
  } catch (err) {
    console.error('Erro ao ler configuracoes:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// PUT /configuracoes — grava (só chaves conhecidas; token só sobrescreve se enviado)
router.put('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const body = req.body || {};
    const pares = {};
    const chaves = [
      'sendflow_api_url', 'sendflow_api_token', 'sendflow_notify_account',
      'sendflow_releases_path', 'sendflow_send_path', 'sendflow_notify_path',
      'release_ativos1', 'release_ativos2', 'release_aquecimento',
    ];
    for (const k of chaves) {
      if (body[k] === undefined) continue;
      // não sobrescreve o token com a máscara ou vazio acidental
      if (k === 'sendflow_api_token' && (!body[k] || body[k].includes('•'))) continue;
      pares[k] = body[k];
    }
    await cfg.setMany(pares);
    // Trocou o token? A chave nova não está bloqueada — zera o cache de bloqueio.
    if (pares.sendflow_api_token) {
      try { require('../utils/sendflow').limparBloqueio(); } catch {}
    }

    await logActivity({
      userId: req.user.id,
      action: 'config.atualizada',
      metadata: { chaves: Object.keys(pares) },
      ipAddress: req.ip,
    });

    return res.json({ config: await cfg.getPublic() });
  } catch (err) {
    console.error('Erro ao salvar configuracoes:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /configuracoes/testar-sendflow — valida token/URL buscando um release
router.post('/testar-sendflow', requireAuth, requireAdmin, async (req, res) => {
  try {
    const releaseId = req.body?.releaseId || (await cfg.get('release_ativos1'));
    const resultado = await sendflow.testarConexao(releaseId);
    return res.json(resultado);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
