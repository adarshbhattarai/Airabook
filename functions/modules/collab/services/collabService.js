const admin = require('firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const {
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
} = require('../repositories/collabRepository');
const {
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
} = require('../models/collabTypes');
const { ErrorCodes } = require('../../shared/errors/errorCodes');
const { buildAppError } = require('../../shared/errors/appError');

function nowTs() {
  return Timestamp.now();
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return 0;
}

function isExpired(inviteData, nowMs = Date.now()) {
  return toMillis(inviteData?.expiresAt) > 0 && toMillis(inviteData.expiresAt) <= nowMs;
}

function expiresInTs(baseMs = Date.now()) {
  return Timestamp.fromMillis(baseMs + INVITE_TTL_MS);
}

async function runCleanupSafely(label, job) {
  try {
    return await job();
  } catch (error) {
    console.warn(`[collab] ${label} cleanup skipped:`, error?.message || error);
    return 0;
  }
}

function requireAuth(auth) {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
}

async function requireVerifiedCaller(auth) {
  try {
    const userRecord = await admin.auth().getUser(auth.uid);
    if (!userRecord?.emailVerified) {
      throw new HttpsError('failed-precondition', 'Please verify your email before managing co-author invites.');
    }
    // Auth is source of truth; mirror in Firestore is best-effort only.
    userRef(auth.uid).set({
      emailVerified: true,
    }, { merge: true }).catch((mirrorErr) => {
      console.warn('[collab] emailVerified mirror update skipped (caller)', {
        uid: auth?.uid || null,
        code: mirrorErr?.code || null,
        message: mirrorErr?.message || null,
      });
    });
  } catch (error) {
    console.error('[collab] requireVerifiedCaller failed', {
      uid: auth?.uid || null,
      code: error?.code || null,
      message: error?.message || null,
      authEmulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST || null,
      projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || null,
    });
    if (error instanceof HttpsError) throw error;
    if (error?.code === 'auth/user-not-found') {
      throw new HttpsError('unauthenticated', 'Authenticated user record not found.');
    }
    throw buildAppError('internal', ErrorCodes.INVITATION_VERIFICATION_FAILED);
  }
}

function resolveBookOwnerId(bookData = {}) {
  if (bookData?.ownerId) return bookData.ownerId;
  const members = bookData?.members || {};
  const ownerEntry = Object.entries(members).find(([, role]) => role === 'Owner');
  return ownerEntry?.[0] || null;
}

async function requireVerifiedUserAccount(uid) {
  try {
    const userRecord = await admin.auth().getUser(uid);
    if (!userRecord?.emailVerified) {
      throw new HttpsError('failed-precondition', 'Invitee must have a verified email account.');
    }
    // Auth is source of truth; mirror in Firestore is best-effort only.
    userRef(uid).set({
      emailVerified: true,
    }, { merge: true }).catch((mirrorErr) => {
      console.warn('[collab] emailVerified mirror update skipped (invitee)', {
        uid,
        code: mirrorErr?.code || null,
        message: mirrorErr?.message || null,
      });
    });
    return userRecord;
  } catch (error) {
    console.error('[collab] requireVerifiedUserAccount failed', {
      uid,
      code: error?.code || null,
      message: error?.message || null,
      authEmulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST || null,
      projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || null,
    });
    if (error instanceof HttpsError) throw error;
    if (error?.code === 'auth/user-not-found') {
      throw new HttpsError('failed-precondition', 'Invitee account not found in authentication. Ask them to sign in first.');
    }
    throw buildAppError('internal', ErrorCodes.INVITATION_VERIFICATION_FAILED);
  }
}

function getBookRole(bookData, uid) {
  const ownerId = resolveBookOwnerId(bookData);
  const isOwner = ownerId === uid || bookData?.members?.[uid] === 'Owner';
  const isCoAuthor = bookData?.members?.[uid] === 'Co-author';
  const memberPermissions = bookData?.memberPermissions?.[uid] || {};

  const permissions = isOwner
    ? {
      canManageMedia: true,
      canInviteCoAuthors: true,
      canManagePendingInvites: true,
      canRemoveCoAuthors: true,
    }
    : sanitizeMemberPermissions(memberPermissions, {
      canManageMedia: false,
      canInviteCoAuthors: false,
      canManagePendingInvites: false,
      canRemoveCoAuthors: false,
    });

  return {
    ownerId,
    isOwner,
    isCoAuthor,
    permissions,
  };
}

