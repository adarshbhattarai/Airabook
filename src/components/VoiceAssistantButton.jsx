import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Mic, MicOff, Loader2, Volume2, Brain } from 'lucide-react';
import { useVoiceAssistant } from '@/hooks/useVoiceAssistant';
import { cn } from '@/lib/utils';

const VoiceAssistantButton = ({ bookId, chapterId, pageId, className = '' }) => {
  const { toast } = useToast();
  const [debugOpen, setDebugOpen] = useState(false);
  const lastErrorToastRef = useRef('');

  const {
    status,
    canStart,
    wsConnected,
    level,
    vadSpeaking,
    lastError,
    startListening,
    stopListening,
    interrupt,
    disconnect,
    partialTranscript,
  } = useVoiceAssistant({ bookId, chapterId, pageId });

  useEffect(() => {
    if (status !== 'error') return;
    const message = lastError?.message || 'Voice error.';
    if (lastErrorToastRef.current === message) return;
    lastErrorToastRef.current = message;
    toast({ title: 'Voice error', description: message, variant: 'destructive' });
    // Return to idle state after error.
    disconnect();
  }, [disconnect, lastError?.message, status, toast]);

  const onClick = useCallback(async (e) => {
    try {
      // Shift-click toggles debug panel in dev.
      if (import.meta.env.DEV && e?.shiftKey) {
        setDebugOpen(v => !v);
        return;
      }

      if (status === 'listening' || status === 'user_speaking' || status === 'thinking') {
        stopListening();
        return;
      }
      if (status === 'assistant_speaking') {
        interrupt();
        return;
      }
      if (status === 'connecting') return;
      await startListening();
    } catch (e) {
      toast({
        title: 'Voice unavailable',
        description: e?.message || lastError?.message || 'Could not start voice.',
        variant: 'destructive',
      });
    }
  }, [disconnect, interrupt, lastError?.message, startListening, status, stopListening, toast]);

  const isConnecting = status === 'connecting';
  const isListening = status === 'listening' || status === 'user_speaking';
  const isUserSpeaking = status === 'user_speaking';
  const isThinking = status === 'thinking';
  const isAssistantSpeaking = status === 'assistant_speaking';

  const { Icon, label } = useMemo(() => {
    if (isConnecting) return { Icon: Loader2, label: 'Connecting…' };
    if (isAssistantSpeaking) return { Icon: Volume2, label: 'Interrupt' };
    if (isThinking) return { Icon: Brain, label: 'Thinking…' };
    if (isListening) return { Icon: MicOff, label: isUserSpeaking ? 'Listening (speaking)…' : 'Listening…' };
    return { Icon: Mic, label: 'Talk' };
  }, [isAssistantSpeaking, isConnecting, isListening, isThinking, isUserSpeaking]);

  const meterPct = Math.round(Math.min(1, Math.max(0, level)) * 100);

  return (
    <div className="relative">
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        disabled={!canStart || isConnecting}
        className={cn('flex items-center gap-2 h-8 text-xs', className)}
        title="Talk with Aira (voice)"
      >
        <Icon className={`h-3 w-3 ${isConnecting ? 'animate-spin' : ''}`} />
        {label}
        {(isListening || isThinking) && (
          <span className="ml-2 flex items-center gap-1">
            <span className="h-1.5 w-10 rounded bg-app-gray-100 overflow-hidden">
              <span
                className={`block h-full rounded ${vadSpeaking ? 'bg-app-iris' : 'bg-app-gray-300'}`}
                style={{ width: `${meterPct}%` }}
              />
            </span>
          </span>
        )}
      </Button>

      {import.meta.env.DEV && debugOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-lg border border-border bg-card p-2 text-[11px] shadow-lg z-50">
          <div className="flex items-center justify-between">
            <span className="font-semibold">Voice debug</span>
            <button
              type="button"
              className="text-app-gray-500 hover:text-app-gray-900"
              onClick={() => setDebugOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="mt-2 space-y-1 text-app-gray-700">
            <div><span className="font-semibold">wsConnected</span>: {String(wsConnected)}</div>
            <div><span className="font-semibold">status</span>: {status}</div>
            <div><span className="font-semibold">vadSpeaking</span>: {String(vadSpeaking)}</div>
            <div><span className="font-semibold">level</span>: {meterPct}</div>
            <div className="truncate"><span className="font-semibold">partial</span>: {partialTranscript || '-'}</div>
          </div>
          <div className="mt-2 text-[10px] text-app-gray-500">
            Shift-click Talk toggles this panel.
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceAssistantButton;

