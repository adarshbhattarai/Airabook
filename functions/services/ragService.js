const buildHistory = (messages) => {
  const history = (messages || [])
    .slice(0, -1)
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : message.role,
      content: [{ text: message.content || '' }],
    }))
    .filter((message) => message.role && message.content?.[0]?.text);

  const firstUserIndex = history.findIndex((message) => message.role === 'user');
  if (firstUserIndex === -1) {
    return [];
  }
  return history.slice(firstUserIndex);
};

const getLastUserMessage = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Messages are required.');
  }

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'user') {
      return message;
    }
  }

  throw new Error('At least one user message is required.');
};

const sanitizeActions = (actions) => {
  if (!Array.isArray(actions)) return [];
  return actions
    .map((action) => ({
      id: String(action?.id || '').trim(),
      label: String(action?.label || '').trim(),
    }))
    .filter((action) => action.id && action.label);
};

const streamRagAnswer = async ({
  ai,
  answerPrompt,
  actionClassifierPrompt,
  buildQueryBookContext,
  bookPagesRetriever,
  messages,
  userId,
  hasChapterContext,
  useRetriever,
  isClosed,
  sendEvent,
  res,
}) => {
  const lastUserMessage = getLastUserMessage(messages);
  let history = buildHistory(messages);
  let sources = [];
  let query = lastUserMessage.content || '';
  let contextText = '';

  if (useRetriever) {
    const basePayload = await buildQueryBookContext({
      ai,
      bookPagesRetriever,
      messages,
      userId,
    });
    history = basePayload.history;
    sources = basePayload.sources;
    query = basePayload.query;
    contextText = basePayload.contextText;
  }

  let responseText = '';
  const streamPayload = await answerPrompt.stream(
    { query, contextText },
    { messages: history }
  );

  for await (const chunk of streamPayload.stream) {
    if (isClosed()) {
      break;
    }

    if (chunk?.text) {
      responseText += chunk.text;
      sendEvent(res, 'chunk', { text: chunk.text });
    }
  }

  if (isClosed()) {
    return null;
  }

  await streamPayload.response;

  let actionPrompt = '';
  let actions = [];

  try {
    const answerForClassifier = responseText.slice(0, 1600);
    const classifierResponse = await actionClassifierPrompt({
      query: lastUserMessage.content || '',
      answer: answerForClassifier,
      hasChapterContext,
    });
    const output = classifierResponse.output || {};
    if (output.showAction && hasChapterContext) {
      actionPrompt = output.actionPrompt || 'With this context, would you like to generate this chapter?';
      actions = sanitizeActions(output.actions);
      if (!actions.length) {
        actions = [
          { id: 'generate_chapter', label: 'Allow' },
          { id: 'deny_generate_chapter', label: 'Deny' },
        ];
      }
    }
  } catch (error) {
    console.error('Action classifier failed:', error);
  }

  return {
    text: responseText,
    sources,
    actionPrompt,
    actions,
    createdPageIds: [],
    pageError: '',
  };
};

module.exports = {
  streamRagAnswer,
};
