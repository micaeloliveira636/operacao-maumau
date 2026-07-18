require('dotenv').config();

const postgres = require('postgres');

async function migrate() {
  const client = postgres(process.env.DATABASE_URL, { ssl: 'require' });

  console.log('Criando tabelas...');

  await client`
    CREATE TABLE IF NOT EXISTS usuarios (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome VARCHAR(100) NOT NULL,
      whatsapp VARCHAR(20) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      senha_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'operador')),
      ativo BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS demandas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      titulo VARCHAR(200) NOT NULL,
      categoria VARCHAR(30) NOT NULL,
      descricao TEXT,
      data_alvo DATE NOT NULL,
      horarios TEXT[] NOT NULL,
      campanhas_destino TEXT[] NOT NULL,
      release_ids TEXT[] NOT NULL,
      atribuido_a UUID REFERENCES usuarios(id),
      criado_por UUID REFERENCES usuarios(id),
      status VARCHAR(30) NOT NULL DEFAULT 'pendente'
        CHECK (status IN ('pendente','em_andamento','enviado','aprovado',
                          'agendamento_pendente','agendado','erro_agendamento',
                          'concluido','rejeitado','texto_agendado')),
      legenda TEXT,
      mencionar BOOLEAN DEFAULT false,
      velocidade VARCHAR(10) DEFAULT 'slow',
      prioridade VARCHAR(10) DEFAULT 'normal'
        CHECK (prioridade IN ('urgente','alta','normal')),
      motivo_rejeicao TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS arquivos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      demanda_id UUID REFERENCES demandas(id) ON DELETE CASCADE,
      cloudinary_public_id VARCHAR(200) NOT NULL,
      cloudinary_url VARCHAR(500) NOT NULL,
      tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('imagem', 'video')),
      formato_original VARCHAR(10) NOT NULL,
      formato_entrega VARCHAR(10) NOT NULL,
      ordem INTEGER NOT NULL,
      horario VARCHAR(5),
      legenda_custom TEXT,
      status VARCHAR(20) DEFAULT 'pendente'
        CHECK (status IN ('pendente','aprovado','rejeitado')),
      uploaded_by UUID REFERENCES usuarios(id),
      uploaded_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS automation_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      demanda_id UUID REFERENCES demandas(id) ON DELETE CASCADE,
      type VARCHAR(30) NOT NULL CHECK (type IN ('agendamento','agendamento-texto','notificacao','cancelamento')),
      payload_json JSONB NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','processing','success','error')),
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 3,
      error_message TEXT,
      result_json JSONB,
      idempotency_key VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      processed_at TIMESTAMP
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS sendflow_schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      demanda_id UUID REFERENCES demandas(id) ON DELETE CASCADE,
      automation_job_id UUID REFERENCES automation_jobs(id),
      arquivo_id UUID REFERENCES arquivos(id),
      sendflow_action_id VARCHAR(100),
      release_id VARCHAR(100) NOT NULL,
      account_ids TEXT[] NOT NULL,
      tipo_envio VARCHAR(10) NOT NULL CHECK (tipo_envio IN ('text','image','video')),
      mensagem_ou_url TEXT NOT NULL,
      legenda TEXT,
      mencionar BOOLEAN DEFAULT false,
      velocidade VARCHAR(10) DEFAULT 'slow',
      scheduled_to TIMESTAMP NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'agendado'
        CHECK (status IN ('agendado','enviado','erro','cancelado')),
      result_json JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      demanda_id UUID REFERENCES demandas(id) ON DELETE SET NULL,
      user_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
      action VARCHAR(50) NOT NULL,
      metadata_json JSONB DEFAULT '{}'::jsonb,
      ip_address VARCHAR(45),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS copys_lancamento (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome VARCHAR(200) NOT NULL,
      conteudo TEXT NOT NULL,
      ordem INTEGER DEFAULT 0,
      ativo BOOLEAN DEFAULT false,
      tipo VARCHAR(20) CHECK (tipo IN ('sistema', 'anuncio', 'parceria')),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS copy_folders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nome VARCHAR(200) NOT NULL,
      descricao TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS copy_mensagens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      folder_id UUID NOT NULL REFERENCES copy_folders(id) ON DELETE CASCADE,
      ordem INTEGER NOT NULL DEFAULT 0,
      tipo VARCHAR(10) NOT NULL,
      texto TEXT,
      url TEXT,
      offset_min INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES usuarios(id) ON DELETE CASCADE NOT NULL,
      token VARCHAR(500) UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES usuarios(id) ON DELETE CASCADE NOT NULL,
      endpoint VARCHAR(1000) UNIQUE NOT NULL,
      p256dh VARCHAR(255) NOT NULL,
      auth VARCHAR(255) NOT NULL,
      user_agent VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS notificacoes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES usuarios(id) ON DELETE CASCADE NOT NULL,
      demanda_id UUID REFERENCES demandas(id) ON DELETE SET NULL,
      titulo VARCHAR(200) NOT NULL,
      mensagem TEXT NOT NULL,
      tipo VARCHAR(20) DEFAULT 'info' CHECK (tipo IN ('info','sucesso','alerta','erro')),
      url VARCHAR(300) DEFAULT '/',
      lida BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave VARCHAR(60) PRIMARY KEY,
      valor TEXT,
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Migrações incrementais (para bancos já existentes)
  await client`ALTER TABLE demandas ADD COLUMN IF NOT EXISTS prioridade VARCHAR(10) DEFAULT 'normal'`;
  await client`ALTER TABLE demandas ADD COLUMN IF NOT EXISTS link_principal TEXT`;
  await client`ALTER TABLE demandas ADD COLUMN IF NOT EXISTS link_dois TEXT`;
  await client`ALTER TABLE demandas ADD COLUMN IF NOT EXISTS slots JSONB`;
  await client`ALTER TABLE demandas ADD COLUMN IF NOT EXISTS grupos_aquecimento TEXT[]`;
  await client`ALTER TABLE demandas ADD COLUMN IF NOT EXISTS slot VARCHAR(60)`;
  await client`ALTER TABLE demandas ADD COLUMN IF NOT EXISTS entrada_hora VARCHAR(5)`;
  await client`ALTER TABLE arquivos ADD COLUMN IF NOT EXISTS link_principal TEXT`;
  await client`ALTER TABLE arquivos ADD COLUMN IF NOT EXISTS link_dois TEXT`;
  await client`ALTER TABLE sendflow_schedules ADD COLUMN IF NOT EXISTS variante VARCHAR(20) DEFAULT 'principal'`;
  // Recria o índice de idempotência incluindo a variante (2 links no mesmo horário)
  await client`DROP INDEX IF EXISTS idx_unique_schedule`;
  await client`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_schedule
    ON sendflow_schedules(demanda_id, arquivo_id, scheduled_to, release_id, variante)
    WHERE status != 'cancelado'
  `;

  // Índices
  await client`CREATE INDEX IF NOT EXISTS idx_demandas_status ON demandas(status)`;
  await client`CREATE INDEX IF NOT EXISTS idx_demandas_data ON demandas(data_alvo)`;
  await client`CREATE INDEX IF NOT EXISTS idx_demandas_atribuido ON demandas(atribuido_a)`;
  await client`CREATE INDEX IF NOT EXISTS idx_arquivos_demanda ON arquivos(demanda_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_automation_jobs_demanda ON automation_jobs(demanda_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_automation_jobs_status ON automation_jobs(status)`;
  await client`CREATE INDEX IF NOT EXISTS idx_sendflow_schedules_demanda ON sendflow_schedules(demanda_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_sendflow_schedules_status ON sendflow_schedules(status)`;
  await client`CREATE INDEX IF NOT EXISTS idx_activity_logs_demanda ON activity_logs(demanda_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action)`;
  await client`CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at)`;
  await client`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_notificacoes_user ON notificacoes(user_id)`;
  await client`CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON notificacoes(user_id, lida)`;

  // Constraint de idempotência nos schedules
  await client`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_schedule
    ON sendflow_schedules(demanda_id, arquivo_id, scheduled_to, release_id)
    WHERE status != 'cancelado'
  `;

  console.log('Tabelas e índices criados com sucesso!');
  await client.end();
  process.exit(0);
}

migrate().catch(err => {
  console.error('Erro na migração:', err);
  process.exit(1);
});
