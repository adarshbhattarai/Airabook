const { onCall } = require('firebase-functions/v2/https');
const { inviteCoAuthorController } = require('./modules/collab/controllers/collabController');

exports.inviteCoAuthor = onCall({ region: 'us-central1', cors: true }, inviteCoAuthorController);
