/**
 * Shared ID generator for the client.
 * Mirrors the Firebase Functions helper so any new documents
 * created from the browser follow the same pattern.
 */
export const IDGenerator = {
  generateId(prefix = 'id') {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
    }
    // Fallback when crypto.randomUUID is unavailable
    const segment = () => Math.random().toString(16).slice(2, 10);
    return `${prefix}_${segment()}${segment()}`;
  },
};


