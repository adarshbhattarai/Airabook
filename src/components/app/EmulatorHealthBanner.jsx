import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CHECK_INTERVAL_MS = 15000;
const CHECK_TIMEOUT_MS = 2500;

const emulatorTargets = [
  {
    id: 'functions',
    label: 'Functions',
    port: 5001,
    url: 'http://127.0.0.1:5001/',
  },
  {
    id: 'storage',
    label: 'Storage',
    port: 9199,
    url: 'http://127.0.0.1:9199/',
  },
];

const isEmulatorModeEnabled = () => {
  if (import.meta.env.MODE === 'production') return false;
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1';
  return isLocalHost && import.meta.env.VITE_USE_EMULATOR === 'true';
};

const probeEndpoint = async (url) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    await fetch(`${url}?health=${Date.now()}`, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
};

const EmulatorHealthBanner = () => {
  const [hasChecked, setHasChecked] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [unreachableTargets, setUnreachableTargets] = useState([]);
  const enabled = useMemo(() => isEmulatorModeEnabled(), []);

  const runHealthCheck = useCallback(async () => {
    if (!enabled) return;
    setIsChecking(true);
    try {
      const results = await Promise.all(
        emulatorTargets.map(async (target) => ({
          ...target,
          reachable: await probeEndpoint(target.url),
        })),
      );
      setUnreachableTargets(results.filter((target) => !target.reachable));
      setHasChecked(true);
    } finally {
      setIsChecking(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    runHealthCheck();
    const intervalId = setInterval(runHealthCheck, CHECK_INTERVAL_MS);
    window.addEventListener('online', runHealthCheck);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('online', runHealthCheck);
    };
  }, [enabled, runHealthCheck]);

  if (!enabled || !hasChecked || unreachableTargets.length === 0) return null;

  const issueText = unreachableTargets
    .map((target) => `${target.label} (${target.port})`)
    .join(', ');

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-amber-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Emulator connection issue detected
            </p>
            <p className="text-xs text-amber-800">
              {issueText} unreachable. Images and backend actions may fail. Start emulators with `npm run emulators:only`.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
          onClick={runHealthCheck}
          disabled={isChecking}
        >
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} />
          Retry
        </Button>
      </div>
    </div>
  );
};

export default EmulatorHealthBanner;
