const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { z } = require('genkit');
const { ai } = require('./genkitClient');
const { generateEmbeddings } = require('./utils/embeddingsClient');
const { consumeApiCallQuota } = require('./utils/limits');
const { buildQueryBookContext, buildConversationTranscript, getBookPagesRetriever } = require('./flows/queryBookFlow');
const { AgentServices } = require('./agents/agentServices');
const { createChapterPlanTool } = require('./tools/chapterPlanTool');
const { resolveRoute } = require('./services/requestRouter');
const { streamRagAnswer } = require('./services/ragService');
const { streamChapterGeneration } = require('./services/chapterService');
const { createChapterPage } = require('./services/pageService');
const { setCorsHeaders, parseRequestBody } = require('./utils/http');
const { setSseHeaders, sendEvent, attachCloseHandler } = require('./utils/sse');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const REGION = 'us-central1';
const bookPagesRetriever = getBookPagesRetriever({ ai, z, db, generateEmbeddings });
const agentServices = new AgentServices({ ai, db });
const chapterPlanTool = createChapterPlanTool(ai);

const buildHistory = (items) => {
  const history = (items || [])
    .slice(0, -1)
    .map((message) => ({
      role: message.role === 'assistant' ? 'model': message.role,
      content: [{ text: message.content || '' }],
    }))
    .filter((message) => message.role && message.content?.[0]?.text);

  const firstUserIndex = history.findIndex((message) => message.role === 'user');
  if (firstUserIndex === -1) {
    return [];
  }
  return history.slice(firstUserIndex);
};

const answerPrompt = ai.prompt('airabook_answer');
const actionClassifierPrompt = ai.prompt('airabook_action_classifier');
const surprisePrompt = ai.prompt('airabook_surprise');

exports.airabookaiStream = onRequest({ region: REGION }, async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    res.status(401).send('Unauthorized');
    return;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (error) {
    console.error('Error while verifying Firebase ID token:', error);
    res.status(403).send('Unauthorized');
    return;
  }

  let payload;
  try {
    payload = parseRequestBody(req);
  } catch (error) {
    res.status(400).send(error.message);
    return;
  }

  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const isSurprise = Boolean(payload?.isSurprise);
  const action = typeof payload?.action === 'string' ? payload.action : '';
  const scope = typeof payload?.scope === 'string' ? payload.scope.trim() : '';
  const bookId = typeof payload?.bookId === 'string' ? payload.bookId.trim() : '';
  const chapterId = typeof payload?.chapterId === 'string' ? payload.chapterId.trim() : '';
  const hasChapterContext = Boolean(bookId && chapterId);
  const useRetriever = mode === 'book_chat' && hasChapterContext;

  if (!messages.length) {
    res.status(400).send('Messages are required.');
    return;
  }

  try {
    await consumeApiCallQuota(db, decodedToken.uid, 1);
  } catch (error) {
    res.status(error?.code === 'resource-exhausted' ? 429 : 500).send(error.message);
    return;
  }

  const resolvedRoute = !isSurprise ? resolveRoute({ action, hasChapterContext }) : null;
  if (resolvedRoute?.route === 'error') {
    res.status(400).send(resolvedRoute.error);
    return;
  }

  setSseHeaders(res);
  const isClosed = attachCloseHandler(req);


  try {
    if (isSurprise) {

      let responseText = '';
      const history = buildHistory(messages);
      const streamPayload = await surprisePrompt.stream({}, { messages: history });

      for await (const chunk of streamPayload.stream) {
        if (isClosed()) {
          break;
        }
        if (chunk?.text) {
          responseText += chunk.text;
          sendEvent(res, 'chunk', { text: chunk.text });
        }
      }

      if (!isClosed()) {
        await streamPayload.response;
        sendEvent(res, 'done', {
          text: responseText,
          sources: [],
          actionPrompt: '',
          actions: [],
          createdPageIds: [],
          pageError: '',
        });
        res.end();
      }
      return;
    }

    let donePayload = null;
    if (resolvedRoute?.route === 'chapter') {
      donePayload = await streamChapterGeneration({
        agentServices,
        chapterPlanTool,
        createChapterPage,
        buildConversationTranscript,
        messages,
        userId: decodedToken.uid,
        bookId,
        chapterId,
        db,
        isClosed,
        sendEvent,
        res,
      });
    } else {
      donePayload = await streamRagAnswer({
        ai,
        answerPrompt,
        actionClassifierPrompt,
        buildQueryBookContext,
        bookPagesRetriever,
        messages,
        userId: decodedToken.uid,
        hasChapterContext,
        useRetriever,
        isClosed,
        sendEvent,
        res,
      });
    }

    if (!isClosed() && donePayload) {
      sendEvent(res, 'done', donePayload);
      res.end();
    }
  } catch (error) {
    console.error('Streaming error:', error);
    if (!res.headersSent) {
      res.status(500).send('Streaming error.');
      return;
    }
    if (!isClosed()) {
      sendEvent(res, 'error', { message: error.message || 'Streaming error.' });
      res.end();
    }
  }
});
