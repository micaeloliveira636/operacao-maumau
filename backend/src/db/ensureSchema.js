const { db } = require('./index');
const { sql } = require('drizzle-orm');

// Correções idempotentes de constraints que ficaram defasadas quando surgiram
// novos status/tipos (o deploy do Render roda só `npm start`, não o migrate).
// Roda no boot; cada passo é isolado pra um erro não derrubar os outros.
async function ensureSchema() {
  const passos = [
    // demandas.status precisava incluir 'texto_agendado' (senão "agendar só o
    // texto" estourava 500 ao atualizar o status).
    sql`ALTER TABLE demandas DROP CONSTRAINT IF EXISTS demandas_status_check`,
    sql`ALTER TABLE demandas ADD CONSTRAINT demandas_status_check CHECK (status IN (
      'pendente','em_andamento','enviado','aprovado','agendamento_pendente',
      'agendado','erro_agendamento','concluido','rejeitado','texto_agendado'))`,
    // automation_jobs.type: aceita também 'agendamento-texto'.
    sql`ALTER TABLE automation_jobs DROP CONSTRAINT IF EXISTS automation_jobs_type_check`,
    sql`ALTER TABLE automation_jobs ADD CONSTRAINT automation_jobs_type_check CHECK (type IN (
      'agendamento','agendamento-texto','notificacao','cancelamento'))`,
    // Pastas de copy + mensagens (feature de "Copys" — tabelas novas).
    sql`CREATE TABLE IF NOT EXISTS copy_folders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome VARCHAR(200) NOT NULL,
      descricao TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`,
    sql`CREATE TABLE IF NOT EXISTS copy_mensagens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      folder_id UUID NOT NULL REFERENCES copy_folders(id) ON DELETE CASCADE,
      ordem INTEGER NOT NULL DEFAULT 0,
      tipo VARCHAR(10) NOT NULL,
      texto TEXT,
      url TEXT,
      offset_min INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )`,
    sql`CREATE INDEX IF NOT EXISTS idx_copy_mensagens_folder ON copy_mensagens(folder_id)`,
  ];
  let ok = 0;
  for (const passo of passos) {
    try {
      await db.execute(passo);
      ok += 1;
    } catch (e) {
      console.error('ensureSchema: passo falhou (seguindo):', e?.cause?.message || e.message);
    }
  }
  console.log(`ensureSchema: ${ok}/${passos.length} passos aplicados`);
}

module.exports = { ensureSchema };
