// Standalone client that replaces the @base44/sdk. Same method surface, backed
// by our own Express API. Session is carried in an httpOnly cookie; a sentinel
// token is mirrored in localStorage so the app's auth gating (which checks
// appParams.token) runs the cookie-based me() call.
import { ENTITIES } from '@/api/entities-list';
import { safeLocalStorage } from '@/lib/safeStorage';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const SENTINEL_KEY = 'base44_access_token';

function getSentinel() {
  return safeLocalStorage.getItem(SENTINEL_KEY);
}
function setSentinel(v) {
  if (v) safeLocalStorage.setItem(SENTINEL_KEY, v);
  else safeLocalStorage.removeItem(SENTINEL_KEY);
}

async function request(method, url, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: {},
  };
  const sentinel = getSentinel();
  if (sentinel) opts.headers.Authorization = `Bearer ${sentinel}`;
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${url}`, opts);
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const message = (data && data.error) || res.statusText || 'Request failed';
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function qs(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// list(sortOrLimit?, limit?) — first arg can be a sort string or a number(limit).
function normalizeListArgs(a, b) {
  let sort = null;
  let limit = null;
  if (typeof a === 'number') limit = a;
  else if (typeof a === 'string') sort = a;
  if (typeof b === 'number') limit = b;
  return { sort, limit };
}

function makeEntity(name) {
  return {
    async list(sortOrLimit, limit) {
      const { sort, limit: lim } = normalizeListArgs(sortOrLimit, limit);
      return request('GET', `/entities/${name}${qs({ sort, limit: lim })}`);
    },
    async filter(query = {}, sort = null, limit = null) {
      return request('GET', `/entities/${name}${qs({ q: JSON.stringify(query), sort, limit })}`);
    },
    async get(id) {
      return request('GET', `/entities/${name}/${encodeURIComponent(id)}`);
    },
    async create(data) {
      return request('POST', `/entities/${name}`, data || {});
    },
    async update(id, patch) {
      return request('PUT', `/entities/${name}/${encodeURIComponent(id)}`, patch || {});
    },
    async delete(id) {
      return request('DELETE', `/entities/${name}/${encodeURIComponent(id)}`);
    },
  };
}

const entities = {};
for (const name of ENTITIES) entities[name] = makeEntity(name);

const auth = {
  async me() {
    return request('GET', '/auth/me');
  },
  async loginViaEmailPassword(email, password) {
    const r = await request('POST', '/auth/login', { email, password });
    if (r?.access_token) setSentinel(r.access_token);
    return r;
  },
  async register({ email, password, full_name, phone }) {
    return request('POST', '/auth/register', { email, password, full_name, phone });
  },
  async verifyOtp({ email, otpCode }) {
    const r = await request('POST', '/auth/verify-otp', { email, otpCode });
    if (r?.access_token) setSentinel(r.access_token);
    return r;
  },
  async resendOtp(email) {
    return request('POST', '/auth/resend-otp', { email });
  },
  setToken(token) {
    setSentinel(token);
  },
  async updateMe(patch) {
    return request('POST', '/auth/update-me', patch || {});
  },
  async changePassword({ currentPassword, newPassword }) {
    return request('POST', '/auth/change-password', { currentPassword, newPassword });
  },
  async resetPasswordRequest(email) {
    return request('POST', '/auth/reset-password-request', { email });
  },
  async resetPassword({ resetToken, newPassword }) {
    return request('POST', '/auth/reset-password', { resetToken, newPassword });
  },
  async logout(redirectUrl) {
    try { await request('POST', '/auth/logout'); } catch { /* ignore */ }
    setSentinel(null);
    if (typeof window !== 'undefined') {
      window.location.href = redirectUrl || '/';
    }
  },
  redirectToLogin(fromUrl) {
    if (typeof window !== 'undefined') {
      const next = fromUrl ? `?next=${encodeURIComponent(fromUrl)}` : '';
      window.location.href = `/login${next}`;
    }
  },
  loginWithProvider() {
    // No third-party OAuth in self-host mode; route to email login.
    if (typeof window !== 'undefined') window.location.href = '/login';
  },
};

const functions = {
  async invoke(name, body) {
    return request('POST', `/functions/${name}`, body || {});
  },
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const integrations = {
  Core: {
    async UploadFile({ file }) {
      const content_base64 = await fileToBase64(file);
      return request('POST', '/upload', { filename: file?.name, content_base64 });
    },
  },
};

const users = {
  async inviteUser(email, role) {
    return request('POST', '/users/invite', { email, role });
  },
};

export const base44 = { entities, auth, functions, integrations, users };
export default base44;
