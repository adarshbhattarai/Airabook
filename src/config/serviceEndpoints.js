import { getBackendApiUrl, getSpringApiUrl } from '@/config/runtimeConfig';

const normalizeBaseUrl = (baseUrl) => {
  if (!baseUrl) return '';
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
};

const normalizePath = (path) => {
  if (!path) return '';
  return path.startsWith('/') ? path.slice(1) : path;
};

const backendBaseUrl = normalizeBaseUrl(getBackendApiUrl());
const springBaseUrl = normalizeBaseUrl(getSpringApiUrl());

export const SERVICE_ENDPOINTS = {
  spring: {
    baseUrl: springBaseUrl,
    paths: {
      // Can be overridden via VITE_SPRING_BOOK_CREATION_PLAN_ENDPOINT
      bookCreationPlanApply: import.meta.env.VITE_SPRING_BOOK_CREATION_PLAN_ENDPOINT || 'api/v1/chat/planner-agent',
      // Planner streaming endpoint (Flux/SSE)
      bookCreationPlanStream:
        import.meta.env.VITE_SPRING_BOOK_CREATION_PLAN_STREAM_ENDPOINT || '',
      // Optional dedicated endpoint for human-in-the-loop responses
      bookCreationPlanHitlResponse:
        import.meta.env.VITE_SPRING_BOOK_CREATION_PLAN_HITL_ENDPOINT || 'api/v1/chat/planner-agent/stream/decision',
      // HITL decision endpoint for chat/planner card acknowledgements
      chatPlannerHitlDecision:
        import.meta.env.VITE_SPRING_CHAT_HITL_DECISION_ENDPOINT || 'api/v1/chat/planner-agent/stream/decision',
      // Conversation history endpoint for dashboard history picker
      conversationHistory:
        import.meta.env.VITE_SPRING_CONVERSATION_HISTORY_ENDPOINT || 'api/v1/conversation-history',
      // Conversation detail endpoint used when loading an existing thread from history
      conversationById:
        import.meta.env.VITE_SPRING_CONVERSATION_BY_ID_ENDPOINT || 'api/v1/conversations/{conversationId}',
      videoPageClipsCreate:
        import.meta.env.VITE_SPRING_VIDEO_PAGE_CLIPS_CREATE_ENDPOINT || 'api/v1/videos/page-clips',
      videoPageClipsRevise:
        import.meta.env.VITE_SPRING_VIDEO_PAGE_CLIPS_REVISE_ENDPOINT || 'api/v1/videos/page-clips/{jobId}/revise',
      videoPageClipsRender:
        import.meta.env.VITE_SPRING_VIDEO_PAGE_CLIPS_RENDER_ENDPOINT || 'api/v1/videos/page-clips/{jobId}/render',
      videoPageClipsCode:
        import.meta.env.VITE_SPRING_VIDEO_PAGE_CLIPS_CODE_ENDPOINT || 'api/v1/videos/page-clips/{jobId}/code',
      videoPageClipsById:
        import.meta.env.VITE_SPRING_VIDEO_PAGE_CLIPS_BY_ID_ENDPOINT || 'api/v1/videos/page-clips/{jobId}',
      videoPageClipsStream:
        import.meta.env.VITE_SPRING_VIDEO_PAGE_CLIPS_STREAM_ENDPOINT || 'api/v1/videos/page-clips/{jobId}/stream',
      videoPageClipsByBook:
        import.meta.env.VITE_SPRING_VIDEO_PAGE_CLIPS_BY_BOOK_ENDPOINT || 'api/v1/videos/books/{bookId}',
      enterpriseSyncUser:
        import.meta.env.VITE_SPRING_ENTERPRISE_SYNC_USER_ENDPOINT || 'api/v1/auth/sync',
      enterpriseCurrentUser:
        import.meta.env.VITE_SPRING_ENTERPRISE_CURRENT_USER_ENDPOINT || 'api/v1/me',
      enterpriseAccounts:
        import.meta.env.VITE_SPRING_ENTERPRISE_ACCOUNTS_ENDPOINT || 'api/v1/enterprise/accounts',
      enterpriseLogin:
        import.meta.env.VITE_SPRING_ENTERPRISE_LOGIN_ENDPOINT || 'api/v1/enterprise/auth/login',
      enterpriseAccountMembers:
        import.meta.env.VITE_SPRING_ENTERPRISE_ACCOUNT_MEMBERS_ENDPOINT || 'api/v1/enterprise/accounts/{accountId}/members',
      enterpriseRequestsMine:
        import.meta.env.VITE_SPRING_ENTERPRISE_REQUESTS_MINE_ENDPOINT || 'api/v1/enterprise/requests/mine',
      enterpriseEligibleUsers:
        import.meta.env.VITE_SPRING_ENTERPRISE_ELIGIBLE_USERS_ENDPOINT || 'api/v1/enterprise/accounts/{accountId}/eligibleUsers',
      enterpriseAccountMember:
        import.meta.env.VITE_SPRING_ENTERPRISE_ACCOUNT_MEMBER_ENDPOINT || 'api/v1/enterprise/accounts/{accountId}/members/{userId}',
      enterpriseAccountInvitations:
        import.meta.env.VITE_SPRING_ENTERPRISE_ACCOUNT_INVITATIONS_ENDPOINT || 'api/v1/enterprise/accounts/{accountId}/invitations',
      enterpriseReceivedInvitations:
        import.meta.env.VITE_SPRING_ENTERPRISE_RECEIVED_INVITATIONS_ENDPOINT || 'api/v1/enterprise/invitations',
      enterpriseInvitation:
        import.meta.env.VITE_SPRING_ENTERPRISE_INVITATION_ENDPOINT || 'api/v1/enterprise/invitations/{invitationId}',
      enterpriseReviewQueue:
        import.meta.env.VITE_SPRING_ENTERPRISE_REVIEW_QUEUE_ENDPOINT || 'api/v1/admin/enterprise/accounts',
      enterpriseReviewAction:
        import.meta.env.VITE_SPRING_ENTERPRISE_REVIEW_ACTION_ENDPOINT || 'api/v1/admin/enterprise/accounts/{accountId}/{action}',
      enterpriseOnboardingRequests:
        import.meta.env.VITE_SPRING_ENTERPRISE_ONBOARDING_REQUESTS_ENDPOINT || 'api/v1/enterpriseOnboardingRequest',
      enterpriseOnboardingMyRequests:
        import.meta.env.VITE_SPRING_ENTERPRISE_ONBOARDING_MY_REQUESTS_ENDPOINT || 'api/v1/enterpriseOnboardingRequest/mine',
      enterpriseOnboardingAdminRequests:
        import.meta.env.VITE_SPRING_ENTERPRISE_ONBOARDING_ADMIN_REQUESTS_ENDPOINT || 'api/v1/admin/enterpriseOnboardingRequest',
      enterpriseOnboardingAdminRequest:
        import.meta.env.VITE_SPRING_ENTERPRISE_ONBOARDING_ADMIN_REQUEST_ENDPOINT || 'api/v1/admin/enterpriseOnboardingRequest/{requestId}',
      enterpriseOperations:
        import.meta.env.VITE_SPRING_ENTERPRISE_OPERATIONS_ENDPOINT || 'api/v1/admin/enterpriseOperations',
    },
  },
};

export const buildServiceUrl = (baseUrl, endpointPath) => {
  const base = normalizeBaseUrl(baseUrl);
  const path = normalizePath(endpointPath);
  if (!base) return `/${path}`;
  if (!path) return base;
  return `${base}/${path}`;
};
