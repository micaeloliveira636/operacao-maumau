const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_SECRET;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

if (!JWT_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT_SECRET e REFRESH_SECRET devem estar configurados');
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function getRefreshTokenExpiry() {
  return new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);
}

function sanitizeUser(user) {
  const { senhaHash, ...safe } = user;
  return safe;
}

module.exports = {
  hashPassword,
  comparePassword,
  generateAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
  sanitizeUser,
  REFRESH_TOKEN_EXPIRY_MS,
};
