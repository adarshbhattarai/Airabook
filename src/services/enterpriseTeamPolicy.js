// UI capabilities mirror the backend policy; API authorization remains authoritative.
export const canInviteEnterpriseUsers = (role) => ['OWNER', 'ADMIN'].includes(role);
export const enterpriseInvitableRoles = (role) => (
  role === 'OWNER' ? ['MEMBER', 'ADMIN'] : role === 'ADMIN' ? ['MEMBER'] : []
);
export const canManageEnterpriseMember = (actorRole, target) => (
  ['ACTIVE', 'SUSPENDED'].includes(target?.status)
  && (actorRole === 'OWNER' && ['ADMIN', 'MEMBER'].includes(target.role)
    || actorRole === 'ADMIN' && target.role === 'MEMBER')
);
export const canChangeEnterpriseMemberRole = (actorRole, target) => (
  actorRole === 'OWNER' && canManageEnterpriseMember(actorRole, target)
);
export const canRevokeEnterpriseInvitation = (actorRole, invitation) => (
  invitation?.status === 'PENDING' && enterpriseInvitableRoles(actorRole).includes(invitation.role)
);
