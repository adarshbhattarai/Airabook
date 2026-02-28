import React, { Suspense, lazy, useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Send, Sparkles, BookText, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { streamAirabookAI } from '@/lib/aiStream';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import DashboardModeSwitch from '@/components/dashboard/DashboardModeSwitch';
import DashboardTalkView from '@/components/dashboard/DashboardTalkView';
import Talk3DErrorBoundary from '@/components/dashboard/talk3d/Talk3DErrorBoundary';
import useWebGLSupport from '@/components/dashboard/talk3d/useWebGLSupport';

const DashboardTalk3DView = lazy(() => import('@/components/dashboard/talk3d/DashboardTalk3DView'));

const Dashboard = () => {
  const location = useLocation();
  const { appUser } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [isChatStarted, setIsChatStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);
  const [dashboardMode, setDashboardMode] = useState('chat');
  const [talkVisualMode] = useState('face');
  const { checked: webGLChecked, supported: webGLSupported } = useWebGLSupport();
  const messagesEndRef = React.useRef(null);
  const hasSubmittedInitialPrompt = React.useRef(false);
  const messagesRef = useRef(messages);

  // Extract books from appUser
  const books = appUser?.accessibleBookIds ? appUser.accessibleBookIds.map(item => {
    if (typeof item === 'string') {
      return { bookId: item, title: 'Untitled Book' };
    }
    return item;
  }) : [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

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

  return (
    <div className={`relative flex flex-col h-[calc(100vh-4rem)] overflow-hidden ${dashboardMode === 'talk' ? 'dashboard-talk-page' : 'bg-white'}`}>
      <div className="absolute right-4 top-4 z-30 sm:right-8">
        <DashboardModeSwitch mode={dashboardMode} onModeChange={setDashboardMode} />
      </div>

      {dashboardMode === 'talk' ? (
        webGLChecked && webGLSupported ? (
          <Talk3DErrorBoundary fallback={<DashboardTalkView initialVisualMode={talkVisualMode} />}>
            <Suspense fallback={<DashboardTalkView initialVisualMode={talkVisualMode} />}>
              <DashboardTalk3DView />
            </Suspense>
          </Talk3DErrorBoundary>
        ) : (
          <DashboardTalkView initialVisualMode={talkVisualMode} />
        )
      ) : (
        <>
          {/* Chat History Area */}
          <div className={`flex-1 overflow-y-auto p-4 sm:p-8 transition-opacity duration-500 ${isChatStarted ? 'opacity-100' : 'opacity-0'}`}>
            <div className="max-w-3xl mx-auto space-y-6 pb-48">
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

          {/* Input Area - Centered initially, then fixed at bottom */}
          <div
            className={`
              absolute w-full transition-all duration-700 ease-in-out
              ${isChatStarted
                ? 'bottom-0 top-auto translate-y-0'
                : 'top-1/2 -translate-y-1/2'}
            `}
          >
            <div className="max-w-5xl mx-auto px-4 sm:px-8 w-full">
              {/* Header - Only visible when NOT chat started */}
              <div className={`text-center space-y-2 mb-8 transition-opacity duration-300 ${isChatStarted ? 'opacity-0 hidden' : 'opacity-100'}`}>
                <h1 className="text-3xl sm:text-4xl font-semibold text-app-gray-900 tracking-tight">
                  What do you want to create?
                </h1>
                <p className="text-app-gray-500 text-lg">
                  Describe your book idea, and I'll help you bring it to life.
                </p>
              </div>

              {/* Input Box */}
              <div className="w-full relative group">
                <div className={`absolute -inset-1 bg-gradient-to-r from-app-iris via-purple-500 to-pink-500 rounded-2xl opacity-20 transition duration-500 blur-lg ${isChatStarted ? 'group-hover:opacity-20' : 'group-hover:opacity-30'}`}></div>
                <div className="relative bg-white rounded-2xl shadow-2xl border border-app-gray-100 overflow-hidden matrix-surface matrix-neon-outline">
                  <form onSubmit={handleSubmit} className="flex flex-col">
                    {/* Selected Book Badge */}
                    {selectedBook && (
                      <div className="px-6 pt-4 pb-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-app-iris/10 text-app-iris rounded-lg text-sm">
                          <BookText className="h-3.5 w-3.5" />
                          <span className="font-medium">{selectedBook.title}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedBook(null)}
                            className="ml-1 hover:bg-app-iris/20 rounded-full p-0.5 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={isChatStarted ? "Reply to Airabook..." : "e.g. A children's book about a brave little toaster who travels to Mars..."}
                      className={`
                        flex-1 w-full p-6 text-lg text-app-gray-900 placeholder:text-app-gray-400 resize-none focus:outline-none bg-transparent
                        ${isChatStarted ? 'min-h-[50px] max-h-[120px]' : 'min-h-[140px]'}
                      `}
                      disabled={isSubmitting}
                      autoFocus
                    />

                    <div className="flex items-center justify-between px-4 py-3 bg-app-gray-50/50 border-t border-app-gray-100">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => submitPrompt("", { isSurprise: true })}
                          disabled={isSubmitting}
                          className="text-app-gray-500 hover:text-app-iris hover:bg-app-iris/10 rounded-full px-3"
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          Surprise me
                        </Button>

                        {/* Add Context Dropdown */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={isSubmitting || books.length === 0}
                              className="text-app-gray-500 hover:text-app-iris hover:bg-app-iris/10 rounded-full px-3"
                            >
                              <BookText className="h-4 w-4 mr-2" />
                              Add Context
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto">
                            {books.length === 0 ? (
                              <div className="px-2 py-3 text-sm text-app-gray-500 text-center">
                                No books available
                              </div>
                            ) : (
                              books.map((book) => (
                                <DropdownMenuItem
                                  key={book.bookId}
                                  onClick={() => setSelectedBook(book)}
                                  className="cursor-pointer"
                                >
                                  <BookText className="h-4 w-4 mr-2" />
                                  {book.title}
                                </DropdownMenuItem>
                              ))
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <Button
                        type="submit"
                        variant="appPrimary"
                        disabled={!prompt.trim() || isSubmitting}
                        className={`
                          h-11 rounded-pill px-5 transition-all duration-200
                          ${prompt.trim()
                            ? ''
                            : 'bg-app-gray-200 text-app-gray-400 border-transparent shadow-none cursor-not-allowed'}
                        `}
                      >
                        {isSubmitting ? (
                          <span className="flex items-center gap-2">
                            <div className="h-4 w-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                            Thinking...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            Send
                            <Send className="h-4 w-4" />
                          </span>
                        )}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Suggestions - Only visible when NOT chat started */}
              <div className={`mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full text-sm transition-opacity duration-300 ${isChatStarted ? 'opacity-0 hidden' : 'opacity-100'}`}>
                {[
                  "A mystery novel set in 1920s Paris",
                  "A sci-fi guide to galaxy hitchhiking",
                  "A cookbook for college students"
                ].map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => setPrompt(suggestion)}
                    className="px-4 py-3 rounded-xl bg-app-gray-50 hover:bg-app-gray-100 text-app-gray-600 hover:text-app-gray-900 text-left transition-colors border border-transparent hover:border-app-gray-200 truncate"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>

            {/* Spacer for bottom area when chat is started */}
            {isChatStarted && <div className="h-8 bg-white" />}
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
