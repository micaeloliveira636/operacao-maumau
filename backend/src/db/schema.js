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
  linkPrincipal: text('link_principal'), // link padrão (ATIVOS 1 e 2)
  linkDois: text('link_dois'), // 2º link (só ATIVOS 1: duas mensagens)
  // Grupos específicos do AQUECIMENTO (gids) p/ pedidos e feedbacks de lara.
  // Vazio/null = campanha AQUECIMENTO inteira. Só afeta o envio ao AQUECIMENTO.
  gruposAquecimento: text('grupos_aquecimento').array(),
  // Espaços nomeados (feedbacks): [{ordem, nome, horario, legenda, tipo:'texto'|'midia'}]
  slots: jsonb('slots'),
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
  linkPrincipal: text('link_principal'), // sobrescreve o link da demanda
  linkDois: text('link_dois'), // 2º link (ATIVOS 1)
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
  variante: varchar('variante', { length: 20 }).default('principal'), // principal | link2
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

// Pastas de copy (ex.: "Abertura de grupo") com várias mensagens em sequência.
// Ao "enviar copy" o admin escolhe início + grupo do AQUECIMENTO e o painel
// agenda tudo em cascata pelos offsets configurados.
const copyFolders = pgTable('copy_folders', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: varchar('nome', { length: 200 }).notNull(),
  descricao: text('descricao'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

const copyMensagens = pgTable('copy_mensagens', {
  id: uuid('id').primaryKey().defaultRandom(),
  folderId: uuid('folder_id').references(() => copyFolders.id, { onDelete: 'cascade' }).notNull(),
  ordem: integer('ordem').notNull().default(0),
  tipo: varchar('tipo', { length: 10 }).notNull(), // text | image | video | audio
  texto: text('texto'), // texto (text) ou legenda/caption (mídia)
  url: text('url'), // mídia (image/video/audio) — Cloudinary
  offsetMin: integer('offset_min').notNull().default(0), // min após a mensagem anterior
  createdAt: timestamp('created_at').defaultNow(),
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

const configuracoes = pgTable('configuracoes', {
  chave: varchar('chave', { length: 60 }).primaryKey(),
  valor: text('valor'),
  updatedAt: timestamp('updated_at').defaultNow(),
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
  copyFolders,
  copyMensagens,
  refreshTokens,
  pushSubscriptions,
  notificacoes,
  configuracoes,
};
