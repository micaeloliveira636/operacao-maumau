const express = require('express');
const { eq } = require('drizzle-orm');
const { db } = require('../db');
const { usuarios, refreshTokens } = require('../db/schema');
const {
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
  sanitizeUser,
  REFRESH_TOKEN_EXPIRY_MS,
} = require('../utils/auth');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/logger');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Rate limit específico para login: 5 tentativas por 15 min
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, senha } = req.body;

    if (!email || !senha) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const [user] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (!user.ativo) {
      return res.status(401).json({ error: 'Usuário inativo' });
    }

    const senhaValida = comparePassword(senha, user.senhaHash);
    if (!senhaValida) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Gera tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    const refreshExpiry = getRefreshTokenExpiry();

    // Salva refresh token no banco
    await db.insert(refreshTokens).values({
      userId: user.id,
      token: refreshToken,
      expiresAt: refreshExpiry,
    });

    // Refresh token no cookie httpOnly
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_TOKEN_EXPIRY_MS,
      path: '/auth/refresh',
    });

    await logActivity({
      userId: user.id,
      action: 'auth.login',
      metadata: { email: user.email },
      ipAddress: req.ip,
    });

    return res.json({
      token: accessToken,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.refresh_token;

    if (!token) {
      return res.status(401).json({ error: 'Refresh token não fornecido' });
    }

    // Busca refresh token no banco
    const [storedToken] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, token))
      .limit(1);

    if (!storedToken) {
      return res.status(401).json({ error: 'Refresh token inválido' });
    }

    if (new Date() > storedToken.expiresAt) {
      // Remove token expirado
      await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));
      return res.status(401).json({ error: 'Refresh token expirado' });
    }

    // Busca usuário
    const [user] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, storedToken.userId))
      .limit(1);

    if (!user || !user.ativo) {
      return res.status(401).json({ error: 'Usuário inativo ou inexistente' });
    }

    // Rotaciona o refresh token (invalida o anterior, gera novo)
    await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));

    const newRefreshToken = generateRefreshToken();
    const newExpiry = getRefreshTokenExpiry();

    await db.insert(refreshTokens).values({
      userId: user.id,
      token: newRefreshToken,
      expiresAt: newExpiry,
    });

    const accessToken = generateAccessToken(user);

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_TOKEN_EXPIRY_MS,
      path: '/auth/refresh',
    });

    return res.json({
      token: accessToken,
      user: sanitizeUser(user),
    });
  } catch (err) {
    console.error('Erro no refresh:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// POST /auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  try {
    const token = req.cookies?.refresh_token;

    if (token) {
      await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
    }

    res.clearCookie('refresh_token', { path: '/auth/refresh' });

    await logActivity({
      userId: req.user.id,
      action: 'auth.logout',
      ipAddress: req.ip,
    });

    return res.json({ message: 'Logout realizado' });
  } catch (err) {
    console.error('Erro no logout:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// GET /auth/me
router.get('/me', requireAuth, async (req, res) => {
  try {
    const [user] = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.id, req.user.id))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    return res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error('Erro no /me:', err);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;
