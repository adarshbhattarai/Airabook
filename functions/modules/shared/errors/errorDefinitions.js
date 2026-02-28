const { ErrorCodes } = require('./errorCodes');

class ErrorDefinitions {
  static MAP = Object.freeze({
    [ErrorCodes.INVITATION_VERIFICATION_FAILED]: Object.freeze({
      message: 'Invitation verification failed.',
      status: 'INTERNAL',
    }),
    [ErrorCodes.INVITATION_CREATE_FAILED]: Object.freeze({
      message: 'Invitation request failed.',
      status: 'INTERNAL',
    }),
  });

  static get(errorCode) {
    return this.MAP[errorCode] || null;
  }
}

module.exports = { ErrorDefinitions };
