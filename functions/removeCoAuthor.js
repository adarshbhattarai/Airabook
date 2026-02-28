const { onCall } = require('firebase-functions/v2/https');
const { removeCoAuthorController } = require('./modules/collab/controllers/collabController');

exports.removeCoAuthor = onCall({ region: 'us-central1', cors: true }, removeCoAuthorController);
