const HITL_EVENTS = new Set(['human_in_loop', 'interrupt', 'hitl_request', 'approval_required']);

const toNormalizedEventName = (value) => {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/([A-Z])/g, '_$1')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
    .replace(/^_+/, '');
};

const toRecord = (value) => (value && typeof value === 'object' ? value : {});

const sanitizeCardType = (value) => {
  if (!value || typeof value !== 'string') return '';
  return value.trim().toUpperCase();
};

const normalizeResourceRef = (resourceRef) => {
  if (!resourceRef) return null;
  if (typeof resourceRef === 'string') return { id: resourceRef };
  if (typeof resourceRef === 'object') {
    return {
      type: resourceRef.type || resourceRef.resourceType || '',
      id: resourceRef.id || resourceRef.resourceId || '',
      bookId: resourceRef.bookId || '',
      chapterId: resourceRef.chapterId || '',
      pageId: resourceRef.pageId || '',
    };
  }
  return null;
};

const normalizeUiAction = (action = {}, index = 0) => {
  const entry = toRecord(action);
  const id = String(entry.id || entry.actionId || `action_${index + 1}`);
  const label = String(entry.label || entry.title || entry.name || id.replace(/_/g, ' '));
  const method = String(entry.method || entry.httpMethod || 'POST').toUpperCase();
  return {
    id,
    label,
    kind: entry.kind || '',
    method,
    endpoint: entry.endpoint || entry.path || entry.url || '',
    link: entry.link || entry.href || '',
    bodyTemplate: entry.bodyTemplate || entry.payloadTemplate || null,
    body: entry.body || null,
    metadata: toRecord(entry.metadata),
  };
};

const normalizeUiActions = (actions = []) => {
  if (!Array.isArray(actions)) return [];
  return actions.map((action, index) => normalizeUiAction(action, index));
};

const tryParseJson = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

const tryParseJsonFromFencedBlock = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (!match?.[1]) return null;
  return tryParseJson(match[1]);
};

const buildCardId = ({ cardType, payload = {}, fallback = '' }) => {
  const candidate = payload.cardId
    || payload.id
    || payload.interactionId
    || payload.requestId
    || payload.limitType
    || payload.blockedOperation
    || payload.messageId
    || fallback;
  return `${cardType || 'CARD'}:${String(candidate || 'default')}`;
};

const normalizeUiEnvelopeCard = (uiEnvelope = {}, eventName = '', index = 0) => {
  const ui = toRecord(uiEnvelope);
  const payload = toRecord(ui.payload);
  const cardType = sanitizeCardType(ui.cardType || ui.type);
  if (!cardType) return null;

  return {
    id: String(ui.id || buildCardId({ cardType, payload, fallback: `${eventName}_${index}` })),
    cardType,
    payload: {
      ...payload,
      resourceRef: normalizeResourceRef(payload.resourceRef),
    },
    actions: normalizeUiActions(ui.actions || payload.actions || []),
    eventName,
  };
};

const normalizeHitlOptions = (options = []) => {
  if (!Array.isArray(options)) return [];
  return options
    .map((option, index) => {
      if (typeof option === 'string') {
        return {
          id: String(index + 1),
          label: option,
          value: option,
          recommended: index === 0,
        };
      }
      if (!option || typeof option !== 'object') return null;
      const label = option.label || option.title || option.name || option.value || `Option ${index + 1}`;
      return {
        id: String(option.id || index + 1),
        label: String(label),
        value: option.value ?? label,
        recommended: Boolean(option.recommended) || index === 0,
      };
    })
    .filter(Boolean);
};

