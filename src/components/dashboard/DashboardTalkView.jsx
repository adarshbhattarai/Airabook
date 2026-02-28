import React, { useMemo, useState } from 'react';
import { Loader2, Mic, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import useTalkDemoState from '@/components/dashboard/talk3d/useTalkDemoState';

const TalkCenterVisual = ({
  variant,
  isListening,
  isSpeaking,
  faceImage,
  faceName,
}) => {
  const [imageFailed, setImageFailed] = useState(false);

  if (variant === 'blank') {
    return (
      <div className="dashboard-talk-blank">
        <span>{faceName?.charAt(0)?.toUpperCase() || 'A'}</span>
      </div>
    );
  }

  if (variant === 'orb') {
    return (
      <div
        className={cn(
          'dashboard-talk-orb',
          isListening && 'dashboard-talk-orb-listening',
          isSpeaking && 'dashboard-talk-orb-speaking',
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        'dashboard-talk-face-shell',
        isListening && 'dashboard-talk-face-listening',
        isSpeaking && 'dashboard-talk-face-speaking',
      )}
    >
      {!imageFailed ? (
        <img
          src={faceImage}
          alt={`${faceName} avatar`}
          className="dashboard-talk-face"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="dashboard-talk-face-fallback">
          {faceName?.charAt(0)?.toUpperCase() || 'A'}
        </div>
      )}
    </div>
  );
};

const DashboardTalkView = ({
  initialVisualMode = 'face',
  faceImage = '/avatars/girl2.png',
  faceName = 'Aira',
  bookId,
  chapterId,
  pageId,
}) => {
  const [visualMode] = useState(initialVisualMode);
  const {
    status,
    statusCopy,
    toggleMic,
    isActive,
    isListening,
    isSpeaking,
    canStart,
  } = useTalkDemoState({ bookId, chapterId, pageId });

  const MicIcon = useMemo(() => {
    if (status === 'connecting') return Loader2;
    if (isSpeaking) return Volume2;
    return Mic;
  }, [isSpeaking, status]);

  return (
    <div className="dashboard-talk-scene h-full w-full">
      <div className="dashboard-talk-center">
        <TalkCenterVisual
          variant={visualMode}
          isListening={isListening}
          isSpeaking={isSpeaking}
          faceImage={faceImage}
          faceName={faceName}
        />

        <button
          type="button"
          className={cn(
            'dashboard-talk-mic-btn',
            isActive && 'dashboard-talk-mic-btn-active',
            isSpeaking && 'dashboard-talk-mic-btn-speaking',
            !canStart && 'opacity-60 cursor-not-allowed',
          )}
          disabled={!canStart || status === 'connecting'}
          aria-pressed={isActive}
          aria-label={isActive ? 'Stop talk mode' : 'Start talk mode'}
          title={!canStart ? statusCopy.helper : (isActive ? 'Stop talk mode' : 'Start talk mode')}
          onClick={toggleMic}
        >
          <MicIcon className={cn('h-7 w-7', status === 'connecting' && 'animate-spin')} />
        </button>

        <p className="dashboard-talk-status" aria-live="polite">
          {statusCopy.label}
        </p>
        <p className="dashboard-talk-status-sub">{statusCopy.helper}</p>
      </div>
    </div>
  );
};

export default DashboardTalkView;
