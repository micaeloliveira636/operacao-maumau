const express = require('express');
const agendador = require('../services/agendador');

const router = express.Router();

// GET/POST /cron/recheck-chips?token=XXX
// Reconfere os chips das campanhas dos envios próximos e reagenda se mudou.
// Protegido por token (CRON_TOKEN) — pra ser chamado por um cron externo
// (ex.: cron-job.org) a cada ~5min. Também mantém o backend acordado.
async function handler(req, res) {
  const token = req.query.token || req.headers['x-cron-token'];
  const esperado = process.env.CRON_TOKEN;
  if (!esperado || token !== esperado) {
    return res.status(401).json({ error: 'token inválido' });
  }
  try {
    const janelaMin = Number(req.query.janela) || 15;
    const r = await agendador.reconferirChips({ janelaMin });
    return res.json(r);
  } catch (err) {
    console.error('Erro no recheck-chips (cron):', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
}

router.get('/recheck-chips', handler);
router.post('/recheck-chips', handler);

module.exports = router;
