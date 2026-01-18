let cachedBookPagesRetriever = null;

const getBookPagesRetriever = ({ ai, z, db, generateEmbeddings }) => {
  if (cachedBookPagesRetriever) {
    return cachedBookPagesRetriever;
  }

  cachedBookPagesRetriever = ai.defineRetriever(
    {
      name: 'bookPagesRetriever',
      configSchema: z.object({
        userId: z.string(),
        k: z.number().default(3),
      }),
    },
    async (input, options) => {
      const { userId, k } = options;

      const queryEmbedding = await generateEmbeddings(input, {
        taskType: 'RETRIEVAL_QUERY',
      });

      console.log('queryEmbedding length:', queryEmbedding.length);
      // Firestore Vector Search
      // CRITICAL: Filter by createdBy to ensure user isolation
      const coll = db.collectionGroup('pages');

      try {
        const snapshot = await coll
          .where('createdBy', '==', userId)
          .findNearest('embeddings', queryEmbedding, {
            limit: k,
            distanceMeasure: 'COSINE',
          })
          .get();

        console.log(`Found ${snapshot.docs.length} documents`);
        return {
          documents: snapshot.docs.map(doc => {
            const data = doc.data();
            return {
              content: [{ text: data.plainText || data.note || '' }],
              metadata: {
                id: doc.id,
                bookId: doc.ref.parent.parent.parent.parent.id,
                chapterId: doc.ref.parent.parent.id,
                ...data,
              },
            };
          })
        };
      } catch (error) {
        console.error('Vector search failed:', error);
        // Return empty documents on error to allow flow to continue with general knowledge
        return { documents: [] };
      }
    }
  );

  return cachedBookPagesRetriever;
};

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

const getLastUserQuery = (messages) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Messages are required.');
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    throw new Error('Last message must be from user.');
  }

  return lastMessage.content || '';
};

const buildConversationTranscript = (messages) =>
  (messages || [])
    .map((message) => {
      const role = message?.role === 'assistant' || message?.role === 'model'
        ? 'assistant'
        : message?.role || 'user';
      const content = message?.content || '';
      return `${role}: ${content}`;
    })
    .join('\n');

const getRagDocs = async ({ ai, bookPagesRetriever, query, userId }) => {
  const initialResult = await ai.retrieve({
    retriever: bookPagesRetriever,
    query: query,
    options: { userId: userId, k: 10 }, // Retrieve more docs for reranking
  });

  const initialDocs = Array.isArray(initialResult)
    ? initialResult
    : initialResult?.documents || [];

  console.log(`Retrieved ${initialDocs.length} candidate documents.`);

  // 2. Rerank documents
  const scoredDocs = [];
  for (const doc of initialDocs) {
    const content = doc?.content?.[0]?.text || '';

    // Ask LLM to score the relevance
    const scoringPrompt = `
You are a relevance scorer. 
Query: "${query}"
Document: "${content}"

Rate the relevance of the document to the query on a scale of 0 to 10. 
Return ONLY the number.
`;

    const scoreResponse = await ai.generate({
      prompt: scoringPrompt,
    });

    const scoreText = scoreResponse.text.trim();
    const score = parseFloat(scoreText);

    console.log(`Doc ID: ${doc?.metadata?.id}, Score: ${score}`);

    if (!isNaN(score)) {
      scoredDocs.push({ doc, score });
    }
  }

  // Sort by score descending
  scoredDocs.sort((a, b) => b.score - a.score);

  // 3. Select the best document (or top N)
  // For now, we'll take the single best document if it has a reasonable score (> 0)
  // If no docs or all 0, we might fall back to general knowledge (empty context)
  const bestDoc = scoredDocs.length > 0 && scoredDocs[0].score > 3 ? scoredDocs[0].doc : null;
  const finalDocs = bestDoc ? [bestDoc] : [];

  console.log('Selected best document:', bestDoc ? bestDoc.metadata.id : 'None');

  return finalDocs;
};

const buildSources = (docs) =>
  docs.map((doc) => ({
    id: doc?.metadata?.id,
    shortNote: doc?.metadata?.plainText?.substring(0, 50) || 'Page',
  }));

const buildQueryBookContext = async ({ ai, bookPagesRetriever, messages, userId }) => {
  const query = getLastUserQuery(messages);
  const history = buildHistory(messages);

  const finalDocs = await getRagDocs({ ai, bookPagesRetriever, query, userId });
  const contextText = finalDocs.map((doc) => doc?.content?.[0]?.text || '').join('\n\n');

  return {
    history,
    sources: buildSources(finalDocs),
    contextText,
    query,
  };
};

const defineQueryBookFlow = ({ ai, z, db, generateEmbeddings }) => {
  const bookPagesRetriever = getBookPagesRetriever({ ai, z, db, generateEmbeddings });
  const answerPrompt = ai.prompt('airabook_answer');
  const surprisePrompt = ai.prompt('airabook_surprise');

  const queryBookFlowRaw = ai.defineFlow(
    {
      name: 'queryBookFlow',
      inputSchema: z.object({
        messages: z.array(z.object({
          role: z.enum(['user', 'model', 'system', 'assistant']),
          content: z.string(),
        })),
        isSurprise: z.boolean().optional().default(false),
      }),
    },
    async (input, { context }) => {
      if (!context || !context.auth) {
        throw new Error('User must be authenticated.');
      }
      const userId = context.auth.uid;
      const { messages, isSurprise } = input;

      if (isSurprise) {
        console.log('Surprise mode activated - generating random book idea');
        const history = buildHistory(messages);
        const llmResponse = await surprisePrompt({}, { messages: history });
        return {
          answer: llmResponse.text,
          sources: [],
        };
      }

      const { history, contextText, query, sources } = await buildQueryBookContext({
        ai,
        bookPagesRetriever,
        messages,
        userId,
      });

      const llmResponse = await answerPrompt(
        { query, contextText },
        { messages: history }
      );

      return {
        answer: llmResponse.text,
        sources,
      };
    }
  );

  return queryBookFlowRaw;
};

module.exports = {
  defineQueryBookFlow,
  getBookPagesRetriever,
  buildQueryBookContext,
  buildConversationTranscript,
};
