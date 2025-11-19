import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { functions } from '@/lib/firebase';
import { httpsCallable } from 'firebase/functions';

const Dashboard = () => {
  const { appUser } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setIsSubmitting(true);
    try {
      console.log('Submitting prompt:', prompt);

      const searchAgent = httpsCallable(functions, 'searchAgent');
      const result = await searchAgent({ prompt });

      console.log('Agent response:', result.data);

      // TODO: Handle the response (e.g., navigate to a new page, show a message, etc.)

      setPrompt('');
    } catch (error) {
      console.error('Error submitting prompt:', error);
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
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 max-w-4xl mx-auto w-full">

        <div className="mb-8 text-center space-y-2">
          <h1 className="text-3xl sm:text-4xl font-semibold text-app-gray-900 tracking-tight">
            What do you want to create?
          </h1>
          <p className="text-app-gray-500 text-lg">
            Describe your book idea, and I'll help you bring it to life.
          </p>
        </div>

        <div className="w-full relative group">
          <div className="absolute -inset-1 bg-gradient-to-r from-app-iris via-purple-500 to-pink-500 rounded-2xl opacity-20 group-hover:opacity-30 transition duration-500 blur-lg"></div>
          <div className="relative bg-white rounded-2xl shadow-2xl border border-app-gray-100 overflow-hidden">
            <form onSubmit={handleSubmit} className="flex flex-col min-h-[160px]">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="e.g. A children's book about a brave little toaster who travels to Mars..."
                className="flex-1 w-full p-6 text-lg text-app-gray-900 placeholder:text-app-gray-400 resize-none focus:outline-none bg-transparent"
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
                      Create
                      <Send className="h-4 w-4" />
                    </span>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full text-sm">
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
    </div>
  );
};

export default Dashboard;
