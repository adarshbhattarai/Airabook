import { queryOptions } from '@tanstack/react-query';
import {
  getCurrentEnterpriseUser, getEnterpriseMembers, getEnterpriseAccountInvitations,
  getMyEnterpriseRequests, getReceivedEnterpriseInvitations,
} from '@/services/enterpriseOnboardingService';

export const workspaceAccessKey = (uid) => ['workspace-access', uid];
export const administrationKey = (uid, accountId) => ['enterprise-administration', uid, String(accountId)];
export const workspaceAccessOptions = (uid) => queryOptions({
  queryKey: workspaceAccessKey(uid),
  queryFn: ({ signal }) => getCurrentEnterpriseUser({ signal }),
});

// Role is part of the key so demoted users never reuse privileged invitation data.
export const memberQueryOptions = (uid, account) => queryOptions({
  queryKey: [...administrationKey(uid, account?.id), account?.role, 'members'],
  queryFn: ({ signal }) => getEnterpriseMembers(account.id, { signal }),
});

export const invitationQueryOptions = (uid, account, status = 'PENDING') => queryOptions({
  queryKey: [...administrationKey(uid, account?.id), account?.role, 'invitations', status],
  queryFn: ({ signal }) => getEnterpriseAccountInvitations(account.id, status, { signal }),
});

export const prefetchAdministration = (client, uid, account) => {
  void client.prefetchQuery(memberQueryOptions(uid, account));
  if (['OWNER', 'ADMIN'].includes(account.role)) {
    void client.prefetchQuery(invitationQueryOptions(uid, account));
  }
};

// Shared with the Personal workspace onboarding notification.
export const myEnterpriseRequestsKey = (uid) => ['enterprise-onboarding-notification', uid];
export const receivedInvitationsKey = (uid) => ['enterprise-received-invitations', uid];
export const myEnterpriseRequestsOptions = (uid) => queryOptions({
  queryKey: myEnterpriseRequestsKey(uid),
  queryFn: ({ signal }) => getMyEnterpriseRequests({ signal }),
});
export const receivedInvitationsOptions = (uid) => queryOptions({
  queryKey: receivedInvitationsKey(uid),
  queryFn: ({ signal }) => getReceivedEnterpriseInvitations({ signal }),
});
