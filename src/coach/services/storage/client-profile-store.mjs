/**
 * Client profile storage facade for Coach.
 * Mirrors current localStorage athlete_* behavior without DOM/PDF/nutrition logic.
 */

import { PROFILE_STORAGE_KEY_PREFIX, profileStorageKey } from '../../domain/clients.mjs';

/**
 * In-memory Web Storage–like backend for isolated tests.
 * Object.keys(storage) is not used; callers should use listProfileKeys on the store.
 */
export function createMemoryStorage(initialEntries = {}) {
  const map = new Map(
    Object.entries(initialEntries).map(([key, value]) => [String(key), String(value)]),
  );
  return {
    get length() {
      return map.size;
    },
    key(index) {
      return Array.from(map.keys())[index] ?? null;
    },
    getItem(key) {
      const k = String(key);
      return map.has(k) ? map.get(k) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    /** Test helper only — production store never calls clear. */
    clear() {
      map.clear();
    },
    __allKeys() {
      return Array.from(map.keys());
    },
  };
}

function enumerateStorageKeys(storage) {
  if (typeof storage.__allKeys === 'function') {
    return storage.__allKeys();
  }
  // Matches coach UI: Object.keys(localStorage)
  return Object.keys(storage);
}

/**
 * @param {Storage|{getItem:Function,setItem:Function,removeItem:Function}} storage
 */
export function createClientProfileStore(storage) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
    throw new Error('createClientProfileStore requires a Web Storage–like backend');
  }

  return {
    prefix: PROFILE_STORAGE_KEY_PREFIX,
    profileStorageKey,

    listProfileKeys() {
      return enumerateStorageKeys(storage)
        .filter((key) => key.startsWith(PROFILE_STORAGE_KEY_PREFIX))
        .sort();
    },

    listProfileNames() {
      return this.listProfileKeys().map((key) => key.slice(PROFILE_STORAGE_KEY_PREFIX.length));
    },

    hasProfile(athleteName) {
      return storage.getItem(profileStorageKey(athleteName)) != null;
    },

    /**
     * Load by full storage key (e.g. athlete_Xavier).
     * Missing key → null (JSON.parse(null) / !data path in current UI).
     * Invalid JSON → throws (current chargerProfil behavior).
     */
    loadProfileByKey(key) {
      const raw = storage.getItem(key);
      if (raw == null) return null;
      return JSON.parse(raw);
    },

    loadProfile(athleteName) {
      return this.loadProfileByKey(profileStorageKey(athleteName));
    },

    /**
     * Persist profile JSON with compact serialization (no pretty-print),
     * matching localStorage.setItem(..., JSON.stringify(data)).
     */
    saveProfile(athleteName, data) {
      storage.setItem(profileStorageKey(athleteName), JSON.stringify(data));
    },

    removeProfileByKey(key) {
      storage.removeItem(key);
    },

    removeProfile(athleteName) {
      this.removeProfileByKey(profileStorageKey(athleteName));
    },
  };
}

/**
 * Browser/local adapter — uses global localStorage by default.
 * @param {Storage} [storage]
 */
export function createLocalStorageClientProfileStore(storage = globalThis.localStorage) {
  return createClientProfileStore(storage);
}
