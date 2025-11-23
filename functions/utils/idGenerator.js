const { randomUUID } = require('crypto');

/**
 * Centralized ID generator to keep identifiers consistent
 * across functions. Always call this helper instead of
 * crafting IDs manually.
 */
const IDGenerator = {
  /**
   * Produce a short deterministic-friendly identifier.
   * @param {string} prefix optional namespace prefix
   * @returns {string}
   */
  generateId(prefix = 'id') {
    const base = randomUUID().replace(/-/g, '');
    return `${prefix}_${base}`;
  },
};

module.exports = { IDGenerator };


