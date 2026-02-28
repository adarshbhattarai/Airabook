import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Mic, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import TalkSceneCanvas from '@/components/dashboard/talk3d/TalkSceneCanvas';
import useTalkDemoState from '@/components/dashboard/talk3d/useTalkDemoState';

const BASE_THEME_PALETTES = {
  light: {
    sceneBg: '#f8fafc',
    sceneFog: '#e2e8f0',
    hemiSky: '#ffffff',
    hemiGround: '#e2e8f0',
    keyLight: '#f0f9ff',
    rimLight: '#cbd5e1',
    ambientLight: '#ffffff',
    floor: '#eef2ff',
    shadow: '#1f2937',
    skin: '#d8a585',
    hair: '#171717',
    hairBand: '#4f46e5',
    shirt: '#8be5c3',
    jacket: '#f1897f',
    eye: '#0f172a',
    smile: '#ffffff',
    micBase: '#e2e8f0',
    micRing: '#4f46e5',
    micGlyph: '#f8fafc',
    micGlow: '#6366f1',
  },
  dark: {
    sceneBg: '#050505',
    sceneFog: '#030712',
    hemiSky: '#1f2937',
    hemiGround: '#020617',
    keyLight: '#0f172a',
    rimLight: '#34d399',
    ambientLight: '#86efac',
    floor: '#030712',
    shadow: '#000000',
    skin: '#ce9b7d',
    hair: '#090909',
    hairBand: '#7bf4c8',
    shirt: '#66dfad',
    jacket: '#f28d82',
    eye: '#000000',
    smile: '#effff7',
    micBase: '#0c241b',
    micRing: '#2ecb8d',
    micGlyph: '#dbffec',
    micGlow: '#2ecb8d',
  },
  matrix: {
    sceneBg: '#050b08',
    sceneFog: '#040a07',
    hemiSky: '#10281d',
    hemiGround: '#050b08',
    keyLight: '#0d2017',
    rimLight: '#6ef7c8',
    ambientLight: '#34d399',
    floor: '#06140f',
    shadow: '#000000',
    skin: '#d5a488',
    hair: '#050505',
    hairBand: '#60f6ae',
    shirt: '#72ebbc',
    jacket: '#ef8f85',
    eye: '#000000',
    smile: '#ecfff4',
    micBase: '#0f2b20',
    micRing: '#2ecb8d',
    micGlyph: '#dbffec',
    micGlow: '#6ef7c8',
  },
};

const detectThemeMode = () => {
  if (typeof document === 'undefined') return 'light';
  const root = document.documentElement;
  if (root.classList.contains('theme-matrix')) return 'matrix';
  if (root.classList.contains('theme-dark')) return 'dark';
  return 'light';
};

const computePalette = (mode) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return BASE_THEME_PALETTES[mode] || BASE_THEME_PALETTES.light;
  }

  const root = document.documentElement;
  const styles = window.getComputedStyle(root);
  const accent = styles.getPropertyValue('--app-iris').trim();
  const action = styles.getPropertyValue('--app-action').trim();
  const actionHover = styles.getPropertyValue('--app-action-hover').trim();
  const text = styles.getPropertyValue('--app-action-text').trim();
  const palette = BASE_THEME_PALETTES[mode] || BASE_THEME_PALETTES.light;

  return {
    ...palette,
    rimLight: accent || palette.rimLight,
    hairBand: accent || palette.hairBand,
    micRing: accent || palette.micRing,
    micGlow: accent || palette.micGlow,
    micBase: action || palette.micBase,
    floor: actionHover || palette.floor,
    smile: text || palette.smile,
  };
};

const DashboardTalk3DView = ({ bookId, chapterId, pageId }) => {
  const {
    status,
    statusCopy,
    toggleMic,
    isActive,
    isListening,
    isSpeaking,
    prefersReducedMotion,
    canStart,
  } = useTalkDemoState({ bookId, chapterId, pageId });

  const [themeMode, setThemeMode] = useState(() => detectThemeMode());

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const observer = new MutationObserver(() => setThemeMode(detectThemeMode()));
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const colors = useMemo(() => computePalette(themeMode), [themeMode]);

  const MicIcon = useMemo(() => {
    if (status === 'connecting') return Loader2;
    if (isSpeaking) return Volume2;
    return Mic;
  }, [status, isSpeaking]);

  return (
    <div className={cn('dashboard-talk-3d-stage h-full w-full', `dashboard-talk-3d-stage-${themeMode}`)}>
      <div className="dashboard-talk-3d-canvas">
        <TalkSceneCanvas
          status={status}
          isListening={isListening}
          isSpeaking={isSpeaking}
          onToggle={toggleMic}
          prefersReducedMotion={prefersReducedMotion}
          colors={colors}
        />
      </div>

      <div className="dashboard-talk-3d-overlay">
        <button
          type="button"
          className={cn(
            'dashboard-talk-mic-btn dashboard-talk-3d-keyboard-btn',
            isActive && 'dashboard-talk-mic-btn-active',
            isSpeaking && 'dashboard-talk-mic-btn-speaking',
            !canStart && 'opacity-60 cursor-not-allowed',
          )}
          disabled={!canStart || status === 'connecting'}
          onClick={toggleMic}
          aria-label={isActive ? 'Stop talk mode' : 'Start talk mode'}
          aria-pressed={isActive}
          title={!canStart ? 'Open a book to enable talk mode' : (isActive ? 'Stop talk mode' : 'Start talk mode')}
        >
          <MicIcon className={cn('h-6 w-6', status === 'connecting' && 'animate-spin')} />
        </button>

        <p className="dashboard-talk-status" aria-live="polite">{statusCopy.label}</p>
        <p className="dashboard-talk-status-sub">{statusCopy.helper}</p>
      </div>
    </div>
  );
};

export default DashboardTalk3DView;