const normalizeHitlCard = (eventName, payload = {}) => {
  const data = toRecord(payload);
  const options = normalizeHitlOptions(data.options || data.choices || data.items || []);
  if (options.length === 0) return null;

  const interactionId = String(data.interactionId || data.requestId || data.id || '').trim();
  const cardPayload = {
    interactionId,
    runId: data.runId || data.sessionId || '',
    question: data.question || data.prompt || data.message || 'Choose how to continue',
    subtitle: data.subtitle || '',
    recommendedIndex: Number.isInteger(data.recommendedIndex) ? data.recommendedIndex : 0,
    timeoutSec: Number.isFinite(Number(data.timeoutSec)) ? Math.max(1, Number(data.timeoutSec)) : null,
    responsePath: data.responsePath || data.responseEndpoint || data.callbackPath || '',
    context: toRecord(data.context),
    options,
    resourceRef: normalizeResourceRef(data.resourceRef),
  };

  return {
    id: interactionId ? `HITL:${interactionId}` : buildCardId({ cardType: 'HITL_REQUEST', payload: cardPayload, fallback: eventName }),
    cardType: 'HITL_REQUEST',
    payload: cardPayload,
    actions: [],
    eventName,
  };
};

const collectWarnings = (...values) => {
  const warnings = [];
  values.forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (typeof entry !== 'string') return;
        const trimmed = entry.trim();
        if (trimmed) warnings.push(trimmed);
      });
      return;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) warnings.push(trimmed);
    }
  });
  return Array.from(new Set(warnings));
};

const pickFirstText = (...values) => {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return '';
};

const normalizePlannerApprovalCard = (eventName, payload = {}, planner = {}) => {
  const plannerRecord = toRecord(planner);
  const plannerPayload = toRecord(plannerRecord.payload);
  const plannerContext = toRecord(plannerPayload.context || plannerRecord.context || payload?.context);
  const warnings = collectWarnings(payload?.warnings, plannerRecord.warnings, plannerPayload.warnings);
  const summary = pickFirstText(
    plannerPayload.summary,
    plannerRecord.summary,
    payload?.summary,
    payload?.content,
    payload?.message
  );
  const mergedPayload = {
    ...plannerPayload,
    context: plannerContext,
    warnings,
    summary,
    message: pickFirstText(plannerPayload.message, plannerRecord.message, summary),
    operation: plannerPayload.operation || plannerRecord.operation || payload?.operation || payload?.action || '',
    reason: plannerPayload.reason || plannerRecord.reason || '',
    bookId: plannerPayload.bookId || plannerContext.bookId || '',
    bookName: plannerPayload.bookName || plannerContext.bookName || '',
    bookDisplayName: plannerPayload.bookDisplayName || plannerContext.bookDisplayName || '',
    chapterId: plannerPayload.chapterId || plannerContext.chapterId || '',
    chapterName: plannerPayload.chapterName || plannerContext.chapterName || '',
    pageId: plannerPayload.pageId || plannerContext.pageId || '',
    pageName: plannerPayload.pageName || plannerContext.pageName || '',
    resourceRef: normalizeResourceRef(
      plannerPayload.resourceRef || plannerRecord.resourceRef || plannerContext.resourceRef
    ),
  };

  return {
    id: buildCardId({
      cardType: 'APPROVAL_REQUIRED',
      payload: mergedPayload,
      fallback: plannerPayload.interactionId || plannerPayload.id || eventName,
    }),
    cardType: 'APPROVAL_REQUIRED',
    payload: mergedPayload,
    actions: normalizeUiActions(plannerRecord.actions || plannerPayload.actions || payload?.actions || []),
    eventName,
  };
};

export const extractConversationId = (payload) => {
  if (!payload || typeof payload !== 'object') return '';
  const candidate = payload.conversationId
    || payload.conversationID
    || payload.conversation_id
    || payload.threadId
    || payload.threadID
    || payload.thread_id;
  return typeof candidate === 'string' ? candidate.trim() : '';
};

export const extractTextFromPayload = (payload) => {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload?.text === 'string') return payload.text;
  if (typeof payload?.delta === 'string') return payload.delta;
  if (typeof payload?.content === 'string') return payload.content;
  if (typeof payload?.message === 'string') return payload.message;
  if (typeof payload?.summary === 'string') return payload.summary;
  if (typeof payload?.outputText === 'string') return payload.outputText;
  if (Array.isArray(payload?.content)) {
    return payload.content
      .map((entry) => (typeof entry?.text === 'string' ? entry.text : ''))
      .join('');
  }
  if (payload?.response && typeof payload.response === 'object') {
    return extractTextFromPayload(payload.response);
  }
  return '';
};

