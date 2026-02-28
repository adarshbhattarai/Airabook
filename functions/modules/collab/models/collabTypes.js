const INVITE_STATUS = Object.freeze({
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});

const NOTIFICATION_TYPE = Object.freeze({
  COAUTHOR_INVITE: 'coauthor_invite',
});

const INVITE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 15 * 60 * 1000;
const MAX_PENDING_PER_RECIPIENT = 200;
const MAX_PENDING_PER_BOOK = 50;
const MAX_COAUTHORS_PER_BOOK = 5;

const MEMBER_PERMISSION_DEFAULTS = Object.freeze({
  canManageMedia: true,
  canInviteCoAuthors: false,
  canManagePendingInvites: false,
  canRemoveCoAuthors: false,
});

/**
 * @typedef {Object} MemberPermissions
 * @property {boolean=} canManageMedia
 * @property {boolean=} canInviteCoAuthors
 * @property {boolean=} canManagePendingInvites
 * @property {boolean=} canRemoveCoAuthors
 */

/**
 * @typedef {Object} InviteDoc
 * @property {string} bookId
 * @property {string} ownerId
 * @property {string} inviteeUid
 * @property {string} inviteeEmail
 * @property {string} ownerName
 * @property {string} bookTitle
 * @property {boolean} canManageMedia
 * @property {boolean=} canInviteCoAuthors
 * @property {'pending'|'accepted'|'declined'|'cancelled'|'expired'} status
 * @property {any} createdAt
 * @property {any} updatedAt
 * @property {any} expiresAt
 * @property {any=} respondedAt
 * @property {any=} resentAt
 */

/**
 * @typedef {Object} NotificationDoc
 * @property {'coauthor_invite'} type
 * @property {string} inviteId
 * @property {string} bookId
 * @property {string} bookTitle
 * @property {string} ownerId
 * @property {string} ownerName
 * @property {boolean} canManageMedia
 * @property {any} createdAt
 * @property {any} expiresAt
 */

function buildInviteId(bookId, inviteeUid) {
  return `${bookId}__${inviteeUid}`;
}

function toBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  return fallback;
}

function sanitizeMemberPermissions(input = {}, defaults = MEMBER_PERMISSION_DEFAULTS) {
  return {
    canManageMedia: toBool(input.canManageMedia, defaults.canManageMedia),
    canInviteCoAuthors: toBool(input.canInviteCoAuthors, defaults.canInviteCoAuthors),
    canManagePendingInvites: toBool(input.canManagePendingInvites, defaults.canManagePendingInvites),
    canRemoveCoAuthors: toBool(input.canRemoveCoAuthors, defaults.canRemoveCoAuthors),
  };
}

module.exports = {
  INVITE_STATUS,
  NOTIFICATION_TYPE,
  INVITE_TTL_MS,
  RESEND_COOLDOWN_MS,
  MAX_PENDING_PER_RECIPIENT,
  MAX_PENDING_PER_BOOK,
  MAX_COAUTHORS_PER_BOOK,
  MEMBER_PERMISSION_DEFAULTS,
  buildInviteId,
  sanitizeMemberPermissions,
};
