require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const demandasRoutes = require('./routes/demandas');
const usuariosRoutes = require('./routes/usuarios');
const arquivosRoutes = require('./routes/arquivos');
const copysRoutes = require('./routes/copys');
const notificacoesRoutes = require('./routes/notificacoes');
const configuracoesRoutes = require('./routes/configuracoes');

const app = express();
const PORT = process.env.PORT || 3001;

// Confia no proxy do Render (para req.ip e cookies secure funcionarem)
app.set('trust proxy', 1);

// Origens permitidas (aceita lista separada por vírgula no FRONTEND_URL)
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Segurança
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    // Permite ferramentas sem origin (curl, health checks, apps mobile).
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origem não permitida pelo CORS'));
  },
  credentials: true,
}));

// Rate limit global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
}));

// Parsers
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rotas
app.use('/auth', authRoutes);
app.use('/demandas', demandasRoutes);
app.use('/usuarios', usuariosRoutes);
app.use('/arquivos', arquivosRoutes);
app.use('/copys', copysRoutes);
app.use('/notificacoes', notificacoesRoutes);
app.use('/configuracoes', configuracoesRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
  console.log(`Maumau Media API rodando na porta ${PORT}`);
});

module.exports = app;
