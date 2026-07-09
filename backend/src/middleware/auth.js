const { verifyAccessToken } = require('../utils/auth');
const { db } = require('../db');
const { usuarios } = require('../db/schema');
const { eq } = require('drizzle-orm');

// Middleware: verifica se está autenticado
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyAccessToken(token);

    // Verifica se o usuário ainda existe e está ativo
    const [user] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, decoded.id))
      .limit(1);

    if (!user || !user.ativo) {
      return res.status(401).json({ error: 'Usuário inativo ou inexistente' });
    }

    req.user = { id: user.id, email: user.email, role: user.role, nome: user.nome };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
}

// Middleware: verifica se é admin
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
}

// Middleware: verifica se é admin ou o próprio operador atribuído
function requireOwnerOrAdmin(demandaField = 'atribuidoA') {
  return (req, res, next) => {
    if (req.user.role === 'admin') return next();
    // Para rotas que carregam a demanda antes
    if (req.demanda && req.demanda[demandaField] === req.user.id) return next();
    return res.status(403).json({ error: 'Sem permissão para acessar este recurso' });
  };
}

module.exports = { requireAuth, requireAdmin, requireOwnerOrAdmin };
