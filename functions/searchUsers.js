const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const SEARCH_RESULTS_LIMIT = 10;

async function resolveVerifiedUser(docSnap) {
  const data = docSnap.data() || {};
  const uid = docSnap.id;

  try {
    const authUser = await admin.auth().getUser(uid);
    if (authUser?.emailVerified) {
      const mergedData = {
        ...data,
        email: data.email || authUser.email || '',
        displayName: data.displayName || authUser.displayName || '',
        photoURL: data.photoURL || authUser.photoURL || null,
        emailVerified: true,
      };

      await docSnap.ref.set({
        email: mergedData.email,
        displayName: mergedData.displayName,
        displayNameLower: (mergedData.displayName || '').toLowerCase(),
        photoURL: mergedData.photoURL,
        emailVerified: true,
      }, { merge: true });

      return { uid, data: mergedData, isVerified: true };
    }
  } catch (error) {
    console.warn(`searchUsers verify lookup failed for ${uid}:`, error?.message || error);
  }

  return { uid, data, isVerified: false };
}

exports.searchUsers = onCall({ region: 'us-central1', cors: true }, async (request) => {
  const { data, auth } = request;
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in to search users.');
  }

  const searchTerm = String(data?.searchTerm || '').trim();
  if (searchTerm.length < 2) {
    return { results: [] };
  }

  const searchLower = searchTerm.toLowerCase();
  const usersRef = db.collection('users');
  const candidatesById = new Map();

  try {
    if (searchTerm.includes('@')) {
      // Exact/prefix email search (works for partial email too, e.g. "adarsh.bhat")
      const byEmailPrefix = await usersRef
        .where('email', '>=', searchLower)
        .where('email', '<=', `${searchLower}\uf8ff`)
        .limit(SEARCH_RESULTS_LIMIT)
        .get();
      for (const docSnap of byEmailPrefix.docs) {
        candidatesById.set(docSnap.id, docSnap);
      }
    } else {
      const byName = await usersRef
        .orderBy('displayNameLower')
        .where('displayNameLower', '>=', searchLower)
        .where('displayNameLower', '<=', `${searchLower}\uf8ff`)
        .limit(SEARCH_RESULTS_LIMIT)
        .get();
      for (const docSnap of byName.docs) {
        candidatesById.set(docSnap.id, docSnap);
      }

      // Also match users by email prefix when user types partial local-part.
      const byEmailPrefix = await usersRef
        .where('email', '>=', searchLower)
        .where('email', '<=', `${searchLower}\uf8ff`)
        .limit(SEARCH_RESULTS_LIMIT)
        .get();
      for (const docSnap of byEmailPrefix.docs) {
        candidatesById.set(docSnap.id, docSnap);
      }
    }

    const candidateDocs = Array.from(candidatesById.values()).slice(0, SEARCH_RESULTS_LIMIT * 2);
    const results = [];
    for (const docSnap of candidateDocs) {
      const uid = docSnap.id;
      if (uid === auth.uid) continue; // keep no-self-invite behavior

      // eslint-disable-next-line no-await-in-loop
      const resolved = await resolveVerifiedUser(docSnap);
      if (!resolved.isVerified) continue;

      results.push({
        id: uid,
        displayName: resolved.data.displayName || 'Unknown User',
        email: resolved.data.email || '',
        photoURL: resolved.data.photoURL || null,
        emailVerified: true,
      });
      if (results.length >= SEARCH_RESULTS_LIMIT) break;
    }

    return { results };
  } catch (error) {
    console.error('Error searching users:', error);
    throw new HttpsError('internal', 'Failed to search users. Please try again.');
  }
});
