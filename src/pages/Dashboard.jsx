import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';

const Dashboard = () => {
  const { appUser } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [isChatStarted, setIsChatStarted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = React.useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  React.useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || isSubmitting) return;

    const userMessage = { role: 'user', content: prompt };
    setMessages(prev => [...prev, userMessage]);
    setPrompt('');
    setIsChatStarted(true);
    setIsSubmitting(true);

    try {
      const queryBookFlow = httpsCallable(functions, 'queryBookFlow');

      // Prepare history for backend (including the new message)
      const history = [...messages, userMessage];

      const result = await queryBookFlow({ messages: history });

      const aiMessage = {
        role: 'model',
        content: result.data.answer,
        sources: result.data.sources
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Error submitting prompt:', error);
      setMessages(prev => [...prev, {
        role: 'model',
        content: "I'm sorry, I encountered an error. Please try again."
      }]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-white relative overflow-hidden">
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
            <div className="relative bg-white rounded-2xl shadow-2xl border border-app-gray-100 overflow-hidden">
              <form onSubmit={handleSubmit} className="flex flex-col">
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
                      className="text-app-gray-500 hover:text-app-iris hover:bg-app-iris/10 rounded-full px-3"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Surprise me
                    </Button>
                  </div>

                  <Button
                    type="submit"
                    disabled={!prompt.trim() || isSubmitting}
                    className={`
                      rounded-xl px-4 py-2 transition-all duration-200
                      ${prompt.trim()
                        ? 'bg-app-iris hover:bg-app-iris/90 text-white shadow-lg shadow-app-iris/25'
                        : 'bg-app-gray-200 text-app-gray-400 cursor-not-allowed'}
                    `}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
    </div>
  );
};

export default Dashboard;
