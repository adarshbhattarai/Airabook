import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

const call = async (name, payload = {}) => {
  const fn = httpsCallable(functions, name);
  const result = await fn(payload);
  return result?.data;
};

export const collabApi = {
  inviteCoAuthor: (payload) => call('inviteCoAuthor', payload),
  respondCoAuthorInvite: (payload) => call('respondCoAuthorInvite', payload),
  manageCoAuthorInvite: (payload) => call('manageCoAuthorInvite', payload),
  removeCoAuthor: (payload) => call('removeCoAuthor', payload),
  setCoAuthorPermissions: (payload) => call('setCoAuthorPermissions', payload),
  listNotifications: (payload) => call('listNotifications', payload),
  listPendingCoAuthorInvites: (payload) => call('listPendingCoAuthorInvites', payload),
  syncUserAuthFlags: (payload) => call('syncUserAuthFlags', payload),
  searchUsers: (searchTerm) => call('searchUsers', { searchTerm }),
};

export const getCallableErrorMessage = (error, fallback = 'Request failed.') => {
  const detailsObj = error?.details && typeof error.details === 'object' ? error.details : null;
  if (detailsObj?.errorCode) {
    return `Error code: ${detailsObj.errorCode}`;
  }
  const detailsMessage = error?.details && typeof error.details === 'string' ? error.details : '';
  const message = detailsObj?.message || error?.message || detailsMessage || fallback;
  return message.replace(/^functions\/(invalid-argument|internal|permission-denied|failed-precondition|resource-exhausted|unauthenticated):\s*/i, '').trim() || fallback;
};

export const getCallableErrorPayload = (error, fallback = 'Request failed.') => {
  const detailsObj = error?.details && typeof error.details === 'object' ? error.details : {};
  return {
    errorCode: detailsObj.errorCode || null,
    status: detailsObj.status || null,
    message: getCallableErrorMessage(error, fallback),
  };
};
