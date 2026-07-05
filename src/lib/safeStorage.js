// Safe browser-storage helpers.
//
// The Facebook / Instagram in-app WebView partitions storage under its privacy
// protections and can THROW (SecurityError) on any access to localStorage,
// sessionStorage, or document.cookie — even a read. Because the app touches
// storage during boot/initial render, an unguarded access there throws, trips
// the React error boundary, and the page never renders ("stuck loading").
//
// Every storage access in the frontend must go through these helpers. They wrap
// each operation in try/catch (returning null / no-op on failure) and fall back
// to an in-memory shim so features keep working for the session even when the
// browser blocks persistent storage. Nothing here ever throws.

// Module-level in-memory fallbacks (one per storage type). Used when the real
// Web Storage API is unavailable/blocked so set/get still round-trips within
// the session (no persistence across reloads, but the app functions).
const memoryStores = {
  localStorage: new Map(),
  sessionStorage: new Map(),
};

// Feature-test a storage type once: attempt a write+remove inside try/catch.
// Blocked WebViews throw here, so a false result means "use the memory shim".
const availabilityCache = {};
export function storageAvailable(type = 'localStorage') {
  if (type in availabilityCache) return availabilityCache[type];
  let ok = false;
  try {
    const s = globalThis[type];
    const probe = '__miniyo_storage_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    ok = true;
  } catch {
    ok = false;
  }
  availabilityCache[type] = ok;
  return ok;
}

function makeStorage(type) {
  const memory = memoryStores[type];
  return {
    getItem(key) {
      try {
        return globalThis[type].getItem(key);
      } catch {
        return memory.has(key) ? memory.get(key) : null;
      }
    },
    setItem(key, value) {
      const v = String(value);
      try {
        globalThis[type].setItem(key, v);
      } catch {
        // Persistent storage blocked — keep it in memory for this session.
        memory.set(key, v);
      }
    },
    removeItem(key) {
      try {
        globalThis[type].removeItem(key);
      } catch {
        memory.delete(key);
      }
    },
  };
}

export const safeLocalStorage = makeStorage('localStorage');
export const safeSessionStorage = makeStorage('sessionStorage');

// Cookie helpers. document.cookie can also throw in blocked WebViews, so reads
// return null and writes are best-effort no-ops on failure.
export function getCookie(name) {
  try {
    const prefix = `${name}=`;
    const parts = document.cookie ? document.cookie.split('; ') : [];
    for (const part of parts) {
      if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
    }
    return null;
  } catch {
    return null;
  }
}

export function setCookie(nameValueString) {
  try {
    document.cookie = nameValueString;
  } catch {
    /* cookies blocked (FB/IG in-app WebView) — no-op */
  }
}
