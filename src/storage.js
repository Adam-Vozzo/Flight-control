// Best scores and settings, kept on this device only.

const KEY = 'flight-control/v1';

const DEFAULTS = {
  best: {},
  sound: true,
  music: true,
  haptics: true,
  tutorial: false,
  helpSeen: false,
  lastMap: 'airfield',
  played: 0,
};

export function loadStore() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : {};
    return { ...DEFAULTS, ...data, best: { ...(data.best || {}) } };
  } catch {
    return { ...DEFAULTS, best: {} };
  }
}

export function saveStore(store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* private mode or storage full: settings just won't persist */
  }
}
