const { onCall } = require('firebase-functions/v2/https');
const { respondCoAuthorInviteController } = require('./modules/collab/controllers/collabController');

exports.respondCoAuthorInvite = onCall({ region: 'us-central1', cors: true }, respondCoAuthorInviteController);
