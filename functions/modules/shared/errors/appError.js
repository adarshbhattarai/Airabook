const { HttpsError } = require('firebase-functions/v2/https');
const { ErrorDefinitions } = require('./errorDefinitions');

function toStatus(firebaseCode) {
  const map = {
    'invalid-argument': 'INVALID_ARGUMENT',
    unauthenticated: 'UNAUTHENTICATED',
    'permission-denied': 'PERMISSION_DENIED',
    'failed-precondition': 'FAILED_PRECONDITION',
    'resource-exhausted': 'RESOURCE_EXHAUSTED',
    'not-found': 'NOT_FOUND',
    internal: 'INTERNAL',
  };
  return map[firebaseCode] || 'INTERNAL';
}

function buildAppError(firebaseCode, errorCode, overrideMessage) {
  const definition = ErrorDefinitions.get(errorCode);
  const message = overrideMessage || definition?.message || 'Request failed.';
  const status = definition?.status || toStatus(firebaseCode);

  return new HttpsError(firebaseCode, message, {
    errorCode,
    status,
  });
}

module.exports = {
  buildAppError,
};
