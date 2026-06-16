import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import {
  createRecord, getRecord, updateRecord, queryRecords,
  getCredentialByEmail, getCredentialByUserId, createCredential, updateCredentialPassword,
} from './db.js';

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;

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
  delete user.otp_hash;
  return user;
}

// Public-facing user shape (never leak credentials).
export function publicUser(user) {
  if (!user) return null;
  const { password_hash, otp_hash, ...rest } = user;
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

// Securely change a logged-in user's password.
// Requires the correct current password; enforces a minimum new-password length.
// Throws with a `status` so the route returns the right HTTP code.
export function changePassword(userId, currentPassword, newPassword) {
  const cred = getCredentialByUserId(userId);
  if (!cred) {
    const err = new Error('Account credentials not found');
    err.status = 404;
    throw err;
  }
  if (!verifyPassword(currentPassword, cred.password_hash)) {
    const err = new Error('Current password is incorrect');
    err.status = 400;
    throw err;
  }
  if (!newPassword || String(newPassword).length < 8) {
    const err = new Error('New password must be at least 8 characters');
    err.status = 400;
    throw err;
  }
  if (verifyPassword(newPassword, cred.password_hash)) {
    const err = new Error('New password must be different from the current password');
    err.status = 400;
    throw err;
  }
  updateCredentialPassword(userId, hashPassword(newPassword));
  return true;
}

// ─── Email-verification OTP ──────────────────────────────────────────────────
// Generate a 6-digit code, store its bcrypt hash + expiry on the User record,
// and return the plaintext code so the caller can email it.
export function issueOtp(userId) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  updateRecord('User', userId, {
    otp_hash: bcrypt.hashSync(code, 10),
    otp_expires_at: Date.now() + OTP_TTL_MS,
    otp_attempts: 0,
  });
  return code;
}

// Verify a submitted OTP code for a user. Returns { ok, error }.
export function verifyOtp(userId, code) {
  const user = getRecord('User', userId);
  if (!user) return { ok: false, error: 'Account not found', status: 404 };
  if (user.email_verified) return { ok: true }; // already verified — idempotent
  if (!user.otp_hash || !user.otp_expires_at) {
    return { ok: false, error: 'No verification code pending. Please request a new one.', status: 400 };
  }
  if (Date.now() > Number(user.otp_expires_at)) {
    return { ok: false, error: 'Verification code expired. Please request a new one.', status: 400 };
  }
  if (Number(user.otp_attempts || 0) >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: 'Too many attempts. Please request a new code.', status: 429 };
  }
  const match = bcrypt.compareSync(String(code || ''), user.otp_hash);
  if (!match) {
    updateRecord('User', userId, { otp_attempts: Number(user.otp_attempts || 0) + 1 });
    return { ok: false, error: 'Invalid verification code', status: 400 };
  }
  // Success: mark verified, clear OTP fields.
  updateRecord('User', userId, {
    email_verified: true,
    otp_hash: '',
    otp_expires_at: 0,
    otp_attempts: 0,
  });
  return { ok: true };
}

export function updateUser(userId, patch) {
  const clean = { ...patch };
  delete clean.password_hash;
  delete clean.role; // role changes go through the dedicated admin endpoint
  return updateRecord('User', userId, clean);
}

export { COOKIE_NAME };
