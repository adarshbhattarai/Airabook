const { onCall } = require('firebase-functions/v2/https');
const { setCoAuthorPermissionsController } = require('./modules/collab/controllers/collabController');

exports.setCoAuthorPermissions = onCall({ region: 'us-central1', cors: true }, setCoAuthorPermissionsController);
