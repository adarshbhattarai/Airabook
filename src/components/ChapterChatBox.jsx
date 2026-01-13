import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Send } from 'lucide-react';
import { streamAirabookAI } from '@/lib/aiStream';

const ChapterChatBox = ({
  inputValue,
  onInputChange,
  bookId,
  chapterId,
  canTransfer,
  onTransfer,
}) => {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I can help you plan this chapter, brainstorm ideas, or outline key moments. What should we start with?' }
  ]);
  const [internalInput, setInternalInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isControlled = typeof onInputChange === 'function' && inputValue !== undefined;
  const input = isControlled ? inputValue : internalInput;
  const setInput = isControlled ? onInputChange : setInternalInput;
  const messagesRef = useRef(messages);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    debugger;
    const userQuery = input.trim();
    const assistantId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setMessages(prev => [
      ...prev,
      { role: 'user', content: userQuery },
      { id: assistantId, role: 'assistant', content: '', actions: [] },
    ]);
    setInput('');
    setIsLoading(true);

    try {
      const history = [...messages, 
        { role: 'user', content: userQuery, isChapterGenerator: true }];

      await streamAirabookAI({
        messages: history,
        scope: 'chapter_assistant',
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
                actions: data?.actions || [],
                actionPrompt: data?.actionPrompt || '',
              }
              : msg
          )));
        },
        onError: () => {
          setMessages(prev => prev.map(msg => (
            msg.id === assistantId
              ? { ...msg, content: 'Sorry, I hit an error while responding. Please try again.' }
              : msg
          )));
        },
      });
    } catch (error) {
      console.error('RAG Query Error:', error);
      setMessages(prev => prev.map(msg => (
        msg.id === assistantId
          ? { ...msg, content: 'Sorry, I hit an error while responding. Please try again.' }
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

    if (actionId !== 'generate_chapter') return;

    const userMessage = { role: 'user', content: 'Generate this chapter.' };
    const assistantId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setMessages(prev => ([
      ...prev.map(msg => (
        msg.id === messageId ? { ...msg, actions: [], actionPrompt: '' } : msg
      )),
      userMessage,
      { id: assistantId, role: 'assistant', content: '', actions: [] },
    ]));

    try {
      const history = messagesRef.current;
      await streamAirabookAI({
        messages: history,
        scope: 'chapter_assistant',
        action: 'generate_chapter',
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
              ? { ...msg, content: data?.text || msg.content }
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

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-app-iris" />
          <h3 className="text-sm font-semibold text-foreground">AI Assistant</h3>
        </div>
        {canTransfer && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onTransfer?.(messages)}
          >
            Transfer &lt;-&gt;
          </Button>
        )}
      </div>
      <div className="mt-3 max-h-56 space-y-3 overflow-y-auto">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user'
              ? 'bg-app-iris text-white rounded-br-none'
              : 'bg-app-gray-100 text-foreground rounded-bl-none'
            }`}>
              <p>{msg.content}</p>
              {msg.actions && msg.actions.length > 0 && (
                <div className="mt-2 rounded-lg border border-border/30 bg-white/70 px-2 py-2 text-xs text-foreground">
                  <p className="font-semibold text-[10px] uppercase tracking-wide text-muted-foreground">
                    {msg.actionPrompt || 'Next step'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {msg.actions.map((action) => (
                      <Button
                        key={action.id}
                        type="button"
                        size="sm"
                        variant={action.id === 'generate_chapter' ? 'appPrimary' : 'appOutline'}
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

      <div className="mt-3">
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
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChapterChatBox;
