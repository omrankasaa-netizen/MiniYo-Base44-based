import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  createRecord, getRecord, updateRecord, queryRecords,
  getCredentialByEmail, createCredential, updateCredentialPassword,
} from './db.js';

const JWT_SECRET = process.env.MINIYO_JWT_SECRET || 'miniyo-dev-secret-change-me';
const COOKIE_NAME = 'miniyo_session';
const TOKEN_TTL = '30d';

export function hashPassword(pw) {
  return bcrypt.hashSync(String(pw), 10);
}

export function verifyPassword(pw, hash) {
  if (!hash) return false;
  return bcrypt.compareSync(String(pw), hash);
}

export function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.MINIYO_INSECURE_COOKIE !== 'true',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// Resolve the current user from cookie OR Authorization: Bearer <token>.
export function getUserFromRequest(req) {
  let token = req.cookies?.[COOKIE_NAME];
  const authHeader = req.headers?.authorization;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload?.sub) return null;
  const user = getRecord('User', payload.sub);
  if (!user) return null;
  delete user.password_hash;
  return user;
}

// Public-facing user shape (never leak credentials).
export function publicUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

export function findUserByEmail(email) {
  const matches = queryRecords('User', { query: { email: String(email).toLowerCase() }, limit: 1 });
  return matches[0] || null;
}

export function registerUser({ email, password, full_name, role = 'customer', phone }) {
  const normalized = String(email).toLowerCase();
  const existing = findUserByEmail(normalized);
  if (existing) {
    const err = new Error('An account with this email already exists');
    err.status = 409;
    throw err;
  }
  const user = createRecord('User', {
    email: normalized,
    full_name: full_name || normalized.split('@')[0],
    role,
    phone: phone || '',
  });
  createCredential(user.id, normalized, hashPassword(password));
  return user;
}

export function authenticate(email, password) {
  const cred = getCredentialByEmail(email);
  if (!cred || !verifyPassword(password, cred.password_hash)) {
    const err = new Error('Invalid email or password');
    err.status = 401;
    throw err;
  }
  const user = getRecord('User', cred.user_id);
  return user;
}

export function setPassword(userId, newPassword) {
  updateCredentialPassword(userId, hashPassword(newPassword));
}

export function updateUser(userId, patch) {
  const clean = { ...patch };
  delete clean.password_hash;
  delete clean.role; // role changes go through the dedicated admin endpoint
  return updateRecord('User', userId, clean);
}

export { COOKIE_NAME };
