const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const db = getFirestore();

function userRef(uid) {
  return db.collection('users').doc(uid);
}

function userNotificationsRef(uid) {
  return userRef(uid).collection('notifications');
}

function bookRef(bookId) {
  return db.collection('books').doc(bookId);
}

function albumRef(bookId) {
  return db.collection('albums').doc(bookId);
}

function inviteRef(inviteId) {
  return db.collection('invites').doc(inviteId);
}

async function getBook(bookId) {
  const snap = await bookRef(bookId).get();
  return { snap, data: snap.exists ? (snap.data() || {}) : null };
}

async function getUser(uid) {
  const snap = await userRef(uid).get();
  return { snap, data: snap.exists ? (snap.data() || {}) : null };
}

async function getInvite(inviteId) {
  const snap = await inviteRef(inviteId).get();
  return { snap, data: snap.exists ? (snap.data() || {}) : null };
}

async function countPendingInvitesForRecipient(inviteeUid, hardLimit = 250) {
  const snap = await db
    .collection('invites')
    .where('inviteeUid', '==', inviteeUid)
    .where('status', '==', 'pending')
    .limit(hardLimit)
    .get();
  return snap.size || 0;
}

async function countPendingInvitesForBook(bookId, hardLimit = 100) {
  const snap = await db
    .collection('invites')
    .where('bookId', '==', bookId)
    .where('status', '==', 'pending')
    .limit(hardLimit)
    .get();
  return snap.size || 0;
}

async function listExpiredPendingInvitesByRecipient(inviteeUid, nowTs, pageSize = 100) {
  const snap = await db
    .collection('invites')
    .where('inviteeUid', '==', inviteeUid)
    .where('status', '==', 'pending')
    .where('expiresAt', '<=', nowTs)
    .limit(pageSize)
    .get();
  return snap.docs;
}

async function listExpiredPendingInvitesByBook(bookId, nowTs, pageSize = 100) {
  const snap = await db
    .collection('invites')
    .where('bookId', '==', bookId)
    .where('status', '==', 'pending')
    .where('expiresAt', '<=', nowTs)
    .limit(pageSize)
    .get();
  return snap.docs;
}

function upsertAccessibleBookIds(entries = [], bookSummary) {
  let normalized = Array.isArray(entries) ? [...entries] : [];
  if (normalized.length > 0 && typeof normalized[0] === 'string') {
    normalized = normalized.map((id) => ({ bookId: id, title: 'Untitled Book', coverImage: null }));
  }
  const idx = normalized.findIndex((entry) => entry?.bookId === bookSummary.bookId);
  if (idx >= 0) {
    normalized[idx] = { ...normalized[idx], ...bookSummary };
    return normalized;
  }
  normalized.push(bookSummary);
  return normalized;
}

function removeAccessibleBook(entries = [], bookId) {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => {
    const id = typeof entry === 'string' ? entry : entry?.bookId;
    return id !== bookId;
  });
}

function upsertAccessibleAlbum(entries = [], albumSummary) {
  const normalized = Array.isArray(entries) ? [...entries] : [];
  const idx = normalized.findIndex((entry) => entry?.id === albumSummary.id);
  if (idx >= 0) {
    normalized[idx] = { ...normalized[idx], ...albumSummary };
    return normalized;
  }
  normalized.push(albumSummary);
  return normalized;
}

function removeAccessibleAlbum(entries = [], albumId) {
  if (!Array.isArray(entries)) return [];
  return entries.filter((entry) => entry?.id !== albumId);
}

module.exports = {
  db,
  FieldValue,
  userRef,
  userNotificationsRef,
  bookRef,
  albumRef,
  inviteRef,
  getBook,
  getUser,
  getInvite,
  countPendingInvitesForRecipient,
  countPendingInvitesForBook,
  listExpiredPendingInvitesByRecipient,
  listExpiredPendingInvitesByBook,
  upsertAccessibleBookIds,
  removeAccessibleBook,
  upsertAccessibleAlbum,
  removeAccessibleAlbum,
};
