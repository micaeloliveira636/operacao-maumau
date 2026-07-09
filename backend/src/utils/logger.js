const { db } = require('../db');
const { activityLogs } = require('../db/schema');

async function logActivity({ demandaId = null, userId = null, action, metadata = {}, ipAddress = null }) {
  try {
    await db.insert(activityLogs).values({
      demandaId,
      userId,
      action,
      metadataJson: metadata,
      ipAddress,
    });
  } catch (err) {
    console.error('Erro ao salvar log de atividade:', err.message);
  }
}

module.exports = { logActivity };