function ensureBookAccess(bookData, uid) {
  const role = getBookRole(bookData, uid);
  if (!role.isOwner && !role.isCoAuthor) {
    throw new HttpsError('permission-denied', 'You do not have access to this book.');
  }
  return role;
}

function ensurePermission(role, permissionKey) {
  if (role.isOwner) return;
  if (!role.permissions?.[permissionKey]) {
    throw new HttpsError('permission-denied', 'You do not have permission to perform this action.');
  }
}

function buildBookSummary(bookId, bookData = {}) {
  return {
    bookId,
    title: bookData?.babyName || bookData?.title || 'Untitled Book',
    coverImage: bookData?.coverImageUrl || null,
  };
}

function buildAlbumSummary(bookId, bookData = {}, albumData = {}) {
  return {
    id: bookId,
    coverImage: albumData?.coverImage || bookData?.coverImageUrl || null,
    type: 'book',
    name: albumData?.name || bookData?.babyName || bookData?.title || 'Untitled album',
    mediaCount: Number(albumData?.mediaCount || 0),
    updatedAt: new Date(),
  };
}

function countCoAuthors(bookData = {}) {
  const members = bookData?.members || {};
  return Object.values(members).filter((role) => role === 'Co-author').length;
}

async function applyCounterDeltaTx(tx, targetUserRef, delta) {
  tx.set(targetUserRef, {
    notificationCounters: {
      pendingInvites: FieldValue.increment(delta),
    },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function expireInviteById(inviteId, nowMs = Date.now()) {
  const targetInviteRef = inviteRef(inviteId);
  await db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(targetInviteRef);
    if (!inviteSnap.exists) return;
    const data = inviteSnap.data() || {};
    if (data.status !== INVITE_STATUS.PENDING) return;
    if (!isExpired(data, nowMs)) return;

    tx.update(targetInviteRef, {
      status: INVITE_STATUS.EXPIRED,
      updatedAt: FieldValue.serverTimestamp(),
      respondedAt: FieldValue.serverTimestamp(),
    });

    const inviteeUid = data.inviteeUid;
    if (!inviteeUid) return;
    const notifRef = userNotificationsRef(inviteeUid).doc(inviteSnap.id);
    const notifSnap = await tx.get(notifRef);
    if (notifSnap.exists) {
      tx.delete(notifRef);
      await applyCounterDeltaTx(tx, userRef(inviteeUid), -1);
    }
  });
}

async function cleanupExpiredInvitesForRecipient(inviteeUid, maxItems = 100) {
  const now = nowTs();
  const docs = await listExpiredPendingInvitesByRecipient(inviteeUid, now, maxItems);
  for (const docSnap of docs) {
    // eslint-disable-next-line no-await-in-loop
    await expireInviteById(docSnap.id);
  }
  return docs.length;
}

async function cleanupExpiredInvitesForBook(bookId, maxItems = 100) {
  const now = nowTs();
  const docs = await listExpiredPendingInvitesByBook(bookId, now, maxItems);
  for (const docSnap of docs) {
    // eslint-disable-next-line no-await-in-loop
    await expireInviteById(docSnap.id);
  }
  return docs.length;
}

function formatInviteForClient(id, data = {}) {
  return {
    inviteId: id,
    bookId: data.bookId,
    ownerId: data.ownerId,
    inviteeUid: data.inviteeUid,
    inviteeEmail: data.inviteeEmail || '',
    ownerName: data.ownerName || '',
    bookTitle: data.bookTitle || 'Untitled Book',
    canManageMedia: !!data.canManageMedia,
    canInviteCoAuthors: !!data.canInviteCoAuthors,
    status: data.status,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    expiresAt: toMillis(data.expiresAt),
    respondedAt: toMillis(data.respondedAt),
    resentAt: toMillis(data.resentAt),
  };
}

function formatNotificationForClient(id, data = {}) {
  return {
    id,
    type: data.type,
    inviteId: data.inviteId,
    bookId: data.bookId,
    bookTitle: data.bookTitle || 'Untitled Book',
    ownerId: data.ownerId,
    ownerName: data.ownerName || 'Book owner',
    canManageMedia: !!data.canManageMedia,
    createdAt: toMillis(data.createdAt),
    expiresAt: toMillis(data.expiresAt),
  };
}

async function inviteCoAuthor(data, auth) {
  requireAuth(auth);
  await requireVerifiedCaller(auth);

  const { bookId, uid, canManageMedia = true, canInviteCoAuthors = false } = data || {};
  if (!bookId || !uid) {
    throw new HttpsError('invalid-argument', 'bookId and uid are required.');
  }
  if (uid === auth.uid) {
    throw new HttpsError('invalid-argument', 'You cannot invite yourself.');
  }

  try {
    await runCleanupSafely(`book=${bookId}`, () => cleanupExpiredInvitesForBook(bookId));
    await runCleanupSafely(`recipient=${uid}`, () => cleanupExpiredInvitesForRecipient(uid));

    const { data: bookData } = await getBook(bookId);
    if (!bookData) {
      throw new HttpsError('not-found', 'Book not found.');
    }

    const actorRole = ensureBookAccess(bookData, auth.uid);
    ensurePermission(actorRole, 'canInviteCoAuthors');

    const ownerId = actorRole.ownerId;
    if (!ownerId) {
      throw new HttpsError('failed-precondition', 'Book owner metadata is missing. Please refresh and try again.');
    }
    if (!bookData.ownerId && ownerId) {
      await bookRef(bookId).set({
        ownerId,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const grantedCanInviteCoAuthors = actorRole.isOwner ? !!canInviteCoAuthors : false;

    const activeCoAuthors = countCoAuthors(bookData);

    if (bookData?.members?.[uid]) {
      throw new HttpsError('already-exists', 'User is already a member of this book.');
    }

    const targetUser = await requireVerifiedUserAccount(uid);

    const inviteId = buildInviteId(bookId, uid);
    const inviteDoc = await inviteRef(inviteId).get();
    const inviteData = inviteDoc.exists ? (inviteDoc.data() || {}) : null;
    const nowMs = Date.now();
    const expiresAt = expiresInTs(nowMs);

    let isResend = false;
    if (inviteData?.status === INVITE_STATUS.PENDING && !isExpired(inviteData, nowMs)) {
      const resendBase = Math.max(toMillis(inviteData.resentAt), toMillis(inviteData.updatedAt), toMillis(inviteData.createdAt));
      if (resendBase > 0 && (nowMs - resendBase) < RESEND_COOLDOWN_MS) {
        const waitMs = RESEND_COOLDOWN_MS - (nowMs - resendBase);
        const waitMin = Math.max(1, Math.ceil(waitMs / 60000));
        throw new HttpsError('failed-precondition', `Please wait ${waitMin} minute(s) before resending this invite.`);
      }
      isResend = true;
    } else {
      const pendingForRecipient = await countPendingInvitesForRecipient(uid, MAX_PENDING_PER_RECIPIENT + 1);
      if (pendingForRecipient >= MAX_PENDING_PER_RECIPIENT) {
        throw new HttpsError('resource-exhausted', 'This user has too many pending invites right now.');
      }
      const pendingForBook = await countPendingInvitesForBook(bookId, MAX_PENDING_PER_BOOK + 1);
      const usedSlots = activeCoAuthors + pendingForBook;
      if (usedSlots >= MAX_COAUTHORS_PER_BOOK) {
        throw new HttpsError(
          'resource-exhausted',
          `This book can have up to ${MAX_COAUTHORS_PER_BOOK} total co-author slots (active + pending invites).`
        );
      }
      if (pendingForBook >= MAX_PENDING_PER_BOOK) {
        throw new HttpsError('resource-exhausted', 'This book already has too many pending co-author invites.');
      }
    }

    const ownerDisplayName = actorRole.isOwner
      ? (auth?.token?.name || '')
      : ((await getUser(ownerId)).data?.displayName || auth?.token?.name || 'Book owner');

    await db.runTransaction(async (tx) => {
      const targetInviteRef = inviteRef(inviteId);
      const targetUserRef = userRef(uid);
      const notificationRef = userNotificationsRef(uid).doc(inviteId);

      const [freshInviteSnap, freshNotifSnap] = await Promise.all([
        tx.get(targetInviteRef),
        tx.get(notificationRef),
      ]);

      const existing = freshInviteSnap.exists ? (freshInviteSnap.data() || {}) : null;
      const nowServer = FieldValue.serverTimestamp();

      /** @type {import('../models/collabTypes').InviteDoc} */
      const invitePayload = {
        bookId,
        ownerId,
        inviteeUid: uid,
        inviteeEmail: (targetUser.email || '').toLowerCase(),
        ownerName: ownerDisplayName || 'Book owner',
        bookTitle: bookData.babyName || bookData.title || 'Untitled Book',
        canManageMedia: !!canManageMedia,
        canInviteCoAuthors: grantedCanInviteCoAuthors,
        status: INVITE_STATUS.PENDING,
        createdAt: existing?.createdAt || nowServer,
        updatedAt: nowServer,
        expiresAt,
        ...(isResend ? { resentAt: nowServer } : {}),
      };

      tx.set(targetInviteRef, invitePayload, { merge: true });

      /** @type {import('../models/collabTypes').NotificationDoc} */
      const notificationPayload = {
        type: NOTIFICATION_TYPE.COAUTHOR_INVITE,
        inviteId,
        bookId,
        bookTitle: invitePayload.bookTitle,
        ownerId,
        ownerName: invitePayload.ownerName,
        canManageMedia: !!canManageMedia,
        createdAt: freshNotifSnap.exists ? (freshNotifSnap.data()?.createdAt || nowServer) : nowServer,
        expiresAt,
      };

      tx.set(notificationRef, notificationPayload, { merge: true });

      const shouldIncrementCounter = !freshNotifSnap.exists;
      if (shouldIncrementCounter) {
        await applyCounterDeltaTx(tx, targetUserRef, 1);
      }
    });

    return {
      success: true,
      inviteId,
      status: isResend ? 'resent' : 'created',
      expiresAt: expiresAt.toMillis(),
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    console.error('[collab] inviteCoAuthor failed', {
      actorUid: auth?.uid || null,
      bookId,
      inviteeUid: uid,
      message: error?.message || 'Unknown error',
      stack: error?.stack || null,
    });
    throw buildAppError('internal', ErrorCodes.INVITATION_CREATE_FAILED);
  }
}

async function respondCoAuthorInvite(data, auth) {
  requireAuth(auth);
  const { inviteId, action } = data || {};
  if (!inviteId || !['accept', 'decline'].includes(action)) {
    throw new HttpsError('invalid-argument', 'inviteId and a valid action are required.');
  }

  const { data: inviteData, snap: inviteSnap } = await getInvite(inviteId);
  if (!inviteData || !inviteSnap.exists) {
    throw new HttpsError('not-found', 'Invite not found.');
  }

  if (inviteData.inviteeUid !== auth.uid) {
    throw new HttpsError('permission-denied', 'You do not have permission to respond to this invite.');
  }

  await runCleanupSafely(`recipient=${auth.uid}`, () => cleanupExpiredInvitesForRecipient(auth.uid));

  const { data: refreshedInviteData } = await getInvite(inviteId);
  if (!refreshedInviteData) {
    throw new HttpsError('not-found', 'Invite not found.');
  }

  if (refreshedInviteData.status === INVITE_STATUS.EXPIRED || isExpired(refreshedInviteData)) {
    await expireInviteById(inviteId);
    return { success: true, status: 'expired' };
  }

  if (refreshedInviteData.status !== INVITE_STATUS.PENDING) {
    return { success: true, status: refreshedInviteData.status || 'handled' };
  }

  const targetInviteRef = inviteRef(inviteId);
  const notificationRef = userNotificationsRef(auth.uid).doc(inviteId);
  const currentUserRef = userRef(auth.uid);

  if (action === 'decline') {
    await db.runTransaction(async (tx) => {
      const [freshInviteSnap, freshNotifSnap] = await Promise.all([
        tx.get(targetInviteRef),
        tx.get(notificationRef),
      ]);
      if (!freshInviteSnap.exists) return;
      const freshInvite = freshInviteSnap.data() || {};
      if (freshInvite.status !== INVITE_STATUS.PENDING) return;

      tx.update(targetInviteRef, {
        status: INVITE_STATUS.DECLINED,
        respondedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (freshNotifSnap.exists) {
        tx.delete(notificationRef);
        await applyCounterDeltaTx(tx, currentUserRef, -1);
      }
    });

    return { success: true, status: 'declined' };
  }

  const { data: bookData } = await getBook(refreshedInviteData.bookId);
  if (!bookData) {
    throw new HttpsError('not-found', 'Book not found for this invite.');
  }

  await db.runTransaction(async (tx) => {
    const targetBookRef = bookRef(refreshedInviteData.bookId);
    const targetAlbumRef = albumRef(refreshedInviteData.bookId);

    const [freshInviteSnap, freshBookSnap, freshUserSnap, freshNotifSnap, freshAlbumSnap] = await Promise.all([
      tx.get(targetInviteRef),
      tx.get(targetBookRef),
      tx.get(currentUserRef),
      tx.get(notificationRef),
      tx.get(targetAlbumRef),
    ]);

    if (!freshInviteSnap.exists || !freshBookSnap.exists) {
      throw new HttpsError('not-found', 'Invite or book no longer exists.');
    }

    const invite = freshInviteSnap.data() || {};
    const book = freshBookSnap.data() || {};

    if (invite.status !== INVITE_STATUS.PENDING) {
      return;
    }

    const members = { ...(book.members || {}) };
    const currentCoAuthors = Object.values(members).filter((role) => role === 'Co-author').length;
    if (members[auth.uid] !== 'Co-author' && currentCoAuthors >= MAX_COAUTHORS_PER_BOOK) {
      throw new HttpsError(
        'resource-exhausted',
        `This book already has ${MAX_COAUTHORS_PER_BOOK} co-authors.`
      );
    }
    members[auth.uid] = 'Co-author';

    const currentMemberPermissions = { ...(book.memberPermissions || {}) };
    currentMemberPermissions[auth.uid] = sanitizeMemberPermissions({
      ...MEMBER_PERMISSION_DEFAULTS,
      canManageMedia: !!invite.canManageMedia,
      canInviteCoAuthors: !!invite.canInviteCoAuthors,
    });

    tx.update(targetBookRef, {
      members,
      memberPermissions: currentMemberPermissions,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const userData = freshUserSnap.exists ? (freshUserSnap.data() || {}) : {};
    const accessibleBookIds = upsertAccessibleBookIds(userData.accessibleBookIds || [], buildBookSummary(refreshedInviteData.bookId, book));

    const userUpdates = {
      accessibleBookIds,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (invite.canManageMedia) {
      const albumData = freshAlbumSnap.exists ? (freshAlbumSnap.data() || {}) : {};
      userUpdates.accessibleAlbums = upsertAccessibleAlbum(
        userData.accessibleAlbums || [],
        buildAlbumSummary(refreshedInviteData.bookId, book, albumData)
      );

      if (freshAlbumSnap.exists) {
        const accessPermission = { ...(albumData.accessPermission || {}) };
        const sharedWith = Array.isArray(accessPermission.sharedWith) ? [...accessPermission.sharedWith] : [];
        if (!sharedWith.includes(auth.uid)) {
          sharedWith.push(auth.uid);
        }
        accessPermission.sharedWith = sharedWith;
        tx.update(targetAlbumRef, {
          accessPermission,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    tx.set(currentUserRef, userUpdates, { merge: true });

    tx.update(targetInviteRef, {
      status: INVITE_STATUS.ACCEPTED,
      respondedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (freshNotifSnap.exists) {
      tx.delete(notificationRef);
      await applyCounterDeltaTx(tx, currentUserRef, -1);
    }
  });

  return { success: true, status: 'accepted' };
}

async function manageCoAuthorInvite(data, auth) {
  requireAuth(auth);
  await requireVerifiedCaller(auth);

  const { inviteId, action } = data || {};
  if (!inviteId || !['resend', 'cancel'].includes(action)) {
    throw new HttpsError('invalid-argument', 'inviteId and valid action are required.');
  }

  const { data: inviteData } = await getInvite(inviteId);
  if (!inviteData) {
    throw new HttpsError('not-found', 'Invite not found.');
  }

  const { data: bookData } = await getBook(inviteData.bookId);
  if (!bookData) {
    throw new HttpsError('not-found', 'Book not found.');
  }

  const role = ensureBookAccess(bookData, auth.uid);
  ensurePermission(role, 'canManagePendingInvites');

  await runCleanupSafely(`book=${inviteData.bookId}`, () => cleanupExpiredInvitesForBook(inviteData.bookId));
  await runCleanupSafely(`recipient=${inviteData.inviteeUid}`, () => cleanupExpiredInvitesForRecipient(inviteData.inviteeUid));

  const targetInviteRef = inviteRef(inviteId);
  const targetNotifRef = userNotificationsRef(inviteData.inviteeUid).doc(inviteId);
  const targetInviteeRef = userRef(inviteData.inviteeUid);

  if (action === 'cancel') {
    await db.runTransaction(async (tx) => {
      const [freshInviteSnap, freshNotifSnap] = await Promise.all([
        tx.get(targetInviteRef),
        tx.get(targetNotifRef),
      ]);
      if (!freshInviteSnap.exists) return;
      const freshInvite = freshInviteSnap.data() || {};
      if (freshInvite.status !== INVITE_STATUS.PENDING) return;

      tx.update(targetInviteRef, {
        status: INVITE_STATUS.CANCELLED,
        updatedAt: FieldValue.serverTimestamp(),
        respondedAt: FieldValue.serverTimestamp(),
      });

      if (freshNotifSnap.exists) {
        tx.delete(targetNotifRef);
        await applyCounterDeltaTx(tx, targetInviteeRef, -1);
      }
    });

    return { success: true, status: 'cancelled' };
  }

  const nowMs = Date.now();
  const nextExpiry = expiresInTs(nowMs);

  await db.runTransaction(async (tx) => {
    const [freshInviteSnap, freshNotifSnap] = await Promise.all([
      tx.get(targetInviteRef),
      tx.get(targetNotifRef),
    ]);

    if (!freshInviteSnap.exists) {
      throw new HttpsError('not-found', 'Invite no longer exists.');
    }

    const freshInvite = freshInviteSnap.data() || {};
    if (freshInvite.status !== INVITE_STATUS.PENDING) {
      throw new HttpsError('failed-precondition', 'Only pending invites can be resent.');
    }

    const resendBase = Math.max(toMillis(freshInvite.resentAt), toMillis(freshInvite.updatedAt), toMillis(freshInvite.createdAt));
    if (resendBase > 0 && (nowMs - resendBase) < RESEND_COOLDOWN_MS) {
      const waitMs = RESEND_COOLDOWN_MS - (nowMs - resendBase);
      const waitMin = Math.max(1, Math.ceil(waitMs / 60000));
      throw new HttpsError('failed-precondition', `Please wait ${waitMin} minute(s) before resending.`);
    }

    tx.update(targetInviteRef, {
      status: INVITE_STATUS.PENDING,
      updatedAt: FieldValue.serverTimestamp(),
      resentAt: FieldValue.serverTimestamp(),
      expiresAt: nextExpiry,
    });

    const notifPayload = {
      type: NOTIFICATION_TYPE.COAUTHOR_INVITE,
      inviteId,
      bookId: freshInvite.bookId,
      bookTitle: freshInvite.bookTitle || 'Untitled Book',
      ownerId: freshInvite.ownerId,
      ownerName: freshInvite.ownerName || 'Book owner',
      canManageMedia: !!freshInvite.canManageMedia,
      createdAt: freshNotifSnap.exists ? (freshNotifSnap.data()?.createdAt || FieldValue.serverTimestamp()) : FieldValue.serverTimestamp(),
      expiresAt: nextExpiry,
    };

    tx.set(targetNotifRef, notifPayload, { merge: true });

    if (!freshNotifSnap.exists) {
      await applyCounterDeltaTx(tx, targetInviteeRef, 1);
    }
  });

  return {
    success: true,
    status: 'resent',
    expiresAt: nextExpiry.toMillis(),
  };
}

async function removeCoAuthor(data, auth) {
  requireAuth(auth);
  const { bookId, coAuthorUid } = data || {};
  if (!bookId || !coAuthorUid) {
    throw new HttpsError('invalid-argument', 'bookId and coAuthorUid are required.');
  }

  const { data: bookData } = await getBook(bookId);
  if (!bookData) {
    throw new HttpsError('not-found', 'Book not found.');
  }

  const role = ensureBookAccess(bookData, auth.uid);
  ensurePermission(role, 'canRemoveCoAuthors');

  if (bookData.ownerId === coAuthorUid || bookData.members?.[coAuthorUid] === 'Owner') {
    throw new HttpsError('failed-precondition', 'Owner cannot be removed as co-author.');
  }

  const inviteId = buildInviteId(bookId, coAuthorUid);
  const targetInviteRef = inviteRef(inviteId);
  const targetNotifRef = userNotificationsRef(coAuthorUid).doc(inviteId);
  const targetUserRef = userRef(coAuthorUid);

  await db.runTransaction(async (tx) => {
    const targetBookRef = bookRef(bookId);
    const targetAlbumRef = albumRef(bookId);

    const [freshBookSnap, freshUserSnap, freshAlbumSnap, freshInviteSnap, freshNotifSnap] = await Promise.all([
      tx.get(targetBookRef),
      tx.get(targetUserRef),
      tx.get(targetAlbumRef),
      tx.get(targetInviteRef),
      tx.get(targetNotifRef),
    ]);

    if (!freshBookSnap.exists) {
      throw new HttpsError('not-found', 'Book not found.');
    }

    const freshBook = freshBookSnap.data() || {};
    const members = { ...(freshBook.members || {}) };
    delete members[coAuthorUid];

    const memberPermissions = { ...(freshBook.memberPermissions || {}) };
    delete memberPermissions[coAuthorUid];

    tx.update(targetBookRef, {
      members,
      memberPermissions,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (freshUserSnap.exists) {
      const userData = freshUserSnap.data() || {};
      tx.set(targetUserRef, {
        accessibleBookIds: removeAccessibleBook(userData.accessibleBookIds || [], bookId),
        accessibleAlbums: removeAccessibleAlbum(userData.accessibleAlbums || [], bookId),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    if (freshAlbumSnap.exists) {
      const albumData = freshAlbumSnap.data() || {};
      const accessPermission = { ...(albumData.accessPermission || {}) };
      const sharedWith = Array.isArray(accessPermission.sharedWith) ? [...accessPermission.sharedWith] : [];
      accessPermission.sharedWith = sharedWith.filter((uid) => uid !== coAuthorUid);
      tx.update(targetAlbumRef, {
        accessPermission,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    if (freshInviteSnap.exists) {
      const invite = freshInviteSnap.data() || {};
      if (invite.status === INVITE_STATUS.PENDING) {
        tx.update(targetInviteRef, {
          status: INVITE_STATUS.CANCELLED,
          updatedAt: FieldValue.serverTimestamp(),
          respondedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    if (freshNotifSnap.exists) {
      tx.delete(targetNotifRef);
      await applyCounterDeltaTx(tx, targetUserRef, -1);
    }
  });

  return { success: true };
}

async function setCoAuthorPermissions(data, auth) {
  requireAuth(auth);
  const { bookId, targetUid, permissions } = data || {};
  if (!bookId || !targetUid || !permissions) {
    throw new HttpsError('invalid-argument', 'bookId, targetUid and permissions are required.');
  }

  const { data: bookData } = await getBook(bookId);
  if (!bookData) {
    throw new HttpsError('not-found', 'Book not found.');
  }

  const role = ensureBookAccess(bookData, auth.uid);
  if (!role.isOwner) {
    throw new HttpsError('permission-denied', 'Only owner can change collaborator permissions.');
  }

  if (bookData.ownerId === targetUid || bookData.members?.[targetUid] === 'Owner') {
    throw new HttpsError('failed-precondition', 'Owner permissions cannot be edited here.');
  }

  if (bookData.members?.[targetUid] !== 'Co-author') {
    throw new HttpsError('not-found', 'Target user is not a co-author of this book.');
  }

  const nextPermissions = sanitizeMemberPermissions(permissions, MEMBER_PERMISSION_DEFAULTS);

  await db.runTransaction(async (tx) => {
    const targetBookRef = bookRef(bookId);
    const targetAlbumRef = albumRef(bookId);
    const targetUserRef = userRef(targetUid);

    const [freshBookSnap, freshAlbumSnap, freshUserSnap] = await Promise.all([
      tx.get(targetBookRef),
      tx.get(targetAlbumRef),
      tx.get(targetUserRef),
    ]);

    if (!freshBookSnap.exists) {
      throw new HttpsError('not-found', 'Book not found.');
    }

    const freshBook = freshBookSnap.data() || {};
    const memberPermissions = { ...(freshBook.memberPermissions || {}) };
    const currentPermissions = sanitizeMemberPermissions(memberPermissions[targetUid] || {}, MEMBER_PERMISSION_DEFAULTS);
    memberPermissions[targetUid] = nextPermissions;

    tx.update(targetBookRef, {
      memberPermissions,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const mediaTurnedOff = currentPermissions.canManageMedia && !nextPermissions.canManageMedia;
    const mediaTurnedOn = !currentPermissions.canManageMedia && nextPermissions.canManageMedia;

    if (freshAlbumSnap.exists && (mediaTurnedOff || mediaTurnedOn)) {
      const albumData = freshAlbumSnap.data() || {};
      const accessPermission = { ...(albumData.accessPermission || {}) };
      const sharedWith = Array.isArray(accessPermission.sharedWith) ? [...accessPermission.sharedWith] : [];

      if (mediaTurnedOn && !sharedWith.includes(targetUid)) {
        sharedWith.push(targetUid);
      }
      if (mediaTurnedOff) {
        accessPermission.sharedWith = sharedWith.filter((uid) => uid !== targetUid);
      } else {
        accessPermission.sharedWith = sharedWith;
      }

      tx.update(targetAlbumRef, {
        accessPermission,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    if (freshUserSnap.exists && (mediaTurnedOff || mediaTurnedOn)) {
      const userData = freshUserSnap.data() || {};
      const nextAccessibleAlbums = mediaTurnedOn
        ? upsertAccessibleAlbum(userData.accessibleAlbums || [], buildAlbumSummary(bookId, freshBook, freshAlbumSnap.exists ? freshAlbumSnap.data() : {}))
        : removeAccessibleAlbum(userData.accessibleAlbums || [], bookId);

      tx.set(targetUserRef, {
        accessibleAlbums: nextAccessibleAlbums,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });

  return {
    success: true,
    permissions: nextPermissions,
  };
}

async function listNotifications(data, auth) {
  requireAuth(auth);
  const { pageSize = 20, cursorId = null, type = null, bookId = null } = data || {};
  const size = Math.max(1, Math.min(50, Number(pageSize) || 20));

  await runCleanupSafely(`recipient=${auth.uid}`, () => cleanupExpiredInvitesForRecipient(auth.uid));

  let q = userNotificationsRef(auth.uid).orderBy('createdAt', 'desc').limit(size);
  if (type) {
    q = q.where('type', '==', String(type));
  }
  if (bookId) {
    q = q.where('bookId', '==', String(bookId));
  }

  if (cursorId) {
    const cursorSnap = await userNotificationsRef(auth.uid).doc(String(cursorId)).get();
    if (cursorSnap.exists) {
      q = q.startAfter(cursorSnap);
    }
  }

  const snap = await q.get();
  const notifications = snap.docs.map((docSnap) => formatNotificationForClient(docSnap.id, docSnap.data() || {}));
  const nextCursor = snap.docs.length === size ? snap.docs[snap.docs.length - 1].id : null;

  const userSnap = await userRef(auth.uid).get();
  const rawCounter = Number(userSnap.data()?.notificationCounters?.pendingInvites || 0);
  const counter = Math.max(0, rawCounter);
  if (rawCounter < 0) {
    await userRef(auth.uid).set({
      notificationCounters: {
        pendingInvites: 0,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  return {
    success: true,
    notifications,
    nextCursor,
    pendingCount: counter,
  };
}

async function listPendingCoAuthorInvites(data, auth) {
  requireAuth(auth);
  const { bookId, pageSize = 25, cursorId = null } = data || {};
  if (!bookId) {
    throw new HttpsError('invalid-argument', 'bookId is required.');
  }

  const { data: bookData } = await getBook(bookId);
  if (!bookData) {
    throw new HttpsError('not-found', 'Book not found.');
  }

  const role = ensureBookAccess(bookData, auth.uid);
  ensurePermission(role, 'canManagePendingInvites');

  await runCleanupSafely(`book=${bookId}`, () => cleanupExpiredInvitesForBook(bookId));

  const size = Math.max(1, Math.min(50, Number(pageSize) || 25));
  let q = db
    .collection('invites')
    .where('bookId', '==', bookId)
    .where('status', '==', INVITE_STATUS.PENDING)
    .orderBy('createdAt', 'desc')
    .limit(size);

  if (cursorId) {
    const cursorSnap = await inviteRef(String(cursorId)).get();
    if (cursorSnap.exists) {
      q = q.startAfter(cursorSnap);
    }
  }

  const snap = await q.get();
  const invites = snap.docs.map((docSnap) => formatInviteForClient(docSnap.id, docSnap.data() || {}));
  const nextCursor = snap.docs.length === size ? snap.docs[snap.docs.length - 1].id : null;

  return {
    success: true,
    invites,
    nextCursor,
  };
}

async function syncUserAuthFlags(data, auth) {
  requireAuth(auth);
  const email = (auth.token?.email || '').toLowerCase();
  const emailVerified = !!auth.token?.email_verified;
  const displayName = auth.token?.name || '';

  await userRef(auth.uid).set({
    uid: auth.uid,
    email,
    displayName,
    emailVerified,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    success: true,
    emailVerified,
  };
}

module.exports = {
  inviteCoAuthor,
  respondCoAuthorInvite,
  manageCoAuthorInvite,
  removeCoAuthor,
  setCoAuthorPermissions,
  listNotifications,
  listPendingCoAuthorInvites,
  syncUserAuthFlags,
  cleanupExpiredInvitesForRecipient,
  cleanupExpiredInvitesForBook,
};
