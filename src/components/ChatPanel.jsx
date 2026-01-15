import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Send } from 'lucide-react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { streamAirabookAI } from '@/lib/aiStream';

const ChatPanel = ({
  onMinimizeChange,
  bookId,
  chapterId,
  incomingMessages,
  incomingMessagesToken,
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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userQuery = input.trim();
    const assistantId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setMessages(prev => [
      ...prev,
      { role: 'user', content: userQuery },
      { id: assistantId, role: 'assistant', content: '', sources: [], actions: [] },
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
        onChunk: (text) => {
          setMessages(prev => prev.map(msg => (
            msg.id === assistantId ? { ...msg, content: `${msg.content}${text}` } : msg
          )));
        },
        onDone: (data) => {
          setMessages(prev => prev.map(msg => (
            msg.id === assistantId
              ? {
                ...msg,
                content: data?.text || msg.content,
                sources: data?.sources || msg.sources,
                actions: data?.actions || [],
                actionPrompt: data?.actionPrompt || '',
              }
              : msg
          )));
        },
        onError: () => {
          setMessages(prev => prev.map(msg => (
            msg.id === assistantId
              ? { ...msg, content: 'Sorry, I encountered an error while searching your book. Please try again.' }
              : msg
          )));
        },
      });
    } catch (error) {
      console.error('RAG Query Error:', error);
      setMessages(prev => prev.map(msg => (
        msg.id === assistantId
          ? { ...msg, content: 'Sorry, I encountered an error while searching your book. Please try again.' }
          : msg
      )));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (messageId, actionId) => {
    if (actionId === 'deny_generate_chapter') {
      setMessages(prev => prev.map(msg => (
        msg.id === messageId ? { ...msg, actions: [], actionPrompt: '' } : msg
      )));
      return;
    }

    if (actionId !== 'generate_chapter' || actionId === 'create_book') return;

    const userMessage = { role: 'user', content: 'Generate this chapter.' };
    const assistantId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setMessages(prev => ([
      ...prev.map(msg => (
        msg.id === messageId ? { ...msg, actions: [], actionPrompt: '' } : msg
      )),
      userMessage,
      { id: assistantId, role: 'assistant', content: '', sources: [], actions: [] },
    ]));

    try {
      const history = messagesRef.current;
      await streamAirabookAI({
        messages: history,
        action: actionId,
        scope: 'book_assistant',
        bookId,
        chapterId,
        onChunk: (text) => {
          setMessages(prev => prev.map(msg => (
            msg.id === assistantId ? { ...msg, content: `${msg.content}${text}` } : msg
          )));
        },
        onDone: (data) => {
          setMessages(prev => prev.map(msg => (
            msg.id === assistantId
              ? {
                ...msg,
                content: data?.text || msg.content,
                sources: data?.sources || msg.sources,
              }
              : msg
          )));
        },
        onError: () => {
          setMessages(prev => prev.map(msg => (
            msg.id === assistantId
              ? { ...msg, content: 'Sorry, I could not generate the chapter. Please try again.' }
              : msg
          )));
        },
      });
    } catch (error) {
      console.error('Generate chapter error:', error);
      setMessages(prev => prev.map(msg => (
        msg.id === assistantId
          ? { ...msg, content: 'Sorry, I could not generate the chapter. Please try again.' }
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

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user'
              ? 'bg-app-iris text-white rounded-br-none'
              : 'bg-app-gray-100 text-foreground rounded-bl-none'
              }`}>
              <p>{msg.content}</p>
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
                        onClick={() => handleAction(msg.id, action.id)}
                        className="h-7 px-2 text-[11px]"
                      >
                        {action.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-app-gray-100 text-foreground rounded-2xl rounded-bl-none px-3 py-2 text-sm flex items-center gap-1">
              <div className="w-1.5 h-1.5 bg-app-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 bg-app-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 bg-app-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
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
