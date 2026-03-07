import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const MessageContent = ({
  content = '',
  streamingContent = '',
  isStreaming = false,
  contentClassName = '',
  streamingClassName = '',
}) => {
  const hasStreamingContent = typeof streamingContent === 'string' && streamingContent.trim().length > 0;
  const hasContent = typeof content === 'string' && content.trim().length > 0;
  const [isThinkingOpen, setIsThinkingOpen] = useState(Boolean(isStreaming && hasStreamingContent));

  useEffect(() => {
    if (isStreaming && hasStreamingContent) {
      setIsThinkingOpen(true);
    }
  }, [hasStreamingContent, isStreaming]);

  useEffect(() => {
    if (!isStreaming && hasStreamingContent) {
      setIsThinkingOpen(false);
    }
  }, [hasStreamingContent, isStreaming]);

  return (
    <div className="space-y-3">
      {hasStreamingContent ? (
        <div className="rounded-xl border border-app-iris/15 bg-white/60">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.16em] text-app-iris"
            onClick={() => setIsThinkingOpen((current) => !current)}
          >
            <span className="inline-flex items-center gap-2">
              {isStreaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              <span>Thinking</span>
            </span>
            {isThinkingOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          </button>
          {isThinkingOpen ? (
            <div className="border-t border-app-iris/10 px-3 py-3">
              <div className={cn(
                'whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs leading-5 text-app-gray-600',
                streamingClassName,
              )}
              >
                {streamingContent}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {hasContent ? (
        <div className={cn(
          'whitespace-pre-wrap break-words [overflow-wrap:anywhere]',
          contentClassName,
        )}
        >
          {content}
        </div>
      ) : null}

      {!hasContent && isStreaming && !hasStreamingContent ? (
        <div className="text-xs text-app-gray-500">Waiting for first tokens...</div>
      ) : null}
    </div>
  );
};

export default MessageContent;
