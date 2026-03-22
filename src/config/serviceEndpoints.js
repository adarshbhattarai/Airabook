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
      videoPageClipsById:
        import.meta.env.VITE_SPRING_VIDEO_PAGE_CLIPS_BY_ID_ENDPOINT || 'api/v1/videos/page-clips/{jobId}',
      videoPageClipsStream:
        import.meta.env.VITE_SPRING_VIDEO_PAGE_CLIPS_STREAM_ENDPOINT || 'api/v1/videos/page-clips/{jobId}/stream',
      videoPageClipsByBook:
        import.meta.env.VITE_SPRING_VIDEO_PAGE_CLIPS_BY_BOOK_ENDPOINT || 'api/v1/videos/books/{bookId}',
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
