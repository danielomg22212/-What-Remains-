export function createStorage(prefix = '', options = {}) {
  const fallbackPrefix = options.fallbackPrefix;

  return {
    get(key) {
      const value = localStorage.getItem(prefix + key);
      if (value !== null || fallbackPrefix === null || fallbackPrefix === undefined) return value;
      return localStorage.getItem(fallbackPrefix + key);
    },
    set(key, value) {
      localStorage.setItem(prefix + key, String(value));
    }
  };
}
