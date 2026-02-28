const normalizeBaseUrl = (baseUrl) => {
  if (!baseUrl) return '';
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
};

const normalizePath = (path) => {
  if (!path) return '';
  return path.startsWith('/') ? path.slice(1) : path;
};

const backendBaseUrl = normalizeBaseUrl(import.meta.env.VITE_BACKEND_API_URL || 'http://localhost:8000');
const springBaseUrl = normalizeBaseUrl(import.meta.env.VITE_SPRING_API_URL || backendBaseUrl);

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
        import.meta.env.VITE_SPRING_BOOK_CREATION_PLAN_HITL_ENDPOINT || '',
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
