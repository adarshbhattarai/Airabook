const collabService = require('../services/collabService');

async function inviteCoAuthorController(request) {
  return collabService.inviteCoAuthor(request.data, request.auth);
}

async function respondCoAuthorInviteController(request) {
  return collabService.respondCoAuthorInvite(request.data, request.auth);
}

async function manageCoAuthorInviteController(request) {
  return collabService.manageCoAuthorInvite(request.data, request.auth);
}

async function removeCoAuthorController(request) {
  return collabService.removeCoAuthor(request.data, request.auth);
}

async function setCoAuthorPermissionsController(request) {
  return collabService.setCoAuthorPermissions(request.data, request.auth);
}

async function listNotificationsController(request) {
  return collabService.listNotifications(request.data, request.auth);
}

async function listPendingCoAuthorInvitesController(request) {
  return collabService.listPendingCoAuthorInvites(request.data, request.auth);
}

async function syncUserAuthFlagsController(request) {
  return collabService.syncUserAuthFlags(request.data, request.auth);
}

module.exports = {
  inviteCoAuthorController,
  respondCoAuthorInviteController,
  manageCoAuthorInviteController,
  removeCoAuthorController,
  setCoAuthorPermissionsController,
  listNotificationsController,
  listPendingCoAuthorInvitesController,
  syncUserAuthFlagsController,
};