const extractOperationCardFromPayload = (payload = {}, eventName = '') => {
  const directOperation = toRecord(payload);
  const text = extractTextFromPayload(payload);
  const parsedFromText = tryParseJson(text) || tryParseJsonFromFencedBlock(text);
  const operationPayload = toRecord(
    (typeof directOperation.operation === 'string' && directOperation.operation) ? directOperation : parsedFromText
  );

  if (String(operationPayload.operation || '').toUpperCase() !== 'CREATE_BOOK') {
    return null;
  }

  const createdChapterIds = Array.isArray(operationPayload.createdChapterIds)
    ? operationPayload.createdChapterIds
    : [];
  const warnings = Array.isArray(operationPayload.warnings) ? operationPayload.warnings : [];
  const payloadOut = {
    operation: 'CREATE_BOOK',
    title: operationPayload.title || 'Untitled Book',
    bookId: operationPayload.bookId || '',
    createdChapterIds,
    createdChapterCount: Number.isFinite(Number(operationPayload.createdChapterCount))
      ? Number(operationPayload.createdChapterCount)
      : createdChapterIds.length,
    warnings,
    resourceRef: normalizeResourceRef(
      operationPayload.resourceRef || {
        type: 'book',
        id: operationPayload.bookId || '',
        bookId: operationPayload.bookId || '',
      }
    ),
  };

  return {
    id: buildCardId({ cardType: 'BOOK_CREATE_RESULT', payload: payloadOut, fallback: eventName || 'legacy_create_book' }),
    cardType: 'BOOK_CREATE_RESULT',
    payload: payloadOut,
    actions: [],
    eventName,
  };
};

export const extractUiCards = (eventName, payload = {}) => {
  const cards = [];
  const normalizedIncomingEvent = toNormalizedEventName(eventName || '');
  const normalizedPayloadEvent = toNormalizedEventName(payload?.event || payload?.type || '');
  const normalizedEventName = (
    normalizedIncomingEvent && normalizedIncomingEvent !== 'message'
      ? normalizedIncomingEvent
      : (normalizedPayloadEvent || normalizedIncomingEvent)
  );

  const payloadCandidates = [payload, payload?.response, payload?.data]
    .filter((entry) => entry && typeof entry === 'object');
  const plannerCandidates = payloadCandidates
    .map((candidate) => toRecord(candidate?.planner))
    .filter((entry) => Object.keys(entry).length > 0);
  const plannerData = plannerCandidates[0] || {};
  const normalizedPlannerEvent = toNormalizedEventName(plannerData?.type || plannerData?.event || '');

  for (const candidate of payloadCandidates) {
    const ui = candidate?.ui;
    if (ui && typeof ui === 'object') {
      if (Array.isArray(ui.cards)) {
        ui.cards.forEach((entry, index) => {
          const card = normalizeUiEnvelopeCard(entry, normalizedEventName, index);
          if (card) cards.push(card);
        });
      } else {
        const card = normalizeUiEnvelopeCard(ui, normalizedEventName, 0);
        if (card) cards.push(card);
      }
    } else if (candidate?.cardType) {
      const card = normalizeUiEnvelopeCard({
        cardType: candidate.cardType,
        payload: candidate.payload || candidate,
        actions: candidate.actions || [],
      }, normalizedEventName, 0);
      if (card) cards.push(card);
    }
  }

  const hasCardType = (cardType) => cards.some((card) => sanitizeCardType(card?.cardType) === cardType);
  const shouldShowHitl = HITL_EVENTS.has(normalizedEventName) || HITL_EVENTS.has(normalizedPlannerEvent);
  if (shouldShowHitl) {
    const plannerPayload = toRecord(plannerData?.payload);
    const hitlPayload = {
      ...plannerData,
      ...plannerPayload,
      context: toRecord(plannerPayload.context || plannerData?.context || payload?.context),
      message: pickFirstText(
        plannerPayload.message,
        plannerData?.summary,
        payload?.summary,
        payload?.content,
        payload?.message,
        'Approval required to continue.'
      ),
      responsePath: plannerPayload.responsePath
        || plannerPayload.responseEndpoint
        || plannerData?.responsePath
        || plannerData?.responseEndpoint
        || '',
    };
    const hitlCard = normalizeHitlCard(normalizedPlannerEvent || normalizedEventName, hitlPayload);
    if (hitlCard && !hasCardType('HITL_REQUEST')) {
      cards.push(hitlCard);
    }
    if ((!hitlCard || !Array.isArray(hitlCard?.payload?.options) || hitlCard.payload.options.length === 0) && !hasCardType('APPROVAL_REQUIRED')) {
      cards.push(normalizePlannerApprovalCard(normalizedPlannerEvent || normalizedEventName, payload, plannerData));
    }
  } else if (normalizedPlannerEvent === 'approval_required' && !hasCardType('APPROVAL_REQUIRED')) {
    cards.push(normalizePlannerApprovalCard(normalizedPlannerEvent || normalizedEventName, payload, plannerData));
  }

  const plannerWarnings = collectWarnings(payload?.warnings, plannerData?.warnings, plannerData?.payload?.warnings);
  if (plannerWarnings.length > 0 && !hasCardType('PLANNER_SUMMARY')) {
    cards.push({
      id: `PLANNER_SUMMARY:${normalizedPlannerEvent || normalizedEventName || 'planner'}`,
      cardType: 'PLANNER_SUMMARY',
      payload: {
        summary: pickFirstText(
          plannerData?.summary,
          plannerData?.payload?.summary,
          payload?.summary,
          extractTextFromPayload(payload)
        ),
        warnings: plannerWarnings,
        plannerType: normalizedPlannerEvent || normalizedEventName || 'planner',
      },
      actions: [],
      eventName: normalizedPlannerEvent || normalizedEventName || 'planner_event',
    });
  }

  if (cards.length === 0) {
    const operationCard = extractOperationCardFromPayload(payload, normalizedEventName);
    if (operationCard) cards.push(operationCard);
  }

  return cards;
};

