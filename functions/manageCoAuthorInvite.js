const { onCall } = require('firebase-functions/v2/https');
const { manageCoAuthorInviteController } = require('./modules/collab/controllers/collabController');

exports.manageCoAuthorInvite = onCall({ region: 'us-central1', cors: true }, manageCoAuthorInviteController);
