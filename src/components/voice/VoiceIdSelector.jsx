import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';

const VoiceIdSelector = ({
  voices = [],
  selectedVoiceId = '',
  onChange,
  disabled = false,
  loading = false,
  className = '',
  selectClassName = '',
  showLabel = true,
  showId = true,
}) => {
  const selectedVoice = useMemo(
    () => voices.find((voice) => voice.id === selectedVoiceId) || null,
    [selectedVoiceId, voices]
  );

  if (!loading && voices.length === 0) {
    return null;
  }

  return (
    <label className={cn('flex min-w-[180px] flex-col gap-1', className)}>
      {showLabel && (
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-app-gray-500">
          Voice
        </span>
      )}
      <select
        value={selectedVoiceId}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled || loading}
        className={cn(
          'h-9 rounded-md border border-input bg-background px-3 text-sm text-app-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
          selectClassName,
        )}
      >
        {loading && voices.length === 0 ? (
          <option value="">Loading voices...</option>
        ) : (
          voices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.name || voice.id}
            </option>
          ))
        )}
      </select>
      {showId && selectedVoice?.id && (
        <span className="truncate text-[10px] text-app-gray-500" title={selectedVoice.id}>
          {selectedVoice.id}
        </span>
      )}
    </label>
  );
};

export default VoiceIdSelector;