export const mergeUniqueCards = (existing = [], incoming = []) => {
  const merged = Array.isArray(existing) ? [...existing] : [];
  for (const card of Array.isArray(incoming) ? incoming : []) {
    if (!card?.id) {
      merged.push(card);
      continue;
    }
    const existingIndex = merged.findIndex((entry) => entry?.id === card.id);
    if (existingIndex === -1) {
      merged.push(card);
      continue;
    }
    merged[existingIndex] = {
      ...merged[existingIndex],
      ...card,
      payload: { ...(merged[existingIndex]?.payload || {}), ...(card.payload || {}) },
      actions: card.actions || merged[existingIndex]?.actions || [],
    };
  }
  return merged;
};

export const buildUiActionStateKey = (cardId, actionId) => `${String(cardId || 'card')}:${String(actionId || 'action')}`;

export const materializeTemplate = (template, variables = {}) => {
  const resolvePathValue = (token) => {
    const path = token.split('.');
    let current = variables;
    for (const part of path) {
      if (!current || typeof current !== 'object') return '';
      current = current[part];
    }
    return current == null ? '' : current;
  };

  const resolveTemplateString = (value) => value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, token) => {
    const current = resolvePathValue(token);
    if (current == null) return '';
    if (typeof current === 'object') return JSON.stringify(current);
    return String(current);
  });

  if (typeof template === 'string') {
    const singleTokenMatch = template.match(/^\{\{\s*([\w.]+)\s*\}\}$/);
    if (singleTokenMatch) {
      return resolvePathValue(singleTokenMatch[1]);
    }
    return resolveTemplateString(template);
  }
  if (Array.isArray(template)) {
    return template.map((entry) => materializeTemplate(entry, variables));
  }
  if (template && typeof template === 'object') {
    return Object.fromEntries(
      Object.entries(template).map(([key, value]) => [key, materializeTemplate(value, variables)])
    );
  }
  return template;
};

export const toNormalizedEventNameForUi = toNormalizedEventName;
