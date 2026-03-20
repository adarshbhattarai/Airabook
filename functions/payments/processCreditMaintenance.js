const { onSchedule } = require('firebase-functions/v2/scheduler');
const logger = require('firebase-functions/logger');

exports.processCreditMaintenance = onSchedule(
  {
    region: 'us-central1',
    schedule: 'every day 02:00',
    timeZone: 'UTC',
  },
  async () => {
    logger.info('processCreditMaintenance is disabled by policy', {
      reason: 'monthly credits are now refreshed lazily per signed-in user, and storage bytes do not trigger scheduled credit charges',
    });
  },
);
