import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import GenerateChapterContent from '@/components/GenerateChapterContent';
import { Sparkles, Lightbulb, MessageSquare, X, ArrowUp } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import WritingContextPicker from '@/components/chat/WritingContextPicker';
import { useWritingAssistantContext } from '@/hooks/useWritingAssistantContext';
import { streamAirabookAI } from '@/lib/aiStream';
import MessageContent from '@/components/chat/MessageContent';
import {
  extractConversationId,
  extractUiCards,
  mergeUniqueCards,
  buildUiActionStateKey,
} from '@/lib/chatUiEvents';
import { executeChatUiAction } from '@/services/chatUiActionService';
import StreamUiCards from '@/components/chat/StreamUiCards';

const appendStreamingText = (currentText, nextText) => `${currentText || ''}${nextText || ''}`;

const ChatPanel = ({
  onMinimizeChange,
  bookId,
  chapterId,
  defaultMinimized = false,
  bookTitle, chapters = [], pages = [], pageId, getPageContext, openRequest, onPageCreated,
}) => {
  const [messages, setMessages] = useState([]);
  const [tab, setTab] = useState('chat');
  const inputRef = useRef(null);
  const launcherRef = useRef(null);
  const endRef = useRef(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);
  const [panelWidth, setPanelWidth] = useState(390); // Default 320px (w-80)
  const [isResizing, setIsResizing] = useState(false);
  const messagesRef = useRef(messages);
  const [conversationId, setConversationId] = useState('');
  const conversationIdRef = useRef(conversationId);
  const context = useWritingAssistantContext({ bookId, bookTitle, chapters, chapterId, pageId, pages, getPageContext });
  const requestContextForMessage = (messageId) => messagesRef.current.find((msg) => msg.id === messageId)?.requestContext;
  const welcomePrompts = context.scope === 'book'
    ? ['Help me plan the book', 'What connects these chapters?', 'Suggest what I could write next']
    : context.scope === 'page'
      ? ['Help me develop this page', 'What could I make clearer?', 'Suggest what I could write next']
      : ['Help me outline this chapter', 'Suggest what I could write next', 'Help me reflect on a memory'];

  const attachCardsToAssistant = (assistantId, eventName, payload) => {
    const cards = extractUiCards(eventName, payload);
    if (cards.length === 0) return;
    setMessages(prev => prev.map((msg) => (
      msg.id === assistantId
        ? { ...msg, uiCards: mergeUniqueCards(msg.uiCards, cards) }
        : msg
    )));
  };

  const setMessageActionState = (messageId, cardId, actionId, nextState) => {
    const actionKey = buildUiActionStateKey(cardId, actionId);
    setMessages(prev => prev.map((msg) => (
      msg.id === messageId
        ? {
          ...msg,
          uiActionState: {
            ...(msg.uiActionState || {}),
            [actionKey]: nextState,
          },
        }
        : msg
    )));
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userQuery = input.trim();
    const assistantId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setMessages(prev => [
      ...prev,
      { role: 'user', content: userQuery, contextLabel: context.label },
      { id: assistantId, role: 'assistant', content: '', streamingContent: '', isStreaming: true, sources: [], actions: [] },
    ]);
    setInput('');
    setIsLoading(true);

    try {
      const requestContext = await context.getRequestContext();
      setMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, requestContext } : msg));
      const history = [...messagesRef.current, { role: 'user', content: userQuery }];

      await streamAirabookAI({
        messages: history,
        scope: 'book_assistant',
        bookId,
        ...requestContext,
        conversationId: conversationIdRef.current,
        onPageDone: (data) => onPageCreated?.(data),
        onChunk: (text) => {
          setMessages(prev => prev.map(msg => (
            msg.id === assistantId
              ? { ...msg, streamingContent: appendStreamingText(msg.streamingContent, text), isStreaming: true }
              : msg
          )));
        },
        onDone: (data) => {
          const resolvedConversationId = extractConversationId(data);
          if (resolvedConversationId) {
            setConversationId(resolvedConversationId);
          }
          const doneCards = extractUiCards('done', data);
          setMessages(prev => prev.map(msg => (
            msg.id === assistantId
              ? {
                ...msg,
                content: data?.text || msg.content || msg.streamingContent || '',
                isStreaming: false,
                sources: data?.sources || msg.sources,
                actions: data?.actions || [],
                actionPrompt: data?.actionPrompt || '',
                uiCards: mergeUniqueCards(msg.uiCards, doneCards),
              }
              : msg
          )));
        },
        onEvent: (eventName, payload) => {
          attachCardsToAssistant(assistantId, eventName, payload);
        },
        onError: () => {
          setMessages(prev => prev.map(msg => (
            msg.id === assistantId
              ? { ...msg, content: 'Sorry, I encountered an error while searching your book. Please try again.', isStreaming: false }
              : msg
          )));
        },
      });
    } catch (error) {
      console.error('RAG Query Error:', error);
      setMessages(prev => prev.map(msg => (
        msg.id === assistantId
          ? { ...msg, content: error.name === 'WritingContextError' ? error.message : 'Sorry, I encountered an error while searching your book. Please try again.', isStreaming: false }
          : msg
      )));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (messageId, action = {}) => {
    const actionId = typeof action === 'string' ? action : action.id;
    if (actionId === 'deny_generate_chapter') {
      setMessages(prev => prev.map(msg => (
        msg.id === messageId ? { ...msg, actions: [], actionPrompt: '' } : msg
      )));
      return;
    }

    if (actionId !== 'generate_chapter' && actionId !== 'create_book') return;

    const userMessage = { role: 'user', content: actionId === 'create_book' ? 'Create this book.' : 'Generate this chapter.' };
    const assistantId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setMessages(prev => ([
      ...prev.map(msg => (
        msg.id === messageId ? { ...msg, actions: [], actionPrompt: '' } : msg
      )),
      userMessage,
      { id: assistantId, role: 'assistant', content: '', streamingContent: '', isStreaming: true, sources: [], actions: [] },
    ]));

    try {
      const requestContext = requestContextForMessage(messageId) || await context.getRequestContext();
      setMessages(prev => prev.map(msg => msg.id === assistantId ? { ...msg, requestContext } : msg));
      const history = [...messagesRef.current, userMessage];
      await streamAirabookAI({
        messages: history,
        action: actionId,
        scope: 'book_assistant',
        bookId,
        ...requestContext,
        conversationId: conversationIdRef.current,
        onPageDone: (data) => onPageCreated?.(data),
        onChunk: (text) => {
          setMessages(prev => prev.map(msg => (
            msg.id === assistantId
              ? { ...msg, streamingContent: appendStreamingText(msg.streamingContent, text), isStreaming: true }
              : msg
          )));
        },
        onDone: (data) => {
          const resolvedConversationId = extractConversationId(data);
          if (resolvedConversationId) {
            setConversationId(resolvedConversationId);
          }
          const doneCards = extractUiCards('done', data);
          setMessages(prev => prev.map(msg => (
            msg.id === assistantId
              ? {
                ...msg,
                content: data?.text || msg.content || msg.streamingContent || '',
                isStreaming: false,
                sources: data?.sources || msg.sources,
                actions: data?.actions || [],
                actionPrompt: data?.actionPrompt || '',
                uiCards: mergeUniqueCards(msg.uiCards, doneCards),
              }
              : msg
          )));
        },
        onEvent: (eventName, payload) => {
          attachCardsToAssistant(assistantId, eventName, payload);
        },
        onError: () => {
          setMessages(prev => prev.map(msg => (
            msg.id === assistantId
              ? { ...msg, content: 'Sorry, I could not generate the chapter. Please try again.', isStreaming: false }
              : msg
          )));
        },
      });
    } catch (error) {
      console.error('Generate chapter error:', error);
      setMessages(prev => prev.map(msg => (
        msg.id === assistantId
          ? { ...msg, content: 'Sorry, I could not generate the chapter. Please try again.', isStreaming: false }
          : msg
      )));
    }
  };

  const handleCardAction = async (messageId, card, action) => {
    const actionId = action?.id || 'action';
    const actionKey = buildUiActionStateKey(card?.id, actionId);
    if (!action?.endpoint && !action?.link && !action?.bodyTemplate && !action?.body) {
      if (actionId === 'generate_chapter' || actionId === 'create_book' || actionId === 'deny_generate_chapter') {
        await handleAction(messageId, action);
        return;
      }
      setMessages(prev => prev.map((msg) => (
        msg.id === messageId
          ? {
            ...msg,
            uiActionState: {
              ...(msg.uiActionState || {}),
              [actionKey]: { status: 'error', message: 'No endpoint configured for this action.' },
            },
          }
          : msg
      )));
      return;
    }
    setMessageActionState(messageId, card?.id, actionId, { status: 'pending', message: '' });

    try {
      const requestContext = requestContextForMessage(messageId);
      const result = await executeChatUiAction({
        action,
        card,
        context: {
          conversationId: conversationIdRef.current,
          bookId,
          chapterId: requestContext ? requestContext.chapterId : context.chapterId,
          pageId: requestContext ? requestContext.pageId : context.pageId,
          source: 'book_assistant',
          messageId,
          cardId: card?.id,
          interactionId: card?.payload?.interactionId || '',
          runId: card?.payload?.runId || '',
          responsePath: card?.payload?.responsePath || '',
          hitlContext: card?.payload?.context || {},
        },
        onEvent: (eventName, payload) => {
          attachCardsToAssistant(messageId, eventName, payload);
        },
      });
      const resultCards = extractUiCards('action_result', result?.payload || {});
      setMessages(prev => prev.map((msg) => (
        msg.id === messageId
          ? {
            ...msg,
            uiCards: mergeUniqueCards(msg.uiCards, resultCards),
            uiActionState: {
              ...(msg.uiActionState || {}),
              [actionKey]: { status: 'success', message: result?.message || 'Acknowledged.' },
            },
          }
          : msg
      )));
    } catch (error) {
      setMessages(prev => prev.map((msg) => (
        msg.id === messageId
          ? {
            ...msg,
            uiActionState: {
              ...(msg.uiActionState || {}),
              [actionKey]: { status: 'error', message: error?.message || 'Action failed.' },
            },
          }
          : msg
      )));
    }
  };

  const handleHitlDecision = async (messageId, card, option, selectedIndex) => {
    const optionId = option?.id || String(selectedIndex + 1);
    const actionKey = buildUiActionStateKey(card?.id, optionId);
    setMessageActionState(messageId, card?.id, optionId, { status: 'pending', message: '' });

    try {
      const requestContext = requestContextForMessage(messageId);
      const result = await executeChatUiAction({
        action: {
          id: optionId,
          label: option?.label || `Option ${selectedIndex + 1}`,
          method: 'POST',
          endpoint: card?.payload?.responsePath || '',
          bodyTemplate: {
            action: 'human_in_loop_response',
            interactionId: '{{interactionId}}',
            runId: '{{runId}}',
            conversationId: '{{conversationId}}',
            source: 'book_assistant',
            selectedIndex: '{{selectedIndex}}',
            selectedOption: '{{selectedOption}}',
            context: '{{hitlContext}}',
          },
        },
        card,
        context: {
          conversationId: conversationIdRef.current,
          bookId,
          chapterId: requestContext ? requestContext.chapterId : context.chapterId,
          pageId: requestContext ? requestContext.pageId : context.pageId,
          source: 'book_assistant',
          messageId,
          cardId: card?.id,
          interactionId: card?.payload?.interactionId || '',
          runId: card?.payload?.runId || '',
          responsePath: card?.payload?.responsePath || '',
          selectedIndex,
          selectedOption: option || {},
          hitlContext: card?.payload?.context || {},
        },
        onEvent: (eventName, payload) => {
          attachCardsToAssistant(messageId, eventName, payload);
        },
      });
      const resultCards = extractUiCards('hitl_decision', result?.payload || {});
      setMessages(prev => prev.map((msg) => (
        msg.id === messageId
          ? {
            ...msg,
            uiCards: mergeUniqueCards(msg.uiCards, resultCards),
            uiActionState: {
              ...(msg.uiActionState || {}),
              [actionKey]: { status: 'success', message: result?.message || 'Decision recorded.' },
            },
          }
          : msg
      )));
    } catch (error) {
      setMessages(prev => prev.map((msg) => (
        msg.id === messageId
          ? {
            ...msg,
            uiActionState: {
              ...(msg.uiActionState || {}),
              [actionKey]: { status: 'error', message: error?.message || 'Decision failed.' },
            },
          }
          : msg
      )));
    }
  };

  // Handle resize drag
  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    onMinimizeChange?.(isMinimized);
  }, [isMinimized, onMinimizeChange]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      // Clamp width between 280px and 600px
      setPanelWidth(Math.max(280, Math.min(600, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    if (!openRequest) return;
    setIsMinimized(false);
    setTab(openRequest.tab || 'chat');
    if (openRequest.prompt) setInput(openRequest.prompt);
  }, [openRequest]);

  useEffect(() => {
    if (isMinimized) return;
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isMinimized, tab]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [messages, tab]);

  const choosePrompt = (prompt) => { setInput(prompt); setTab('chat'); };
  const closeAssistant = () => { setIsMinimized(true); requestAnimationFrame(() => launcherRef.current?.focus()); };

  if (isMinimized) {
    return (
      <Button ref={launcherRef} className="book-assistant-launcher" variant="appPrimary" onClick={() => setIsMinimized(false)} title="Expand AI Assistant" aria-label="Open writing assistant">
        <Sparkles className="h-4 w-4" />Ask AI
      </Button>
    );
  }

  return (
    <aside
      aria-label="Writing assistant"
      className="book-assistant-panel flex flex-col bg-card text-foreground shrink-0 relative"
      style={{ '--assistant-width': `${panelWidth}px` }}
      onKeyDown={(event) => { if (event.key === 'Escape' && !event.defaultPrevented && !event.target.closest('[role="menu"]')) { event.stopPropagation(); closeAssistant(); } }}
    >
      {/* Resize handle */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-app-iris/40 transition-colors ${isResizing ? 'bg-app-iris/60' : 'bg-transparent'}`}
        onMouseDown={handleMouseDown}
        title="Drag to resize"
      />

      <div className="book-assistant-header">
        <div className="flex items-center gap-2 min-w-0"><Sparkles className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Writing assistant</h3></div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-md" title="Minimize" aria-label="Close writing assistant" onClick={closeAssistant}><X className="h-4 w-4" /></Button>
      </div>
      <div className="book-assistant-context-row">
        <WritingContextPicker context={context} chapters={chapters} bookTitle={bookTitle} />
        <span data-testid="assistant-context-mode" className="book-assistant-context-mode">{context.selection.mode === 'follow' ? 'Following editor' : 'Pinned'}</span>
      </div>
      <div className="book-assistant-tabs" role="tablist" aria-label="Assistant tools" onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const nextTab = event.key === 'Home' ? 'chat' : event.key === 'End' ? 'ideas' : tab === 'chat' ? 'ideas' : 'chat';
        setTab(nextTab);
        document.getElementById(`assistant-${nextTab === 'chat' ? 'chat' : 'ideas'}-tab`)?.focus();
      }}>
        <button id="assistant-chat-tab" role="tab" aria-label="Conversation" tabIndex={tab === 'chat' ? 0 : -1} aria-selected={tab === 'chat'} aria-controls="assistant-content" onClick={() => setTab('chat')}><MessageSquare className="h-3.5 w-3.5" />Chat</button>
        <button id="assistant-ideas-tab" role="tab" aria-label="Chapter ideas" tabIndex={tab === 'ideas' ? 0 : -1} aria-selected={tab === 'ideas'} aria-controls="assistant-content" onClick={() => setTab('ideas')}><Lightbulb className="h-3.5 w-3.5" />Chapter ideas</button>
      </div>
      <div id="assistant-content" className="book-assistant-content flex-1 min-h-0 overflow-y-auto" role="tabpanel" aria-labelledby={tab === 'chat' ? 'assistant-chat-tab' : 'assistant-ideas-tab'}>
        {tab === 'ideas' ? (
          <>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">A starting point for your chapter. Pick an idea to add it to your message.</p>
            {context.chapterId ? <GenerateChapterContent key={context.chapterId} bookId={bookId} chapterId={context.chapterId} onSuggestionSelect={choosePrompt} compact /> : <p className="text-sm text-muted-foreground">Choose a chapter in the context menu to explore writing ideas.</p>}
          </>
        ) : <>
        {messages.length === 0 && <div className="book-assistant-welcome">
          <h4 className="text-base font-semibold tracking-tight">A little space to think.</h4>
          <p className="text-sm text-muted-foreground leading-relaxed mt-2">Work through an idea or ask about your {context.scope}. Your writing stays yours.</p>
          <div className="grid gap-1 mt-5">
            {welcomePrompts.map(prompt => <button key={prompt} className="book-assistant-prompt" onClick={() => choosePrompt(prompt)}>{prompt}<ArrowUp className="h-3.5 w-3.5 rotate-45 shrink-0" /></button>)}
          </div>
        </div>}
        {messages.map((msg, i) => (
          <div key={msg.id || i} className={`book-assistant-message book-assistant-message-${msg.role}`}>
            {msg.role === 'user' && msg.contextLabel && <p className="book-assistant-message-context">{msg.contextLabel}</p>}
            <div className={msg.role === 'user' ? 'book-assistant-user-text' : 'book-assistant-answer'}>
              {msg.role === 'user' ? <p className="whitespace-pre-wrap">{msg.content}</p> : (msg.streamingContent || msg.content) ? <ReactMarkdown>{msg.isStreaming ? (msg.streamingContent || msg.content) : msg.content}</ReactMarkdown> : <MessageContent isStreaming={msg.isStreaming} />}
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/20 text-xs opacity-80">
                  <p className="font-semibold mb-1">Sources:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {msg.sources.map((source, idx) => (
                      <li key={idx}>{source.shortNote}</li>
                    ))}
                  </ul>
                </div>
              )}
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-3 rounded-lg border border-border/30 bg-app-gray-50 px-2 py-2 text-xs text-foreground">
                  <p className="font-semibold text-[10px] uppercase tracking-wide text-muted-foreground">
                    {msg.actionPrompt || 'Next step'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {msg.actions.map((action) => (
                      <Button
                        key={action.id}
                        type="button"
                        size="sm"
                        variant={action.id === 'generate_chapter' || action.id === 'create_book' ? 'appPrimary' : 'appOutline'}
                        onClick={() => handleAction(msg.id, action)}
                        className="h-7 px-2 text-[11px]"
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              {msg.uiCards && msg.uiCards.length > 0 && (
                <StreamUiCards
                  cards={msg.uiCards}
                  actionState={msg.uiActionState || {}}
                  onAction={(card, action) => handleCardAction(msg.id, card, action)}
                  onDecision={(card, option, index) => handleHitlDecision(msg.id, card, option, index)}
                />
              )}
            </div>
          </div>
        ))}

        <div ref={endRef} />
        </>}
      </div>
      {tab === 'chat' && <form className="book-assistant-composer" onSubmit={(event) => { event.preventDefault(); handleSend(); }}>
        <div className="book-assistant-input-wrap">
          <Textarea ref={inputRef} value={input} onChange={event => setInput(event.target.value)} aria-label="Message writing assistant" placeholder={`Ask about this ${context.scope}…`} className="book-assistant-input" rows={2} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); handleSend(); } }} disabled={isLoading} />
          <div className="flex items-center justify-between px-3 pb-2"><span className="text-[10px] text-muted-foreground">{isLoading ? 'Thinking…' : 'Shift + Enter for a new line'}</span><Button type="submit" size="icon" variant="appPrimary" className="h-8 w-8 rounded-lg" aria-label="Send message" disabled={isLoading || !input.trim()}><ArrowUp className="h-4 w-4" /></Button></div>
        </div>
      </form>}
    </aside>
  );
};

export default ChatPanel;
