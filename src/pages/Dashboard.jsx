import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Send, Sparkles, BookText, X, MessageCircle, Mic } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { streamAirabookAI } from '@/lib/aiStream';
import { useToast } from '@/components/ui/use-toast';
import { doc, getDoc } from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const Dashboard = () => {
  const eyebrowText = 'PRESERVE THE MOMENTS THAT MATTER';
  const location = useLocation();
  const { appUser } = useAuth();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [isChatStarted, setIsChatStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [contextItems, setContextItems] = useState([]);
  const [isMicListening, setIsMicListening] = useState(false);
  const [unreadCount] = useState(0);
  const messagesEndRef = React.useRef(null);
  const hasSubmittedInitialPrompt = React.useRef(false);
  const messagesRef = useRef(messages);
  const promptInputRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const voiceEnv = {
    wsUrl: import.meta.env.VITE_VOICE_WS_URL,
    backendApiUrl: import.meta.env.VITE_BACKEND_API_URL,
    springApiUrl: import.meta.env.VITE_SPRING_API_URL,
  };

  // Build context sources from user profile (books first, then albums as fallback).
  const rawContextItems = useMemo(() => {
    if (!appUser) return [];

    const booksSource = Array.isArray(appUser.accessibleBookIds) ? appUser.accessibleBookIds : [];
    const albumsSource = Array.isArray(appUser.accessibleAlbums) ? appUser.accessibleAlbums : [];
    const merged = [];

    booksSource.forEach((item) => {
      if (typeof item === 'string') {
        merged.push({ bookId: item, title: '' });
      } else if (item && typeof item === 'object') {
        merged.push({
          bookId: item.bookId || item.id || '',
          title: item.title || item.name || item.babyName || '',
        });
      }
    });

    albumsSource.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const itemType = (item.type || '').toLowerCase();
      if (itemType && itemType !== 'book') return;

      merged.push({
        bookId: item.bookId || item.id || '',
        title: item.title || item.name || item.babyName || '',
      });
    });

    const deduped = [];
    const seen = new Set();
    merged.forEach((item) => {
      if (!item.bookId || seen.has(item.bookId)) return;
      seen.add(item.bookId);
      deduped.push({
        bookId: item.bookId,
        title: item.title || '',
      });
    });

    return deduped;
  }, [appUser]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    let active = true;

    const hydrateContextItems = async () => {
      if (!rawContextItems.length) {
        if (active) setContextItems([]);
        return;
      }

      const hydrated = await Promise.all(
        rawContextItems.map(async (item) => {
          if (item.title && item.title.trim()) return { ...item, title: item.title.trim() };

          try {
            const snap = await getDoc(doc(firestore, 'books', item.bookId));
            if (!snap.exists()) {
              return { ...item, title: 'Untitled Book' };
            }

            const data = snap.data() || {};
            const resolvedTitle = data.babyName || data.title || data.name || 'Untitled Book';
            return { ...item, title: String(resolvedTitle).trim() || 'Untitled Book' };
          } catch (error) {
            console.warn('Failed to hydrate context book title:', item.bookId, error);
            return { ...item, title: 'Untitled Book' };
          }
        })
      );

      if (active) setContextItems(hydrated);
    };

    hydrateContextItems();
    return () => {
      active = false;
    };
  }, [rawContextItems]);

  const submitPrompt = async (promptText, options = {}) => {
    const isSurprise = options.isSurprise || false;

    // For surprise mode, allow empty prompt
    if (!isSurprise && !promptText.trim()) return;
    if (isSubmitting) return;

    // Display user-friendly message in chat for surprise mode
    const displayContent = isSurprise ? "Surprise me with a creative book idea!" : promptText;
    const userMessage = { role: 'user', content: displayContent };
    const assistantId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const assistantMessage = { id: assistantId, role: 'model', content: '', sources: [], actions: [] };
    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setPrompt('');
    setIsChatStarted(true);
    setIsSubmitting(true);

    try {
      // Prepare history for backend (including the new message)
      const history = [...messages, userMessage];

      await streamAirabookAI({
        messages: history,
        scope:'dashboard',
        isSurprise,
        bookContext: selectedBook ? { bookId: selectedBook.bookId, title: selectedBook.title } : null,
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
              ? { ...msg, content: "I'm sorry, I encountered an error. Please try again." }
              : msg
          )));
        },
      });
    } catch (error) {
      console.error('Error submitting prompt:', error);
      setMessages(prev => prev.map(msg => (
        msg.id === assistantId
          ? { ...msg, content: "I'm sorry, I encountered an error. Please try again." }
          : msg
      )));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAction = async (messageId, actionId) => {
    if (actionId === 'deny_generate_chapter') {
      setMessages(prev => prev.map(msg => (
        msg.id === messageId ? { ...msg, actions: [], actionPrompt: '' } : msg
      )));
      return;
    }

    if(actionId !=='generate_chapter' || actionId !=='create_book')  return;

    const userMessage = { role: 'user', content: 'Generate this chapter.' };
    const assistantId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    setMessages(prev => ([
      ...prev.map(msg => (
        msg.id === messageId ? { ...msg, actions: [], actionPrompt: '' } : msg
      )),
      userMessage,
      { id: assistantId, role: 'model', content: '', sources: [], actions: [] },
    ]));

    try {
      const history = messagesRef.current;
      await streamAirabookAI({
        messages: history,
        action: actionId,
        scope: 'dashboard',
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
              ? { ...msg, content: "I'm sorry, I couldn't generate the chapter. Please try again." }
              : msg
          )));
        },
      });
    } catch (error) {
      console.error('Generate chapter error:', error);
      setMessages(prev => prev.map(msg => (
        msg.id === assistantId
          ? { ...msg, content: "I'm sorry, I couldn't generate the chapter. Please try again." }
          : msg
      )));
    }
  };

  useEffect(() => {
    if (location.state?.prompt && !hasSubmittedInitialPrompt.current) {
      const initialPrompt = location.state.prompt;
      hasSubmittedInitialPrompt.current = true;
      submitPrompt(initialPrompt);
      // Optional: clear location state
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  useEffect(() => {
    // TEMP DEBUG: Remove after env verification in browser console.
    console.log('[Voice Env Debug]', {
      VITE_VOICE_WS_URL: voiceEnv.wsUrl,
      VITE_BACKEND_API_URL: voiceEnv.backendApiUrl,
      VITE_SPRING_API_URL: voiceEnv.springApiUrl,
      MODE: import.meta.env.MODE,
    });
  }, []);

  useEffect(() => {
    return () => {
      try {
        speechRecognitionRef.current?.abort?.();
      } catch (_) {
        // ignore cleanup errors
      } finally {
        speechRecognitionRef.current = null;
      }
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    submitPrompt(prompt);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFloatingChat = () => {
    promptInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    requestAnimationFrame(() => {
      promptInputRef.current?.focus();
    });
  };

  const handleFloatingMic = () => {
    const normalizeBaseUrl = (value) => {
      if (!value || typeof value !== 'string') return '';
      return value.trim().replace(/\/+$/, '');
    };

    const resolveVoiceWsUrl = () => {
      const explicit = normalizeBaseUrl(voiceEnv.wsUrl);
      if (explicit) return explicit;

      const springBase = normalizeBaseUrl(voiceEnv.springApiUrl);
      const backendBase = normalizeBaseUrl(voiceEnv.backendApiUrl);
      const base = springBase || backendBase;
      if (base) {
        const wsBase = base.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
        return `${wsBase}/ws/voice`;
      }

      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'ws://localhost:8000/ws/voice';
      }

      return '';
    };

    const resolvedVoiceWsUrl = resolveVoiceWsUrl();
    const isVoiceConfigured = Boolean(resolvedVoiceWsUrl);

    // TEMP DEBUG: Remove after env verification in browser console.
    console.log('[Voice Env Runtime Check]', {
      VITE_VOICE_WS_URL: voiceEnv.wsUrl,
      VITE_BACKEND_API_URL: voiceEnv.backendApiUrl,
      VITE_SPRING_API_URL: voiceEnv.springApiUrl,
      resolvedVoiceWsUrl,
      isVoiceConfigured,
    });

    if (!isVoiceConfigured) {
      toast({
        title: 'Voice not configured yet',
        duration: 3000,
      });
      return;
    }

    const openVoiceUi =
      window?.airabookVoice?.open ||
      window?.openAirabookVoiceUI ||
      window?.openVoiceUI;
    if (typeof openVoiceUi === 'function') {
      openVoiceUi({ voiceWsUrl: resolvedVoiceWsUrl });
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({
        title: 'Voice not configured yet',
        description: 'No voice UI hook or browser speech recognition is available.',
        duration: 3000,
      });
      return;
    }

    if (isMicListening) {
      try {
        speechRecognitionRef.current?.stop?.();
      } catch (_) {
        // ignore stop errors
      }
      return;
    }

    // Always start a fresh recognition session so mic can be used repeatedly.
    try {
      speechRecognitionRef.current?.abort?.();
    } catch (_) {
      // ignore stale session abort errors
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsMicListening(true);
      toast({
        title: 'Listening...',
        description: 'Speak now to add text to your prompt.',
        duration: 1800,
      });
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((result) => result?.[0]?.transcript || '')
        .join(' ')
        .trim();
      if (!transcript) return;

      setPrompt((prev) => (prev.trim() ? `${prev}\n${transcript}` : transcript));
      requestAnimationFrame(() => {
        promptInputRef.current?.focus();
      });
    };

    recognition.onerror = (event) => {
      toast({
        title: 'Voice capture failed',
        description: event?.error ? `Speech recognition error: ${event.error}` : 'Could not capture voice input.',
        variant: 'destructive',
      });
      setIsMicListening(false);
      speechRecognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsMicListening(false);
      speechRecognitionRef.current = null;
    };

    speechRecognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (error) {
      setIsMicListening(false);
      speechRecognitionRef.current = null;
      toast({
        title: 'Voice capture failed',
        description: error?.message || 'Could not start speech recognition.',
        variant: 'destructive',
      });
    }
  };

  const handleContextSelect = (book) => {
    if (!book) return;

    setSelectedBook(book);
    setPrompt((prev) => {
      const contextSnippet = `Context: ${book.title}`;
      if (!prev.trim()) return contextSnippet;

      const separator = prev.endsWith('\n') ? '\n' : '\n\n';
      return `${prev}${separator}${contextSnippet}`;
    });
    setIsContextMenuOpen(false);

    requestAnimationFrame(() => {
      promptInputRef.current?.focus();
    });
  };

  return (
    <div className="relative flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-gradient-to-b from-white via-[#FBFAFF] to-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(139,92,246,0.08),transparent_55%)]" />
      </div>

      <div className={`relative z-10 flex-1 overflow-y-auto px-4 py-6 sm:px-10 transition-opacity duration-500 ${isChatStarted ? 'opacity-100' : 'opacity-0'}`}>
        <div className="mx-auto max-w-4xl space-y-6 pb-52">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`
                  max-w-[80%] rounded-2xl px-6 py-4 text-lg leading-relaxed
                  ${msg.role === 'user'
                    ? 'bg-app-gray-100 text-app-gray-900 rounded-br-sm'
                    : 'bg-white text-app-gray-900 border border-app-gray-100 shadow-sm rounded-bl-sm'}
                `}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-500">
                    <p className="font-medium mb-1">Sources:</p>
                    <div className="flex flex-wrap gap-2">
                      {msg.sources.map((source, i) => (
                        <span key={i} className="bg-gray-50 px-2 py-1 rounded border border-gray-200 text-xs">
                          {source.shortNote}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
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
                          className="h-8 px-3 text-xs"
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
          {isSubmitting && (
            <div className="flex justify-start">
              <div className="bg-white border border-app-gray-100 rounded-2xl rounded-bl-sm px-6 py-4 shadow-sm">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-app-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 bg-app-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 bg-app-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div
        className={`
          absolute z-20 w-full transition-all duration-700 ease-in-out
          ${isChatStarted
            ? 'bottom-0 top-auto translate-y-0'
            : 'top-[52%] -translate-y-1/2'}
        `}
      >
        <div className="mx-auto w-full max-w-[1320px] px-4 sm:px-8">
          <div className={`mb-8 space-y-1.5 text-center transition-opacity duration-300 ${isChatStarted ? 'hidden opacity-0' : 'opacity-100'}`}>
            <p className="text-[20px] font-medium uppercase tracking-[0.18em] text-slate-400">
              {eyebrowText.split('').map((char, index) => (
                <span
                  key={`${char}-${index}`}
                  className="inline-block opacity-0 animate-eyebrow-fade-in"
                  style={{ animationDelay: `${index * 0.035}s` }}
                >
                  {char === ' ' ? '\u00A0' : char}
                </span>
              ))}
            </p>
            <h1 className="text-[55px] font-semibold tracking-tight text-slate-800">
              What do you want to create?
            </h1>
            <p className="mt-1 text-[25px] tracking-[0.01em] text-slate-500">
              Describe your book idea, and I'll help you bring it to life.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-[1180px]">
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white/75 ring-1 ring-white/50 backdrop-blur-xl shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
              <form onSubmit={handleSubmit} className="flex flex-col">
                {selectedBook && (
                  <div className="px-8 pb-2 pt-5">
                    <div className="inline-flex items-center gap-2 rounded-lg bg-app-iris/10 px-3 py-1.5 text-sm text-app-iris">
                      <BookText className="h-3.5 w-3.5" />
                      <span className="font-medium">{selectedBook.title}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedBook(null)}
                        className="ml-1 rounded-full p-0.5 transition-colors hover:bg-app-iris/20"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <textarea
                  ref={promptInputRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isChatStarted ? "Reply to Airabook..." : "e.g. A children's book about a brave little toaster who travels to Mars..."}
                  className={`
                    w-full resize-none bg-transparent p-6 text-lg text-slate-700 placeholder:text-slate-400 focus:outline-none sm:p-8
                    ${isChatStarted
                      ? 'min-h-[72px] max-h-[130px]'
                      : 'min-h-[190px]'}
                  `}
                  disabled={isSubmitting}
                  autoFocus
                />

                <div className="flex items-center justify-between border-t border-slate-200/60 bg-white/70 px-6 py-4 sm:px-8">
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => submitPrompt("", { isSurprise: true })}
                      disabled={isSubmitting}
                      className="h-10 rounded-full px-4 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Surprise me
                    </Button>

                    <DropdownMenu open={isContextMenuOpen} onOpenChange={setIsContextMenuOpen}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isSubmitting}
                          className="h-10 rounded-full px-4 text-sm font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <BookText className="mr-2 h-4 w-4" />
                          Add Context
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto">
                        {contextItems.length === 0 ? (
                          <div className="px-2 py-3 text-center text-sm text-app-gray-500">
                            No books available
                          </div>
                        ) : (
                          contextItems.map((book) => (
                            <DropdownMenuItem
                              key={book.bookId}
                              onSelect={() => handleContextSelect(book)}
                              className="cursor-pointer"
                            >
                              <BookText className="mr-2 h-4 w-4" />
                              {book.title}
                            </DropdownMenuItem>
                          ))
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <Button
                    type="submit"
                    disabled={!prompt.trim() || isSubmitting}
                    className={`
                      h-10 rounded-full px-5 text-sm font-semibold
                      ${prompt.trim()
                        ? 'bg-violet-600 text-white hover:bg-violet-700'
                        : 'cursor-not-allowed bg-slate-200 text-slate-400'}
                    `}
                  >
                    <span className="flex items-center gap-2">
                      {isSubmitting ? 'Thinking...' : 'Send'}
                      <Send className="h-4 w-4" />
                    </span>
                  </Button>
                </div>
              </form>
            </div>
          </div>

          <div className={`mx-auto mt-7 grid w-full max-w-[1180px] grid-cols-1 gap-3 text-sm transition-opacity duration-300 md:grid-cols-3 ${isChatStarted ? 'hidden opacity-0' : 'opacity-100'}`}>
            {[
              "A mystery novel set in 1920s Paris",
              "A sci-fi guide to galaxy hitchhiking",
              "A cookbook for college students"
            ].map((suggestion, i) => (
              <button
                key={i}
                onClick={() => setPrompt(suggestion)}
                className="rounded-full border border-slate-200/60 bg-white/70 px-5 py-2.5 text-left text-[0.95rem] text-slate-600 transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 hover:shadow-sm"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        {isChatStarted && <div className="h-8 bg-transparent" />}
      </div>

      {!isChatStarted && (
        <div className="fixed bottom-8 right-8 z-40 hidden md:block">
          <div className="flex items-center gap-1 rounded-full border border-slate-200/60 bg-white/80 p-2 backdrop-blur shadow-lg transition-transform hover:scale-[1.02]">
            <button
              type="button"
              onClick={handleFloatingChat}
              className="relative flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 text-white"
              aria-label="Open chat"
            >
              <MessageCircle className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 h-5 min-w-[20px] rounded-full bg-rose-400 px-1 text-center text-[10px] font-semibold leading-5 text-white">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleFloatingMic}
              className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-slate-100 ${isMicListening ? 'bg-violet-100 text-violet-700' : 'text-slate-600'}`}
              aria-label="Open voice input"
            >
              <Mic className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
