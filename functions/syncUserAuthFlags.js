const { onCall } = require('firebase-functions/v2/https');
const { syncUserAuthFlagsController } = require('./modules/collab/controllers/collabController');

exports.syncUserAuthFlags = onCall({ region: 'us-central1', cors: true }, syncUserAuthFlagsController);
