import { useCallback, useEffect, useState } from 'react';

export const WRITING_GUIDE_TARGETS = [0, 400, 800, 1200];
const DEFAULT_TARGET = 400;
const storageKey = (bookId) => `airabook:writing-guide:${bookId}`;

const readTarget = (bookId) => {
  try {
    const saved = window.localStorage.getItem(storageKey(bookId));
    if (saved !== null && WRITING_GUIDE_TARGETS.includes(Number(saved))) return Number(saved);
  } catch (_) {
    // Writing continues when browser preferences are unavailable.
  }
  return DEFAULT_TARGET;
};

export const useWritingPreferences = (bookId) => {
  const [lengthGuideTarget, setTarget] = useState(() => readTarget(bookId));
  useEffect(() => setTarget(readTarget(bookId)), [bookId]);

  const setLengthGuideTarget = useCallback((target) => {
    const value = Number(target);
    if (!WRITING_GUIDE_TARGETS.includes(value)) return;
    setTarget(value);
    try {
      window.localStorage.setItem(storageKey(bookId), String(value));
    } catch (_) {
      // The current session can still use the preference.
    }
  }, [bookId]);

  return { lengthGuideTarget, setLengthGuideTarget };
};
