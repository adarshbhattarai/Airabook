import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImagePlus, Sparkles, Send } from 'lucide-react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
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
  incomingMessages,
  incomingMessagesToken,
  onOpenPhotoPlanner,
}) => {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I can help you plan your book, brainstorm ideas, or review your writing. What are you working on today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [panelWidth, setPanelWidth] = useState(320); // Default 320px (w-80)
  const [isResizing, setIsResizing] = useState(false);
  const messagesRef = useRef(messages);
  const [conversationId, setConversationId] = useState('');
  const conversationIdRef = useRef(conversationId);

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
      { role: 'user', content: userQuery },
      { id: assistantId, role: 'assistant', content: '', streamingContent: '', isStreaming: true, sources: [], actions: [] },
    ]);
    setInput('');
    setIsLoading(true);

    try {
      // Construct history including the new user message
      const history = [...messagesRef.current, { role: 'user', content: userQuery }];

      await streamAirabookAI({
        messages: history,
        scope: 'book_assistant',
        bookId,
        chapterId,
        conversationId: conversationIdRef.current,
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
          ? { ...msg, content: 'Sorry, I encountered an error while searching your book. Please try again.', isStreaming: false }
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
      const history = messagesRef.current;
      await streamAirabookAI({
        messages: history,
        action: actionId,
        scope: 'book_assistant',
        bookId,
        chapterId,
        conversationId: conversationIdRef.current,
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
      const result = await executeChatUiAction({
        action,
        card,
        context: {
          conversationId: conversationIdRef.current,
          bookId,
          chapterId,
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
          chapterId,
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
    if (!Array.isArray(incomingMessages) || incomingMessages.length === 0) {
      return;
    }
    setMessages(incomingMessages);
  }, [incomingMessagesToken, incomingMessages]);

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

  if (isMinimized) {
    return (
      <div className="shrink-0 bg-card border-l border-border flex flex-col items-center w-12 transition-all duration-300">
        <div className="h-[57px] flex items-center justify-center w-full border-b border-border bg-card/80 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMinimized(false)}
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Expand AI Assistant"
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full bg-card border-l border-border shrink-0 relative transition-all duration-200"
      style={{ width: `${panelWidth}px` }}
    >
      {/* Resize handle */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-app-iris/40 transition-colors ${isResizing ? 'bg-app-iris/60' : 'bg-transparent'}`}
        onMouseDown={handleMouseDown}
        title="Drag to resize"
      />

      <div className="h-[57px] px-4 border-b border-border flex items-center justify-between bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-app-iris" />
          <h3 className="font-semibold text-foreground text-sm">AI Assistant</h3>
        </div>
        <div className="flex items-center gap-1">
          {onOpenPhotoPlanner && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenPhotoPlanner({
                source: 'book_assistant',
                initialPrompt: input.trim(),
              })}
              className="h-7 px-2 text-xs"
              title="Plan with media"
            >
              <ImagePlus className="h-3.5 w-3.5 mr-1 text-app-iris" />
              Plan media
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsMinimized(true)}
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Minimize"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={msg.id || i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user'
              ? 'bg-app-iris text-white rounded-br-none'
              : 'bg-app-gray-100 text-foreground rounded-bl-none'
              }`}>
              <MessageContent
                content={msg.content}
                streamingContent={msg.streamingContent}
                isStreaming={msg.isStreaming}
              />
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
      </div>

      <div className="p-3 border-t border-border bg-card">
        <div className="relative">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Lets manifest your Idea."
            className="pr-10 text-sm"
            onKeyDown={e => e.key === 'Enter' && !isLoading && handleSend()}
            disabled={isLoading}
          />
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-1 top-1 h-7 w-7 text-app-iris hover:bg-app-iris/10"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;
