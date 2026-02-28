const { onRequest } = require('firebase-functions/v2/https');
const { setCorsHeaders } = require('./utils/http');

const REGION = 'us-central1';
const DISABLED_MESSAGE = 'airabookaiStream is not supported. Use /api/v1/chat/stream.';

exports.airabookaiStream = onRequest({ region: REGION }, async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  res.status(410).json({
    error: DISABLED_MESSAGE,
  });
});
