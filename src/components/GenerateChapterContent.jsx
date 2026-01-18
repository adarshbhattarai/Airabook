import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { RefreshCw } from 'lucide-react';
import { functions } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';

const GenerateChapterContent = ({ bookId, chapterId, onSuggestionSelect }) => {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const inFlightKeyRef = useRef(null);
  const lastCompletedKeyRef = useRef('');
  const requestIdRef = useRef(0);

  const normalizedSuggestions = useMemo(() => (
    (suggestions || []).map((item) => String(item).trim()).filter(Boolean)
  ), [suggestions]);

  const fetchSuggestions = useCallback(async ({ force = false } = {}) => {
    if (!bookId || !chapterId || !user?.uid) {
      setSuggestions([]);
      return;
    }

    const requestKey = `${bookId}:${chapterId}:${user.uid}`;
    if (inFlightKeyRef.current === requestKey || (!force && lastCompletedKeyRef.current === requestKey)) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    inFlightKeyRef.current = requestKey;
    setIsLoading(true);
    setError('');
    try {
      const getChapterSuggestions = httpsCallable(functions, 'generateChapterSuggestions');
      const result = await getChapterSuggestions({ bookId, chapterId, userId: user.uid });
      if (requestIdRef.current !== requestId) return;
      const nextSuggestions = Array.isArray(result.data?.suggestions) ? result.data.suggestions : [];
      setSuggestions(nextSuggestions);
      lastCompletedKeyRef.current = requestKey;
    } catch (err) {
      console.error('Chapter suggestions fetch failed:', err);
      setError('Unable to load suggestions.');
      setSuggestions([]);
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
      if (inFlightKeyRef.current === requestKey) {
        inFlightKeyRef.current = null;
      }
    }
  }, [bookId, chapterId, user?.uid]);

  useEffect(() => {
    if (!bookId || !chapterId || !user?.uid) {
      inFlightKeyRef.current = null;
      lastCompletedKeyRef.current = '';
      setSuggestions([]);
      return;
    }
    fetchSuggestions();
  }, [bookId, chapterId, user?.uid, fetchSuggestions]);

  if (!bookId || !chapterId) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground">Chapter suggestions</p>
        <div className="flex items-center gap-2">
          {isLoading && <span className="text-xs text-muted-foreground">Loading...</span>}
          <button
            type="button"
            onClick={() => fetchSuggestions({ force: true })}
            disabled={isLoading || !user?.uid}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-app-gray-50 text-app-gray-700 transition hover:bg-app-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Refresh chapter suggestions"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      ) : normalizedSuggestions.length > 0 ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          {normalizedSuggestions.map((suggestion, index) => (
            <button
              key={`${index}-${suggestion}`}
              type="button"
              onClick={() => onSuggestionSelect?.(suggestion)}
              className="rounded-md border border-border bg-app-gray-50 px-2 py-2 text-left text-xs text-app-gray-700 transition hover:bg-app-gray-100"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : (
        !isLoading && (
          <p className="mt-2 text-xs text-muted-foreground">No suggestions yet.</p>
        )
      )}
    </div>
  );
};

export default GenerateChapterContent;
