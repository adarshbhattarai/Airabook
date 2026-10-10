import { apiService } from '@/services/ApiService';
import { SERVICE_ENDPOINTS } from '@/config/serviceEndpoints';

const ENTERPRISE_PATHS = SERVICE_ENDPOINTS.spring.paths;

// Workspace reads may expose `status` or `accountStatus`. Normalize both shapes at
// the frontend boundary so every workspace screen reads one field.
const normalizeAccount = (account) => account ? {
  ...account,
  accountStatus: account.accountStatus || account.status,
} : account;

/** Submit an Enterprise onboarding request for System Administrator approval. */
export const submitEnterpriseOnboardingRequest = (formData) => {
  const {
    proposed_account_name: proposedAccountName,
    workspace_slug: workspaceSlug,
    website,
    country,
    contact_person_name: contactPersonName,
    contact_email: contactEmail,
    phone,
    business_description: businessDescription,
  } = formData;

  return apiService.post(ENTERPRISE_PATHS.enterpriseOnboardingRequests, {
    proposedAccountName: proposedAccountName.trim(),
    requestedSlug: workspaceSlug.trim().toLowerCase(),
    website: website.trim(),
    country: country.trim(),
    contactPersonName: contactPersonName.trim(),
    contactEmail: contactEmail.trim(),
    phone: phone?.trim() || null,
    businessDescription: businessDescription?.trim() || null,
  });
};

/** Load the current PostgreSQL user and their active Enterprise memberships. */
export const getCurrentEnterpriseUser = () => apiService.get(ENTERPRISE_PATHS.enterpriseCurrentUser)
  .then((result) => ({ ...result, accounts: (result.accounts || []).map(normalizeAccount) }));

/** Load members for an Enterprise account. */
export const getEnterpriseMembers = (accountId) => apiService.get(
  ENTERPRISE_PATHS.enterpriseAccountMembers.replace('{accountId}', encodeURIComponent(accountId))
);

const memberPath = (accountId, userId) => ENTERPRISE_PATHS.enterpriseAccountMember
  .replace('{accountId}', encodeURIComponent(accountId))
  .replace('{userId}', encodeURIComponent(userId));

export const updateEnterpriseMemberRole = (accountId, userId, role) => apiService.patch(
  `${memberPath(accountId, userId)}/role`, { role }
);

export const updateEnterpriseMemberStatus = (accountId, userId, status) => apiService.patch(
  `${memberPath(accountId, userId)}/status`, { status }
);

export const removeEnterpriseMember = (accountId, userId) => apiService.delete(memberPath(accountId, userId));

/** Return the signed-in user's onboarding requests, newest first. */
export const getMyEnterpriseRequests = () => apiService.get(
  `${ENTERPRISE_PATHS.enterpriseOnboardingMyRequests}?page=0&size=20`
).then((result) => result?.items || []);

/** Find registered Airabook users who can receive a workspace invitation. */
export const getEligibleEnterpriseUsers = (accountId, query) => apiService.get(
  `${ENTERPRISE_PATHS.enterpriseEligibleUsers.replace('{accountId}', encodeURIComponent(accountId))}?query=${encodeURIComponent(query)}`
);

/** Create an invitation. This does not create a membership until the recipient accepts. */
export const createEnterpriseInvitation = (accountId, { userId, role }) => apiService.post(
  ENTERPRISE_PATHS.enterpriseAccountInvitations.replace('{accountId}', encodeURIComponent(accountId)),
  { userId, role }
);

/** List invitations sent by a workspace owner or admin. */
export const getEnterpriseAccountInvitations = (accountId, status = 'PENDING') => apiService.get(
  `${ENTERPRISE_PATHS.enterpriseAccountInvitations.replace('{accountId}', encodeURIComponent(accountId))}?status=${encodeURIComponent(status)}`
);

/** List invitations awaiting the signed-in user's decision. */
export const getReceivedEnterpriseInvitations = () => apiService.get(ENTERPRISE_PATHS.enterpriseReceivedInvitations);

const invitationActionPath = (invitationId, action) => (
  `${ENTERPRISE_PATHS.enterpriseInvitation.replace('{invitationId}', encodeURIComponent(invitationId))}/${action}`
);

export const acceptEnterpriseInvitation = (invitationId) => apiService.post(invitationActionPath(invitationId, 'accept'), {});
export const declineEnterpriseInvitation = (invitationId) => apiService.post(invitationActionPath(invitationId, 'decline'), {});
export const revokeEnterpriseInvitation = (invitationId) => apiService.delete(
  ENTERPRISE_PATHS.enterpriseInvitation.replace('{invitationId}', encodeURIComponent(invitationId))
);

/** Load a page of enterprise onboarding requests for System Admin review. */
export const getAdminEnterpriseRequests = ({ status, page = 0, size = 20, sort = 'submittedAt,desc' } = {}) => {
  const query = new URLSearchParams({ page: String(page), size: String(size), sort });
  if (status) query.set('status', status);
  return apiService.get(`${ENTERPRISE_PATHS.enterpriseOnboardingAdminRequests}?${query.toString()}`);
};

/** Load the full review record, including organization contact and decision fields. */
export const getAdminEnterpriseRequest = (requestId) => apiService.get(
  ENTERPRISE_PATHS.enterpriseOnboardingAdminRequest
    .replace('{requestId}', encodeURIComponent(requestId))
);

/** Approve a reviewable request and create its Enterprise account. */
export const approveAdminEnterpriseRequest = (requestId, notes = '') => apiService.post(
  `${ENTERPRISE_PATHS.enterpriseOnboardingAdminRequest.replace('{requestId}', encodeURIComponent(requestId))}/approve`,
  { notes: notes.trim() || null }
);

/** Decline a reviewable request with a reason the requester can see. */
export const declineAdminEnterpriseRequest = (requestId, reason) => apiService.post(
  `${ENTERPRISE_PATHS.enterpriseOnboardingAdminRequest.replace('{requestId}', encodeURIComponent(requestId))}/decline`,
  { reason: reason.trim() }
);

const verificationPath = (requestId) => `${ENTERPRISE_PATHS.enterpriseOnboardingAdminRequest
  .replace('{requestId}', encodeURIComponent(requestId))}/verifications`;
export const getAdminEnterpriseVerificationHistory = (requestId) => apiService.get(verificationPath(requestId));
export const recordAdminEnterpriseVerification = (requestId, outcome, reasonCode) => apiService.post(
  verificationPath(requestId), { outcome, reasonCode }
);
