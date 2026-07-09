const { pgTable, uuid, varchar, text, boolean, integer, timestamp, date, jsonb, uniqueIndex } = require('drizzle-orm/pg-core');

const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: varchar('nome', { length: 100 }).notNull(),
  whatsapp: varchar('whatsapp', { length: 20 }).notNull(),
  email: varchar('email', { length: 100 }).notNull().unique(),
  senhaHash: varchar('senha_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull(), // admin | operador
  ativo: boolean('ativo').default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const demandas = pgTable('demandas', {
  id: uuid('id').primaryKey().defaultRandom(),
  titulo: varchar('titulo', { length: 200 }).notNull(),
  categoria: varchar('categoria', { length: 30 }).notNull(),
  descricao: text('descricao'),
  dataAlvo: date('data_alvo').notNull(),
  horarios: text('horarios').array().notNull(),
  campanhasDestino: text('campanhas_destino').array().notNull(),
  releaseIds: text('release_ids').array().notNull(),
  atribuidoA: uuid('atribuido_a').references(() => usuarios.id),
  criadoPor: uuid('criado_por').references(() => usuarios.id),
  status: varchar('status', { length: 30 }).notNull().default('pendente'),
  legenda: text('legenda'),
  mencionar: boolean('mencionar').default(false),
  velocidade: varchar('velocidade', { length: 10 }).default('slow'),
  prioridade: varchar('prioridade', { length: 10 }).default('normal'), // urgente | alta | normal
  motivoRejeicao: text('motivo_rejeicao'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const arquivos = pgTable('arquivos', {
  id: uuid('id').primaryKey().defaultRandom(),
  demandaId: uuid('demanda_id').references(() => demandas.id, { onDelete: 'cascade' }),
  cloudinaryPublicId: varchar('cloudinary_public_id', { length: 200 }).notNull(),
  cloudinaryUrl: varchar('cloudinary_url', { length: 500 }).notNull(),
  tipo: varchar('tipo', { length: 10 }).notNull(), // imagem | video
  formatoOriginal: varchar('formato_original', { length: 10 }).notNull(),
  formatoEntrega: varchar('formato_entrega', { length: 10 }).notNull(),
  ordem: integer('ordem').notNull(),
  horario: varchar('horario', { length: 5 }),
  legendaCustom: text('legenda_custom'),
  status: varchar('status', { length: 20 }).default('pendente'),
  uploadedBy: uuid('uploaded_by').references(() => usuarios.id),
  uploadedAt: timestamp('uploaded_at').defaultNow(),
});

const automationJobs = pgTable('automation_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  demandaId: uuid('demanda_id').references(() => demandas.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 30 }).notNull(),
  payloadJson: jsonb('payload_json').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  attempts: integer('attempts').default(0),
  maxAttempts: integer('max_attempts').default(3),
  errorMessage: text('error_message'),
  resultJson: jsonb('result_json'),
  idempotencyKey: varchar('idempotency_key', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
  processedAt: timestamp('processed_at'),
});

const sendflowSchedules = pgTable('sendflow_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  demandaId: uuid('demanda_id').references(() => demandas.id, { onDelete: 'cascade' }),
  automationJobId: uuid('automation_job_id').references(() => automationJobs.id),
  arquivoId: uuid('arquivo_id').references(() => arquivos.id),
  sendflowActionId: varchar('sendflow_action_id', { length: 100 }),
  releaseId: varchar('release_id', { length: 100 }).notNull(),
  accountIds: text('account_ids').array().notNull(),
  tipoEnvio: varchar('tipo_envio', { length: 10 }).notNull(), // text | image | video
  mensagemOuUrl: text('mensagem_ou_url').notNull(),
  legenda: text('legenda'),
  mencionar: boolean('mencionar').default(false),
  velocidade: varchar('velocidade', { length: 10 }).default('slow'),
  scheduledTo: timestamp('scheduled_to').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('agendado'),
  resultJson: jsonb('result_json'),
  createdAt: timestamp('created_at').defaultNow(),
});

const activityLogs = pgTable('activity_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  demandaId: uuid('demanda_id').references(() => demandas.id, { onDelete: 'set null' }),
  userId: uuid('user_id').references(() => usuarios.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 50 }).notNull(),
  metadataJson: jsonb('metadata_json').default({}),
  ipAddress: varchar('ip_address', { length: 45 }),
  createdAt: timestamp('created_at').defaultNow(),
});

const copysLancamento = pgTable('copys_lancamento', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: varchar('nome', { length: 200 }).notNull(),
  conteudo: text('conteudo').notNull(),
  ordem: integer('ordem').default(0),
  ativo: boolean('ativo').default(false),
  tipo: varchar('tipo', { length: 20 }), // sistema | anuncio | parceria
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => usuarios.id, { onDelete: 'cascade' }).notNull(),
  token: varchar('token', { length: 500 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => usuarios.id, { onDelete: 'cascade' }).notNull(),
  endpoint: varchar('endpoint', { length: 1000 }).notNull().unique(),
  p256dh: varchar('p256dh', { length: 255 }).notNull(),
  auth: varchar('auth', { length: 255 }).notNull(),
  userAgent: varchar('user_agent', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
});

const notificacoes = pgTable('notificacoes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => usuarios.id, { onDelete: 'cascade' }).notNull(),
  demandaId: uuid('demanda_id').references(() => demandas.id, { onDelete: 'set null' }),
  titulo: varchar('titulo', { length: 200 }).notNull(),
  mensagem: text('mensagem').notNull(),
  tipo: varchar('tipo', { length: 20 }).default('info'), // info | sucesso | alerta | erro
  url: varchar('url', { length: 300 }).default('/'),
  lida: boolean('lida').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

module.exports = {
  usuarios,
  demandas,
  arquivos,
  automationJobs,
  sendflowSchedules,
  activityLogs,
  copysLancamento,
  refreshTokens,
  pushSubscriptions,
  notificacoes,
};
