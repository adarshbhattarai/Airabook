const { onCall } = require('firebase-functions/v2/https');
const { listPendingCoAuthorInvitesController } = require('./modules/collab/controllers/collabController');

exports.listPendingCoAuthorInvites = onCall({ region: 'us-central1', cors: true }, listPendingCoAuthorInvitesController);
