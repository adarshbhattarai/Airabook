import React, { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/context/AuthContext';
import { firestore } from '@/lib/firebase';
import { cn } from '@/lib/utils';
import { convertToEmulatorURL } from '@/lib/pageUtils';
import { applyPhotoDistribution, respondToPlannerHitl } from '@/services/photoPlannerApiService';
import { uploadPlannerMediaFiles } from '@/services/photoPlannerMediaService';
import PlannerProgressTimeline from '@/components/planner/PlannerProgressTimeline';
import {
  CheckCircle2,
  Check,
  Image as ImageIcon,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  UploadCloud,
  Video,
  X,
} from 'lucide-react';

const MAX_MEDIA_ITEMS = 20;

const eventLabelMap = {
  progress: 'Planner is working...',
  approval_required: 'Approval is required to continue.',
  final: 'Planner completed.',
  error: 'Planner failed.',
  planning_started: 'Planning distribution...',
  planning_done: 'Distribution plan ready.',
  page_creating: 'Creating pages...',
  page_created: 'Page created.',
  media_attaching: 'Attaching media to pages...',
  human_in_loop: 'Waiting for your choice...',
  interrupt: 'Waiting for your choice...',
  completed: 'Completed.',
  done: 'Completed.',
};

const HITL_DEFAULT_TIMEOUT_SECONDS = 20;
const HITL_MAX_OPTIONS = 3;
const WARNING_PREFIX_APPROVAL_REQUIRED = 'APPROVAL_REQUIRED:';
const WARNING_PREFIX_STRUCTURE_REQUIRED = 'STRUCTURE_CONFIRMATION_REQUIRED:';
const WARNING_PREFIX_CANDIDATE_PAGES = 'CANDIDATE_PAGES:';
const CREATE_ONLY_PAGE_POLICY_HINT = 'Create-only policy: always create new pages for new text/media. Do not update, overwrite, or delete existing pages.';

const keyOfMedia = (item) => item?.storagePath || item?.url;

const mergeUniqueMediaItems = (existing, incoming) => {
  const map = new Map();
  for (const item of existing || []) {
    const key = keyOfMedia(item);
    if (!key) continue;
    map.set(key, item);
  }
  for (const item of incoming || []) {
    const key = keyOfMedia(item);
    if (!key) continue;
    map.set(key, item);
  }
  return Array.from(map.values());
};

const normalizeAlbumMediaItems = (albumId, albumData = {}) => {
  const images = (albumData.images || []).map((item) => {
    const url = typeof item === 'string' ? item : item.url;
    const storagePath = typeof item === 'string' ? null : item.storagePath;
    return {
      url: convertToEmulatorURL(url),
      storagePath,
      type: 'image',
      name: typeof item === 'string' ? (url?.split('/')?.pop() || 'Image') : (item.name || item.fileName || 'Image'),
      albumId: albumId || null,
    };
  });

  const videos = (albumData.videos || []).map((item) => {
    const url = typeof item === 'string' ? item : item.url;
    const storagePath = typeof item === 'string' ? null : item.storagePath;
    return {
      url: convertToEmulatorURL(url),
      storagePath,
      type: 'video',
      name: typeof item === 'string' ? (url?.split('/')?.pop() || 'Video') : (item.name || item.fileName || 'Video'),
      albumId: albumId || null,
    };
  });

  return [...images, ...videos].filter((item) => item.url);
};

const normalizeChapterPlanKey = (chapterId, title = '') => {
  if (chapterId) return `chapter:${chapterId}`;
  const slug = String(title || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'new-chapter';
  return `new:${slug}`;
};

const safeParseJson = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const parsePlannerWarning = (warning) => {
  if (typeof warning !== 'string') {
    return { kind: 'text', raw: warning, payload: warning };
  }

  const trimmed = warning.trim();
  if (trimmed.startsWith(WARNING_PREFIX_APPROVAL_REQUIRED)) {
    const payload = safeParseJson(trimmed.slice(WARNING_PREFIX_APPROVAL_REQUIRED.length).trim(), {});
    return { kind: 'approval_required', raw: warning, payload };
  }
  if (trimmed.startsWith(WARNING_PREFIX_STRUCTURE_REQUIRED)) {
    const payload = safeParseJson(trimmed.slice(WARNING_PREFIX_STRUCTURE_REQUIRED.length).trim(), {});
    return { kind: 'structure_required', raw: warning, payload };
  }
  if (trimmed.startsWith(WARNING_PREFIX_CANDIDATE_PAGES)) {
    const payload = safeParseJson(trimmed.slice(WARNING_PREFIX_CANDIDATE_PAGES.length).trim(), []);
    return { kind: 'candidate_pages', raw: warning, payload: Array.isArray(payload) ? payload : [] };
  }

  return { kind: 'text', raw: warning, payload: trimmed };
};

const parsePlannerWarnings = (warnings = []) => {
  const list = Array.isArray(warnings) ? warnings : [];
  const parsed = list.map(parsePlannerWarning);
  return {
    approval: parsed.find((item) => item.kind === 'approval_required') || null,
    structure: parsed.find((item) => item.kind === 'structure_required') || null,
    candidates: parsed.find((item) => item.kind === 'candidate_pages') || null,
    textWarnings: parsed.filter((item) => item.kind === 'text'),
  };
};

const appendTargetHintToPayload = (payload, hint) => {
  if (!hint?.trim()) return payload;
  const combinedPrompt = [payload?.distributionPrompt || '', hint.trim()].filter(Boolean).join('\n\n').trim();
  const combinedAutoPrompt = [
    payload?.bookCreationPlan?.distributionModePrompt || '',
    hint.trim(),
  ].filter(Boolean).join('\n\n').trim();

  return {
    ...payload,
    distributionPrompt: combinedPrompt,
    ...(payload?.bookCreationPlan
      ? {
          bookCreationPlan: {
            ...payload.bookCreationPlan,
            promptSummary: combinedPrompt,
            ...(payload.bookCreationPlan.distributionMode === 'auto'
              ? { distributionModePrompt: combinedAutoPrompt }
              : {}),
          },
        }
      : {}),
  };
};

const deriveChoicesFromWarningState = (warningState) => {
  if (!warningState) return [];

  if (warningState.approval?.payload?.actionId) {
    return [
      { id: 'approve', label: 'Approve delete', value: 'approve' },
      { id: 'reject', label: 'Reject delete', value: 'reject' },
    ];
  }

  if (warningState.structure?.payload) {
    return [
      { id: 'yes', label: 'Yes', value: 'yes' },
      { id: 'no', label: 'No', value: 'no' },
    ];
  }

  if (warningState.candidates?.payload?.length) {
    return warningState.candidates.payload.map((candidate, index) => {
      const label = candidate?.title || candidate?.pageTitle || candidate?.name || `Candidate page ${index + 1}`;
      const reference = candidate?.pageId || candidate?.id || candidate?.pageRef || candidate?.reference || '';
      return {
        id: String(index + 1),
        label: reference ? `${index + 1}. ${label} (${reference})` : `${index + 1}. ${label}`,
        value: String(index + 1),
      };
    });
  }

  return [];
};

const normalizeClarificationChoices = (raw = []) => {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((choice, index) => {
    if (typeof choice === 'string') {
      return { id: String(index + 1), label: choice, value: choice };
    }
    if (choice && typeof choice === 'object') {
      const label = choice.label || choice.title || choice.name || choice.value || `Option ${index + 1}`;
      return {
        id: String(choice.id || index + 1),
        label: String(label),
        value: String(choice.value || label),
      };
    }
    return null;
  }).filter(Boolean);
};

const PhotoPlannerDialog = ({
  isOpen,
  onOpenChange,
  bookId,
  chapters = [],
  defaultChapterId,
  accessibleAlbums = [],
  isBabyJournal = false,
  source = 'book_assistant',
  seed = {},
  onApplied,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const hasInitializedForOpenRef = useRef(false);
  const hitlTimerRef = useRef(null);

  const fileInputRef = useRef(null);
  const [step, setStep] = useState('setup');
  const [mediaPickerTab, setMediaPickerTab] = useState('upload');
  const [selectedAlbumId, setSelectedAlbumId] = useState(null);
  const [albumMedia, setAlbumMedia] = useState([]);
  const [selectedLibraryAssets, setSelectedLibraryAssets] = useState([]);
  const [loadingAlbumMedia, setLoadingAlbumMedia] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [distributionModePrompt, setDistributionModePrompt] = useState('');
  const [distributionMode, setDistributionMode] = useState('auto'); // 'auto' | 'manual'
  const [chapterSelectionId, setChapterSelectionId] = useState('');
  const [newChapterSelectionTitle, setNewChapterSelectionTitle] = useState('');
  const [chapterPlans, setChapterPlans] = useState([]);
  const [activeChapterPlanKey, setActiveChapterPlanKey] = useState('');
  const [selectedMediaKeys, setSelectedMediaKeys] = useState([]);
  const [parentVoice, setParentVoice] = useState('dad'); // baby-journal only: 'dad' | 'mom'
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [isApplying, setIsApplying] = useState(false);
  const [timeline, setTimeline] = useState([]);
  const [applyResult, setApplyResult] = useState(null);
  const [applyPayloadSnapshot, setApplyPayloadSnapshot] = useState(null);
  const [plannerError, setPlannerError] = useState('');
  const [clarificationState, setClarificationState] = useState(null);
  const [clarificationChoices, setClarificationChoices] = useState([]);
  const [clarificationInput, setClarificationInput] = useState('');
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(null);
  const [agentResponses, setAgentResponses] = useState([]);
  const [hitlRequest, setHitlRequest] = useState(null);
  const [hitlCountdown, setHitlCountdown] = useState(0);
  const [hitlResponding, setHitlResponding] = useState(false);

  const mediaByKey = useMemo(() => {
    const map = new Map();
    for (const item of mediaItems) {
      const key = keyOfMedia(item);
      if (!key) continue;
      map.set(key, item);
    }
    return map;
  }, [mediaItems]);

  const activeChapterPlan = useMemo(
    () => chapterPlans.find((plan) => plan.key === activeChapterPlanKey) || null,
    [chapterPlans, activeChapterPlanKey]
  );
  const combinedDistributionPrompt = useMemo(() => {
    if (distributionMode === 'auto') {
      return distributionModePrompt.trim();
    }

    const chapterChunks = chapterPlans
      .filter((plan) => (plan.mediaKeys || []).length > 0 || plan.prompt?.trim() || plan.description?.trim())
      .map((plan, index) => {
        const lines = [`${index + 1}. ${plan.title || 'Untitled chapter'}${plan.chapterId ? '' : ' (new chapter)'}`];
        const assignedMedia = (plan.mediaKeys || [])
          .map((mediaKey) => mediaByKey.get(mediaKey))
          .filter(Boolean)
          .map((item) => item.name || 'Untitled media');
        if (assignedMedia.length > 0) {
          lines.push(`Assigned media: ${assignedMedia.join(', ')}`);
        }
        if (plan.prompt?.trim()) {
          lines.push(`Prompt: ${plan.prompt.trim()}`);
        }
        if (plan.description?.trim()) {
          lines.push(`Description: ${plan.description.trim()}`);
        }
        return lines.join('\n');
      });

    if (chapterChunks.length === 0) {
      return '';
    }

    return `Manual chapter media assignment:\n${chapterChunks.join('\n\n')}`.trim();
  }, [distributionMode, distributionModePrompt, chapterPlans, mediaByKey]);

  useEffect(() => {
    if (!isOpen) {
      hasInitializedForOpenRef.current = false;
      return;
    }
    if (hasInitializedForOpenRef.current) return;
    hasInitializedForOpenRef.current = true;

    const firstChapterId = defaultChapterId || chapters[0]?.id || '';
    const initialPrompt = seed?.initialPrompt || '';
    const firstChapter = chapters.find((chapter) => chapter.id === firstChapterId) || chapters[0];
    const initialPlan = firstChapter ? {
      key: normalizeChapterPlanKey(firstChapter.id, firstChapter.title),
      chapterId: firstChapter.id,
      title: firstChapter.title || 'Untitled chapter',
      prompt: '',
      description: '',
      mediaKeys: [],
    } : null;

    setStep('setup');
    setMediaPickerTab('upload');
    setSelectedLibraryAssets([]);
    setAlbumMedia([]);
    setLoadingAlbumMedia(false);
    setMediaItems([]);
    setDistributionModePrompt(initialPrompt);
    setDistributionMode('auto');
    setChapterSelectionId(firstChapterId || '__new__');
    setNewChapterSelectionTitle('');
    setChapterPlans(initialPlan ? [initialPlan] : []);
    setActiveChapterPlanKey(initialPlan?.key || '');
    setSelectedMediaKeys([]);
    setParentVoice(seed?.parentVoice === 'mom' ? 'mom' : 'dad');
    setUploading(false);
    setUploadProgress({});
    setIsApplying(false);
    setTimeline([]);
    setApplyResult(null);
    setApplyPayloadSnapshot(null);
    setPlannerError('');
    setClarificationState(null);
    setClarificationChoices([]);
    setClarificationInput('');
    setSelectedCandidateIndex(null);
    setAgentResponses([]);
    setHitlRequest(null);
    setHitlCountdown(0);
    setHitlResponding(false);

    setSelectedAlbumId(accessibleAlbums.length > 0 ? accessibleAlbums[0].id : null);
  }, [isOpen, source, seed, defaultChapterId, chapters, accessibleAlbums]);

  useEffect(() => {
    if (!isOpen) return;
    if (selectedAlbumId) return;
    if (accessibleAlbums.length === 0) return;
    setSelectedAlbumId(accessibleAlbums[0].id);
  }, [isOpen, selectedAlbumId, accessibleAlbums]);

  useEffect(() => () => {
    if (hitlTimerRef.current) {
      clearInterval(hitlTimerRef.current);
      hitlTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen || mediaPickerTab !== 'library' || !selectedAlbumId) return;

    let mounted = true;
    const fetchMedia = async () => {
      try {
        setLoadingAlbumMedia(true);
        const albumRef = doc(firestore, 'albums', selectedAlbumId);
        const albumSnap = await getDoc(albumRef);

        if (!albumSnap.exists()) {
          if (!mounted) return;
          setAlbumMedia([]);
          return;
        }

        const data = albumSnap.data() || {};
        const items = normalizeAlbumMediaItems(selectedAlbumId, data);
        if (mounted) {
          setAlbumMedia(items);
        }
      } catch (error) {
        console.error('Failed to load album media for planner', error);
        if (mounted) {
          setAlbumMedia([]);
        }
      } finally {
        if (mounted) {
          setLoadingAlbumMedia(false);
        }
      }
    };

    fetchMedia();
    return () => {
      mounted = false;
    };
  }, [isOpen, mediaPickerTab, selectedAlbumId]);

  const handleAddChapterPlan = () => {
    const isNewChapter = chapterSelectionId === '__new__';
    const selectedChapter = chapters.find((chapter) => chapter.id === chapterSelectionId);
    const selectedTitle = isNewChapter
      ? newChapterSelectionTitle.trim()
      : (selectedChapter?.title || 'Untitled chapter');

    if (!selectedTitle) {
      toast({
        title: 'Chapter name required',
        description: 'Provide a chapter name before adding this section prompt.',
        variant: 'destructive',
      });
      return;
    }

    const chapterId = isNewChapter ? null : selectedChapter?.id || null;
    const key = normalizeChapterPlanKey(chapterId, selectedTitle);

    setChapterPlans((prev) => {
      const existing = prev.find((plan) => plan.key === key);
      if (existing) {
        setActiveChapterPlanKey(existing.key);
        return prev;
      }
      const next = [
        ...prev,
        {
          key,
          chapterId,
          title: selectedTitle,
          prompt: '',
          description: '',
          mediaKeys: [],
        },
      ];
      setActiveChapterPlanKey(key);
      return next;
    });

    if (isNewChapter) {
      setNewChapterSelectionTitle('');
    }
  };

  const handleRemoveChapterPlan = (planKey) => {
    setChapterPlans((prev) => {
      const next = prev.filter((plan) => plan.key !== planKey);
      if (activeChapterPlanKey === planKey) {
        setActiveChapterPlanKey(next[0]?.key || '');
      }
      return next;
    });
  };

  const updateActiveChapterPlan = (patch) => {
    if (!activeChapterPlanKey) return;
    setChapterPlans((prev) => prev.map((plan) => (
      plan.key === activeChapterPlanKey
        ? { ...plan, ...patch }
        : plan
    )));
  };

  const toggleMediaSelection = (item) => {
    const mediaKey = keyOfMedia(item);
    if (!mediaKey) return;
    setSelectedMediaKeys((prev) => (
      prev.includes(mediaKey)
        ? prev.filter((key) => key !== mediaKey)
        : [...prev, mediaKey]
    ));
  };

  const assignSelectedMediaToActiveChapter = () => {
    if (!activeChapterPlanKey || selectedMediaKeys.length === 0) return;
    setChapterPlans((prev) => prev.map((plan) => {
      if (plan.key !== activeChapterPlanKey) return plan;
      const merged = Array.from(new Set([...(plan.mediaKeys || []), ...selectedMediaKeys]));
      return { ...plan, mediaKeys: merged };
    }));
    setSelectedMediaKeys([]);
  };

  const removeAssignedMediaFromActiveChapter = (mediaKey) => {
    if (!activeChapterPlanKey || !mediaKey) return;
    setChapterPlans((prev) => prev.map((plan) => {
      if (plan.key !== activeChapterPlanKey) return plan;
      return {
        ...plan,
        mediaKeys: (plan.mediaKeys || []).filter((key) => key !== mediaKey),
      };
    }));
  };

  const addTimelineEvent = (type, message, status = 'in_progress') => {
    setTimeline((prev) => ([
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type,
        message: message || eventLabelMap[type] || 'Processing...',
        status,
        at: new Date().toISOString(),
      },
    ]));
  };

  const addAgentResponse = ({ type = 'progress', node = '', status = '', summary = '', warnings = [], choices = [] }) => {
    const label = summary || eventLabelMap[type] || 'Planner update';
    setAgentResponses((prev) => ([
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type,
        node: node || '',
        status: status || '',
        summary: label,
        warnings: Array.isArray(warnings) ? warnings : [],
        choices: Array.isArray(choices) ? choices : [],
        at: new Date().toISOString(),
      },
    ]));
  };

  const finalizeTimeline = ({ ensureCompletedEvent = false } = {}) => {
    setTimeline((prev) => {
      const next = prev.map((event) => (
        event.status === 'in_progress'
          ? { ...event, status: 'done' }
          : event
      ));

      if (ensureCompletedEvent && !next.some((event) => event.type === 'completed' || event.type === 'done')) {
        next.push({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          type: 'completed',
          message: eventLabelMap.completed,
          status: 'done',
          at: new Date().toISOString(),
        });
      }

      return next;
    });
  };

  const normalizeHitlOptions = (rawOptions = []) => rawOptions
    .map((option, index) => {
      if (!option) return null;
      if (typeof option === 'string') {
        return {
          id: String(index + 1),
          label: option,
          value: option,
          recommended: index === 0,
        };
      }
      const label = option.label || option.title || option.name || option.value || `Option ${index + 1}`;
      return {
        id: option.id || String(index + 1),
        label: String(label),
        value: option.value || label,
        recommended: Boolean(option.recommended) || index === 0,
        reason: option.reason || '',
      };
    })
    .filter(Boolean)
    .slice(0, HITL_MAX_OPTIONS);

  const clearHitlTimer = () => {
    if (hitlTimerRef.current) {
      clearInterval(hitlTimerRef.current);
      hitlTimerRef.current = null;
    }
  };

  const buildHitlRequest = (data = {}) => {
    const options = normalizeHitlOptions(data.options || data.choices || data.items || []);
    if (options.length === 0) return null;
    const requestedRecommendedIndex = Number.isInteger(data.recommendedIndex) ? data.recommendedIndex : 0;
    const recommendedIndex = requestedRecommendedIndex >= 0 && requestedRecommendedIndex < options.length
      ? requestedRecommendedIndex
      : 0;

    return {
      id: data.interactionId || data.requestId || `${Date.now()}`,
      runId: data.runId || data.sessionId || null,
      question: data.question || data.prompt || 'Choose how to continue:',
      subtitle: data.subtitle || '',
      options,
      recommendedIndex,
      responsePath: data.responsePath || data.responseEndpoint || data.callbackPath || '',
      context: data.context || {},
      timeoutSec: Number.isFinite(Number(data.timeoutSec))
        ? Math.max(1, Math.floor(Number(data.timeoutSec)))
        : HITL_DEFAULT_TIMEOUT_SECONDS,
    };
  };

  const handlePlannerEvent = (eventType, data = {}) => {
    const lowered = String(eventType || '').toLowerCase();
    const responseSnapshot = data?.response && typeof data.response === 'object' ? data.response : null;
    const mergedWarnings = [
      ...(Array.isArray(data?.warnings) ? data.warnings : []),
      ...(Array.isArray(responseSnapshot?.warnings) ? responseSnapshot.warnings : []),
    ];

    if (lowered === 'error') {
      setHitlRequest(null);
      setHitlCountdown(0);
      addTimelineEvent('error', data?.message || 'Apply failed.', 'error');
      addAgentResponse({
        type: 'error',
        node: data?.node,
        status: data?.status,
        summary: data?.summary || data?.message || 'Planner stream failed.',
        warnings: mergedWarnings,
      });
      return;
    }

    if (lowered === 'progress') {
      addTimelineEvent('progress', data?.summary || data?.message || eventLabelMap.progress, 'in_progress');
      addAgentResponse({
        type: 'progress',
        node: data?.node,
        status: data?.status,
        summary: data?.summary || data?.message || eventLabelMap.progress,
        warnings: mergedWarnings,
      });
      return;
    }

    if (lowered === 'approval_required') {
      const warningState = parsePlannerWarnings(mergedWarnings);
      const eventChoices = normalizeClarificationChoices(
        data?.choices || data?.options || data?.items || responseSnapshot?.choices || []
      );
      const choices = eventChoices.length > 0 ? eventChoices : deriveChoicesFromWarningState(warningState);
      setClarificationState(warningState);
      setClarificationChoices(choices);
      setClarificationInput('');
      addTimelineEvent('approval_required', data?.summary || eventLabelMap.approval_required, 'in_progress');
      addAgentResponse({
        type: 'approval_required',
        node: data?.node,
        status: data?.status || responseSnapshot?.status,
        summary: data?.summary || responseSnapshot?.summary || eventLabelMap.approval_required,
        warnings: mergedWarnings,
        choices,
      });
      return;
    }

    if (lowered === 'final') {
      addTimelineEvent('final', data?.summary || responseSnapshot?.summary || eventLabelMap.final, 'done');
      addAgentResponse({
        type: 'final',
        node: data?.node,
        status: data?.status || responseSnapshot?.status,
        summary: data?.summary || responseSnapshot?.summary || eventLabelMap.final,
        warnings: mergedWarnings,
      });
      return;
    }

    if (lowered === 'human_in_loop' || lowered === 'interrupt' || lowered === 'hitl_request') {
      const nextHitlRequest = buildHitlRequest(data);
      if (!nextHitlRequest) {
        addTimelineEvent('human_in_loop', data?.message || eventLabelMap.human_in_loop, 'in_progress');
        return;
      }
      clearHitlTimer();
      setHitlRequest(nextHitlRequest);
      setHitlCountdown(nextHitlRequest.timeoutSec);
      addTimelineEvent('human_in_loop', data?.message || eventLabelMap.human_in_loop, 'in_progress');
      addAgentResponse({
        type: 'human_in_loop',
        node: data?.node,
        status: data?.status,
        summary: data?.message || eventLabelMap.human_in_loop,
        warnings: mergedWarnings,
      });
      return;
    }

    const isTerminal = lowered === 'planning_done' || lowered === 'page_created' || lowered === 'completed' || lowered === 'done';
    if (isTerminal) {
      setHitlRequest(null);
      setHitlCountdown(0);
      finalizeTimeline();
    }

    addTimelineEvent(lowered, data?.message || eventLabelMap[lowered] || lowered, isTerminal ? 'done' : 'in_progress');
    addAgentResponse({
      type: lowered,
      node: data?.node,
      status: data?.status,
      summary: data?.summary || data?.message || eventLabelMap[lowered] || lowered,
      warnings: mergedWarnings,
    });
  };

  const submitHitlSelection = async (selectedIndex, sourceType = 'manual') => {
    if (!hitlRequest || hitlResponding) return;
    const option = hitlRequest.options[selectedIndex];
    if (!option) return;

    setHitlResponding(true);
    clearHitlTimer();

    try {
      const responsePayload = {
        action: 'human_in_loop_response',
        interactionId: hitlRequest.id,
        runId: hitlRequest.runId,
        source: 'media_planner',
        selectedIndex,
        selectedOption: {
          id: option.id,
          label: option.label,
          value: option.value,
        },
        timedOut: sourceType === 'timeout',
        context: hitlRequest.context,
        bookId,
      };

      await respondToPlannerHitl(responsePayload, { responsePath: hitlRequest.responsePath }, handlePlannerEvent);
      setHitlRequest(null);
      setHitlCountdown(0);

      addTimelineEvent(
        'human_in_loop',
        sourceType === 'timeout'
          ? `No response in time. Applied recommended option: ${option.label}.`
          : `Applied option: ${option.label}.`,
        'done'
      );
    } catch (error) {
      const message = error?.message || 'Failed to submit your choice.';
      setPlannerError(message);
      addTimelineEvent('error', message, 'error');
      toast({ title: 'Choice submission failed', description: message, variant: 'destructive' });
    } finally {
      setHitlResponding(false);
    }
  };

  useEffect(() => {
    clearHitlTimer();
    if (!hitlRequest || hitlResponding || !isApplying) return;

    hitlTimerRef.current = setInterval(() => {
      setHitlCountdown((prev) => {
        const next = Math.max(prev - 1, 0);
        if (next === 0) {
          clearHitlTimer();
          const fallbackIndex = Number.isInteger(hitlRequest.recommendedIndex) ? hitlRequest.recommendedIndex : 0;
          submitHitlSelection(fallbackIndex, 'timeout');
        }
        return next;
      });
    }, 1000);

    return () => {
      clearHitlTimer();
    };
  }, [hitlRequest, hitlResponding, isApplying]);

  const ensureValidation = () => {
    if (!bookId) return 'Book context is missing.';
    if (!user) return 'You must be signed in to use media planner.';
    return null;
  };

  const buildPayload = () => {
    const babyJournalContext = isBabyJournal
      ? {
          parentVoice: parentVoice === 'mom' ? 'mom' : 'dad',
          targetContentField: parentVoice === 'mom' ? 'momNotes' : 'dadNotes',
        }
      : null;

    const mediaPayload = mediaItems.map((item) => ({
      url: item.url,
      storagePath: item.storagePath,
      name: item.name,
      type: item.type === 'video' ? 'video' : 'image',
      ...(item.albumId ? { albumId: item.albumId } : {}),
      ...(typeof item.durationSec === 'number' ? { durationSec: item.durationSec } : {}),
    }));

    const chapterPlanPayload = chapterPlans.map((plan) => {
      const assignedMedia = (plan.mediaKeys || [])
        .map((mediaKey) => mediaByKey.get(mediaKey))
        .filter(Boolean)
        .map((item) => ({
          url: item.url,
          storagePath: item.storagePath,
          name: item.name,
          type: item.type === 'video' ? 'video' : 'image',
          ...(item.albumId ? { albumId: item.albumId } : {}),
          ...(typeof item.durationSec === 'number' ? { durationSec: item.durationSec } : {}),
        }));

      return {
        key: plan.key,
        chapterId: plan.chapterId || null,
        chapterTitle: plan.title || null,
        isNewChapter: !plan.chapterId,
        prompt: plan.prompt?.trim() || '',
        description: plan.description?.trim() || '',
        assignedMediaKeys: plan.mediaKeys || [],
        assignedMedia,
      };
    });

    const plansWithContent = chapterPlans.filter((plan) => (
      (plan.mediaKeys || []).length > 0 || plan.prompt?.trim() || plan.description?.trim()
    ));
    const singleChapterTarget = distributionMode === 'manual' && plansWithContent.length === 1 && plansWithContent[0]?.chapterId;
    const target = singleChapterTarget
      ? { scope: 'chapter', chapterId: plansWithContent[0].chapterId }
      : { scope: 'book' };
    const enforcedDistributionPrompt = [combinedDistributionPrompt, CREATE_ONLY_PAGE_POLICY_HINT]
      .filter(Boolean)
      .join('\n\n')
      .trim();
    const enforcedAutoPrompt = distributionMode === 'auto'
      ? [distributionModePrompt.trim(), CREATE_ONLY_PAGE_POLICY_HINT].filter(Boolean).join('\n\n').trim()
      : '';
    return {
      bookId,
      target,
      distributionPrompt: enforcedDistributionPrompt,
      pageImpact: 'append',
      media: mediaPayload,
      source,
      ...(babyJournalContext ? { babyJournalContext } : {}),
      bookCreationPlan: {
        planType: 'BookCreationPlan',
        distributionMode,
        autoDistribute: distributionMode === 'auto',
        source,
        distributionModePrompt: enforcedAutoPrompt,
        promptSummary: enforcedDistributionPrompt,
        chapterPlans: chapterPlanPayload,
        media: mediaPayload,
        pageImpact: 'append',
        ...(babyJournalContext ? { babyJournalContext } : {}),
      },
    };
  };

  const resolveCandidateLabel = (candidate, index) => {
    if (!candidate || typeof candidate !== 'object') return `Candidate page ${index + 1}`;
    return candidate.title || candidate.pageTitle || candidate.name || `Candidate page ${index + 1}`;
  };

  const resolveCandidateReference = (candidate) => {
    if (!candidate || typeof candidate !== 'object') return '';
    return candidate.pageId || candidate.id || candidate.pageRef || candidate.reference || '';
  };

  const handlePlannerResponse = async (result, payload) => {
    const normalizedResult = result || { ok: true };
    setApplyResult(normalizedResult);

    const warningState = parsePlannerWarnings(normalizedResult?.warnings);
    const needsClarification = String(normalizedResult?.status || '').toLowerCase() === 'needs_clarification'
      || Boolean(warningState.approval)
      || Boolean(warningState.structure)
      || Boolean(warningState.candidates);

    if (needsClarification) {
      setClarificationState(warningState);
      setClarificationChoices(deriveChoicesFromWarningState(warningState));
      setClarificationInput('');
      setSelectedCandidateIndex(null);
      addTimelineEvent(
        'human_in_loop',
        normalizedResult?.summary || 'Planner needs clarification before applying changes.',
        'in_progress'
      );
      toast({
        title: 'Planner needs input',
        description: normalizedResult?.summary || 'Choose how to continue.',
      });
      return;
    }

    setClarificationState(null);
    setClarificationChoices([]);
    setClarificationInput('');
    finalizeTimeline({ ensureCompletedEvent: true });
    await onApplied?.({
      result: normalizedResult,
      resolvedTarget: payload?.target,
    });

    toast({
      title: 'Planner applied',
      description: normalizedResult?.summary || 'Media distribution has been applied to your book.',
    });
  };

  const submitClarification = async (payload, inFlightMessage = 'Submitting clarification response...') => {
    setPlannerError('');
    setIsApplying(true);
    addTimelineEvent('human_in_loop', inFlightMessage, 'in_progress');

    try {
      setApplyPayloadSnapshot(payload);
      const result = await applyPhotoDistribution(payload, handlePlannerEvent);
      await handlePlannerResponse(result, payload);
    } catch (error) {
      const message = error?.message || 'Failed to submit clarification response.';
      setPlannerError(message);
      addTimelineEvent('error', message, 'error');
      toast({ title: 'Clarification failed', description: message, variant: 'destructive' });
    } finally {
      clearHitlTimer();
      setIsApplying(false);
    }
  };

  const handleUploadFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (files.length === 0 || !user) return;

    const remaining = Math.max(0, MAX_MEDIA_ITEMS - mediaItems.length);
    if (remaining === 0) {
      toast({
        title: 'Limit reached',
        description: `You can select up to ${MAX_MEDIA_ITEMS} media items per run.`,
        variant: 'destructive',
      });
      return;
    }

    const nextFiles = files.slice(0, remaining);
    if (nextFiles.length < files.length) {
      toast({
        title: 'Some files skipped',
        description: `Only ${remaining} more media item(s) can be added.`,
      });
    }

    setUploading(true);
    setPlannerError('');

    const result = await uploadPlannerMediaFiles({
      user,
      bookId,
      files: nextFiles,
      onFileProgress: (fileName, progress) => {
        setUploadProgress((prev) => ({ ...prev, [fileName]: progress }));
      },
    });

    setUploading(false);
    setUploadProgress({});

    if (result.uploaded.length > 0) {
      setMediaItems((prev) => mergeUniqueMediaItems(prev, result.uploaded).slice(0, MAX_MEDIA_ITEMS));
      toast({
        title: 'Media uploaded',
        description: `${result.uploaded.length} media item(s) uploaded and added to planner.`,
      });
    }

    if (result.errors.length > 0) {
      toast({
        title: 'Some uploads failed',
        description: result.errors.map((entry) => entry.fileName).join(', '),
        variant: 'destructive',
      });
    }
  };

  const toggleLibraryAsset = (asset) => {
    const assetKey = keyOfMedia(asset);
    if (!assetKey) return;

    setSelectedLibraryAssets((prev) => {
      const exists = prev.some((item) => keyOfMedia(item) === assetKey);
      if (exists) {
        return prev.filter((item) => keyOfMedia(item) !== assetKey);
      }
      return [...prev, asset];
    });
  };

  const handleAddSelectedAssets = () => {
    if (selectedLibraryAssets.length === 0) return;

    const remaining = Math.max(0, MAX_MEDIA_ITEMS - mediaItems.length);
    if (remaining === 0) {
      toast({
        title: 'Limit reached',
        description: `You can select up to ${MAX_MEDIA_ITEMS} media items per run.`,
        variant: 'destructive',
      });
      return;
    }

    const clipped = selectedLibraryAssets.slice(0, remaining);
    const next = mergeUniqueMediaItems(mediaItems, clipped).slice(0, MAX_MEDIA_ITEMS);
    setMediaItems(next);
    setSelectedLibraryAssets([]);

    toast({
      title: 'Media added',
      description: `${clipped.length} media item(s) added from asset registry.`,
    });
  };

  const handleApply = async () => {
    const validationError = ensureValidation();
    if (validationError) {
      toast({ title: 'Cannot apply', description: validationError, variant: 'destructive' });
      return;
    }

    setStep('apply');
    setPlannerError('');
    setIsApplying(true);
    setTimeline([]);
    setApplyResult(null);
    setApplyPayloadSnapshot(null);
    setClarificationState(null);
    setClarificationChoices([]);
    setClarificationInput('');
    setSelectedCandidateIndex(null);
    setAgentResponses([]);
    setHitlRequest(null);
    setHitlCountdown(0);
    setHitlResponding(false);

    addTimelineEvent('planning_started', eventLabelMap.planning_started, 'in_progress');

    try {
      const payload = buildPayload();
      setApplyPayloadSnapshot(payload);

      const result = await applyPhotoDistribution(payload, handlePlannerEvent);
      await handlePlannerResponse(result, payload);
    } catch (error) {
      console.error('Planner apply failed:', error);
      const unavailable = error?.status === 404 || error?.status === 501;
      const message = unavailable
        ? 'Apply endpoint is not available yet. Your media selection has been preserved.'
        : (error?.message || 'Failed to apply planner.');
      setPlannerError(message);
      setClarificationState(null);
      setClarificationChoices([]);
      addTimelineEvent('error', message, 'error');
      toast({ title: 'Apply failed', description: message, variant: 'destructive' });
    } finally {
      clearHitlTimer();
      setIsApplying(false);
    }
  };

  const handleApprovalDecision = async (decision) => {
    const actionId = clarificationState?.approval?.payload?.actionId;
    if (!actionId) {
      toast({
        title: 'Missing action id',
        description: 'Planner response did not include a delete action identifier.',
        variant: 'destructive',
      });
      return;
    }

    const payload = {
      ...(applyPayloadSnapshot || buildPayload()),
      approval: {
        actionId,
        decision,
      },
    };
    await submitClarification(payload, `Submitting delete ${decision}...`);
  };

  const handleStructureDecision = async (decision) => {
    const confirmationId = clarificationState?.structure?.payload?.confirmationId;
    const payload = {
      ...(applyPayloadSnapshot || buildPayload()),
      structureConfirmation: {
        ...(confirmationId ? { confirmationId } : {}),
        decision,
      },
    };

    await submitClarification(payload, `Submitting structure decision: ${decision}...`);
  };

  const handleCandidateSelectionApply = async () => {
    if (!clarificationState?.candidates || selectedCandidateIndex === null) {
      toast({
        title: 'Choose a page target',
        description: 'Select one candidate page before continuing.',
        variant: 'destructive',
      });
      return;
    }

    const candidates = clarificationState?.candidates?.payload || [];
    const selectedCandidate = candidates[selectedCandidateIndex];
    const candidateLabel = resolveCandidateLabel(selectedCandidate, selectedCandidateIndex);
    const candidateReference = resolveCandidateReference(selectedCandidate);
    const hint = candidateReference
      ? `Use candidate page index ${selectedCandidateIndex + 1} (${candidateLabel}, reference: ${candidateReference}) as context only. Keep create-only behavior and do not update/delete existing pages.`
      : `Use candidate page index ${selectedCandidateIndex + 1} (${candidateLabel}) as context only. Keep create-only behavior and do not update/delete existing pages.`;

    const payload = appendTargetHintToPayload((applyPayloadSnapshot || buildPayload()), hint);
    setApplyPayloadSnapshot(payload);
    await submitClarification(payload, `Submitting selected page target: ${candidateLabel}...`);
  };

  const submitFreeformClarification = async (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      toast({
        title: 'Clarification required',
        description: 'Enter clarification details before submitting.',
        variant: 'destructive',
      });
      return;
    }

    const hint = `User clarification: ${trimmed}`;
    const payload = appendTargetHintToPayload((applyPayloadSnapshot || buildPayload()), hint);
    setApplyPayloadSnapshot(payload);
    await submitClarification(payload, 'Submitting clarification details...');
  };

  const handleClarificationChoice = async (choice) => {
    const choiceValue = choice?.value || choice?.label || '';
    if (!choiceValue) return;
    await submitFreeformClarification(choiceValue);
  };

  const removeMediaItem = (item) => {
    const removeKey = keyOfMedia(item);
    setMediaItems((prev) => prev.filter((entry) => keyOfMedia(entry) !== removeKey));
    setSelectedMediaKeys((prev) => prev.filter((key) => key !== removeKey));
    setChapterPlans((prev) => prev.map((plan) => ({
      ...plan,
      mediaKeys: (plan.mediaKeys || []).filter((key) => key !== removeKey),
    })));
  };

  const renderMediaTile = (item, index) => (
    <div
      key={keyOfMedia(item) || `${item.name || 'item'}-${index}`}
      className={cn(
        'group/media-card relative overflow-hidden rounded-xl border border-app-gray-200 bg-white',
        distributionMode === 'manual' && selectedMediaKeys.includes(keyOfMedia(item)) ? 'ring-2 ring-app-iris border-app-iris' : '',
        distributionMode === 'manual' ? 'cursor-pointer' : ''
      )}
      onClick={() => {
        if (distributionMode !== 'manual') return;
        toggleMediaSelection(item);
      }}
    >
      {distributionMode === 'manual' && (
        <span className={cn(
          'absolute left-2 top-2 z-10 h-5 w-5 rounded-full border flex items-center justify-center text-[10px]',
          selectedMediaKeys.includes(keyOfMedia(item))
            ? 'bg-app-iris text-white border-app-iris'
            : 'bg-white/95 text-app-gray-500 border-app-gray-300'
        )}>
          {selectedMediaKeys.includes(keyOfMedia(item)) ? <Check className="h-3 w-3" /> : null}
        </span>
      )}
      <div className="aspect-[4/3]">
        {item.type === 'video' ? (
          <div className="relative h-full w-full">
            <video
              src={item.url}
              className="h-full w-full object-cover"
              muted
              playsInline
              preload="metadata"
            />
            <span className="absolute bottom-2 right-2 rounded-full bg-black/65 p-1.5 text-white">
              <Video className="h-3.5 w-3.5" />
            </span>
          </div>
        ) : (
          <img src={item.url} alt={item.name || 'Media'} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="px-2 py-1.5 text-xs text-app-gray-600 truncate">{item.name || 'Untitled media'}</div>
      <Button
        type="button"
        variant="destructive"
        size="icon"
        className="absolute right-2 top-2 h-7 w-7 opacity-0 transition-opacity group-hover/media-card:opacity-100 focus-visible:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          removeMediaItem(item);
        }}
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );

  const submitActionLabel = 'Apply';
  const plannerSummaryMessage = applyResult?.summary || '';
  const plannerStatus = String(applyResult?.status || '').trim();
  const candidatePages = clarificationState?.candidates?.payload || [];
  const hasSpecificClarificationUi = Boolean(
    clarificationState?.approval || clarificationState?.structure || clarificationState?.candidates
  );
  const hasGenericClarificationUi = Boolean(clarificationState) && (!hasSpecificClarificationUi || clarificationChoices.length > 0);
  const hasCompletedApply = Boolean(applyResult) && !isApplying && !clarificationState;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-[1450px] h-[92vh] max-h-[92vh] bg-white rounded-2xl border border-app-gray-100 shadow-2xl p-6 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-app-iris" />
            Media Planner
          </DialogTitle>
          <DialogDescription>
            Upload/select media, describe distribution, then apply.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
            <div className="grid gap-4 xl:grid-cols-[1.35fr_minmax(380px,1fr)]">
              <div className="rounded-xl border border-app-gray-100 p-4 space-y-4 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-app-gray-800">Media</h4>
                    <p className="text-xs text-app-gray-600">Add up to {MAX_MEDIA_ITEMS} images/videos.</p>
                  </div>
                  <span className="text-xs font-medium text-app-gray-600">{mediaItems.length}/{MAX_MEDIA_ITEMS}</span>
                </div>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={mediaPickerTab === 'upload' ? 'appPrimary' : 'outline'}
                    className="flex-1"
                    onClick={() => setMediaPickerTab('upload')}
                  >
                    Upload media
                  </Button>
                  <Button
                    type="button"
                    variant={mediaPickerTab === 'library' ? 'appPrimary' : 'outline'}
                    className="flex-1"
                    onClick={() => setMediaPickerTab('library')}
                  >
                    Asset registry
                  </Button>
                </div>

                {mediaPickerTab === 'upload' ? (
                  <div
                    className="rounded-xl border-2 border-dashed border-app-gray-200 bg-app-gray-50 p-5 text-center"
                    onClick={() => !uploading && fileInputRef.current?.click()}
                  >
                    <UploadCloud className="h-10 w-10 mx-auto text-app-iris mb-2" />
                    <p className="text-sm font-semibold text-app-gray-800">Upload media</p>
                    <p className="text-xs text-app-gray-600 mt-1">Images and videos are supported.</p>
                    <Button
                      type="button"
                      variant="appPrimary"
                      className="mt-3"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!uploading) {
                          fileInputRef.current?.click();
                        }
                      }}
                      disabled={uploading}
                    >
                      {uploading ? 'Uploading...' : 'Choose files'}
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      multiple
                      className="hidden"
                      onChange={handleUploadFiles}
                    />
                  </div>
                ) : (
                  <div className="grid gap-3 xl:grid-cols-[240px_minmax(0,1fr)]">
                    <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
                      {accessibleAlbums.length === 0 ? (
                        <div className="rounded-md border border-app-gray-200 p-3 text-xs text-app-gray-600">
                          No albums available.
                        </div>
                      ) : (
                        accessibleAlbums.map((album) => (
                          <button
                            key={album.id}
                            type="button"
                            className={cn(
                              'w-full text-left rounded-md border px-3 py-2 transition-colors',
                              selectedAlbumId === album.id
                                ? 'border-app-iris bg-app-iris/10 text-app-iris'
                                : 'border-app-gray-200 hover:border-app-iris/60'
                            )}
                            onClick={() => setSelectedAlbumId(album.id)}
                          >
                            <div className="text-sm font-semibold">{album.name || 'Untitled album'}</div>
                            <div className="text-xs text-app-gray-500">{album.mediaCount || 0} assets</div>
                          </button>
                        ))
                      )}
                    </div>

                    <div className="rounded-lg border border-app-gray-200 p-3 min-h-[220px] max-h-[360px] overflow-y-auto">
                      {loadingAlbumMedia ? (
                        <div className="text-sm text-app-gray-600">Loading assets...</div>
                      ) : albumMedia.length === 0 ? (
                        <div className="text-sm text-app-gray-600">No assets in this album.</div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {albumMedia.map((asset) => {
                            const selected = selectedLibraryAssets.some((item) => keyOfMedia(item) === keyOfMedia(asset));
                            return (
                              <button
                                key={keyOfMedia(asset)}
                                type="button"
                                className={cn(
                                  'relative overflow-hidden rounded-lg border-2 text-left',
                                  selected ? 'border-app-iris' : 'border-app-gray-200 hover:border-app-iris/60'
                                )}
                                onClick={() => toggleLibraryAsset(asset)}
                              >
                                {asset.type === 'video' ? (
                                  <div className="relative">
                                    <video src={asset.url} className="h-24 w-full object-cover" muted playsInline preload="metadata" />
                                    <span className="absolute bottom-1 right-1 rounded-full bg-black/65 p-1 text-white">
                                      <Video className="h-3 w-3" />
                                    </span>
                                  </div>
                                ) : (
                                  <img src={asset.url} alt={asset.name} className="h-24 w-full object-cover" />
                                )}
                                <div className="px-1.5 py-1 text-[11px] text-app-gray-700 truncate">{asset.name}</div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {Object.keys(uploadProgress).length > 0 && (
                  <div className="rounded-md border border-app-gray-200 p-2 bg-white space-y-1">
                    {Object.entries(uploadProgress).map(([name, progress]) => (
                      <div key={name} className="text-xs text-app-gray-600 flex items-center justify-between gap-2">
                        <span className="truncate">{name}</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                    ))}
                  </div>
                )}

                {mediaPickerTab === 'library' && selectedLibraryAssets.length > 0 && (
                  <div className="flex justify-end">
                    <Button type="button" variant="appPrimary" size="sm" onClick={handleAddSelectedAssets}>
                      Add selected ({selectedLibraryAssets.length})
                    </Button>
                  </div>
                )}

                {mediaItems.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {mediaItems.map((item, index) => renderMediaTile(item, index))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-app-gray-200 p-6 text-center bg-app-gray-50">
                    <ImageIcon className="h-8 w-8 mx-auto text-app-gray-400 mb-2" />
                    <p className="text-sm font-semibold text-app-gray-700">No media selected yet</p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-app-gray-100 p-4 space-y-4 bg-white">
                <div>
                  <h4 className="text-sm font-semibold text-app-gray-800">Distribution</h4>
                  <p className="text-xs text-app-gray-600 mt-1">Describe how to distribute media across pages.</p>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-app-gray-500">Distribution mode</div>
                  <div className="inline-flex rounded-pill bg-app-gray-100 p-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={distributionMode === 'auto' ? 'appPrimary' : 'appGhost'}
                      className="h-8 px-3 rounded-pill"
                      onClick={() => setDistributionMode('auto')}
                    >
                      Auto distribute
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={distributionMode === 'manual' ? 'appPrimary' : 'appGhost'}
                      className="h-8 px-3 rounded-pill"
                      onClick={() => setDistributionMode('manual')}
                    >
                      Assign by chapter
                    </Button>
                  </div>
                </div>

                {distributionMode === 'auto' && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-app-gray-500">Distribution prompt</label>
                    <Textarea
                      value={distributionModePrompt}
                      onChange={(e) => setDistributionModePrompt(e.target.value)}
                      className="min-h-[120px]"
                      placeholder="How should media be distributed across chapters and pages?"
                    />
                  </div>
                )}

                {distributionMode === 'manual' && (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-wide text-app-gray-500">Select chapter</label>
                      <div className="flex gap-2">
                        <select
                          className="w-full h-10 rounded-md border border-app-gray-200 bg-white px-3 text-sm"
                          value={chapterSelectionId}
                          onChange={(e) => setChapterSelectionId(e.target.value)}
                        >
                          {chapters.map((chapter) => (
                            <option key={chapter.id} value={chapter.id}>{chapter.title || 'Untitled chapter'}</option>
                          ))}
                          <option value="__new__">Create new chapter...</option>
                        </select>
                        <Button
                          type="button"
                          variant="appPrimary"
                          className="planner-add-chapter-btn shrink-0 rounded-pill h-10 px-4"
                          onClick={handleAddChapterPlan}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add
                        </Button>
                      </div>

                      {chapterSelectionId === '__new__' && (
                        <Input
                          value={newChapterSelectionTitle}
                          onChange={(e) => setNewChapterSelectionTitle(e.target.value)}
                          placeholder="New chapter title"
                        />
                      )}
                    </div>

                    {chapterPlans.length > 0 && (
                      <div className="rounded-lg border border-app-gray-200 p-2 bg-white">
                        <div className="text-xs font-semibold uppercase tracking-wide text-app-gray-500 mb-2">Selected chapters</div>
                        <div className="flex flex-wrap gap-2">
                          {chapterPlans.map((plan) => {
                            const hasContent = (plan.mediaKeys || []).length > 0 || !!plan.prompt?.trim() || !!plan.description?.trim();
                            return (
                              <button
                                key={plan.key}
                                type="button"
                                className={cn(
                                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition-colors',
                                  activeChapterPlanKey === plan.key
                                    ? 'border-app-iris bg-app-iris/10 text-app-iris'
                                    : 'border-app-gray-200 bg-white hover:border-app-iris/60'
                                )}
                                onClick={() => setActiveChapterPlanKey(plan.key)}
                              >
                                {hasContent ? <Check className="h-3.5 w-3.5" /> : <span className="h-3.5 w-3.5 rounded-full border border-app-gray-300" />}
                                <span className="max-w-[180px] truncate">{plan.title}</span>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  className="ml-1 rounded-full p-0.5 hover:bg-black/10"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleRemoveChapterPlan(plan.key);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      handleRemoveChapterPlan(plan.key);
                                    }
                                  }}
                                >
                                  <X className="h-3 w-3" />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {activeChapterPlan && (
                      <div className="space-y-3 rounded-lg border border-app-gray-200 p-3 bg-app-gray-50">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-app-gray-800">Assign media to: {activeChapterPlan.title}</div>
                            <div className="text-xs text-app-gray-600">Select media cards on the left, then attach them to this chapter.</div>
                          </div>
                          <Button
                            type="button"
                            variant="appPrimary"
                            size="sm"
                            disabled={selectedMediaKeys.length === 0}
                            onClick={assignSelectedMediaToActiveChapter}
                          >
                            Assign selected ({selectedMediaKeys.length})
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-wide text-app-gray-500">Chapter prompt</label>
                          <Textarea
                            value={activeChapterPlan.prompt || ''}
                            onChange={(e) => updateActiveChapterPlan({ prompt: e.target.value })}
                            className="min-h-[80px] bg-white"
                            placeholder="How should media be used in this chapter?"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-semibold uppercase tracking-wide text-app-gray-500">Chapter description (optional)</label>
                          <Textarea
                            value={activeChapterPlan.description || ''}
                            onChange={(e) => updateActiveChapterPlan({ description: e.target.value })}
                            className="min-h-[70px] bg-white"
                            placeholder="Optional context for this chapter assignment."
                          />
                        </div>

                        {(activeChapterPlan.mediaKeys || []).length > 0 ? (
                          <div className="space-y-2">
                            <div className="text-xs font-semibold uppercase tracking-wide text-app-gray-500">Assigned media</div>
                            <div className="flex flex-wrap gap-2">
                              {activeChapterPlan.mediaKeys.map((mediaKey) => {
                                const mediaItem = mediaByKey.get(mediaKey);
                                if (!mediaItem) return null;
                                return (
                                  <button
                                    key={mediaKey}
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded-full border border-app-gray-300 bg-white px-2.5 py-1 text-xs"
                                    onClick={() => removeAssignedMediaFromActiveChapter(mediaKey)}
                                    title="Remove assignment"
                                  >
                                    <span className="max-w-[180px] truncate">{mediaItem.name || 'Untitled media'}</span>
                                    <X className="h-3 w-3" />
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-app-gray-600">
                            No media assigned yet.
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {isBabyJournal && (
                  <div className="planner-parent-voice-card rounded-lg border border-app-gray-200 p-3 bg-app-gray-50 space-y-2">
                    <div className="text-sm font-semibold text-app-gray-800">Baby journal reflection target</div>
                    <div className="text-xs text-app-gray-600">Choose where generated reflection text should be written.</div>
                    <div className="flex items-center gap-3">
                      <label className="planner-parent-voice-option inline-flex items-center gap-2 text-sm text-app-gray-800">
                        <input
                          className="planner-parent-voice-radio"
                          type="radio"
                          name="planner-parent-voice"
                          value="dad"
                          checked={parentVoice === 'dad'}
                          onChange={() => setParentVoice('dad')}
                        />
                        Dad
                      </label>
                      <label className="planner-parent-voice-option inline-flex items-center gap-2 text-sm text-app-gray-800">
                        <input
                          className="planner-parent-voice-radio"
                          type="radio"
                          name="planner-parent-voice"
                          value="mom"
                          checked={parentVoice === 'mom'}
                          onChange={() => setParentVoice('mom')}
                        />
                        Mom
                      </label>
                    </div>
                  </div>
                )}

                {plannerError && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {plannerError}
                  </div>
                )}
              </div>
            </div>

            {step === 'apply' && (
              <div className="rounded-xl border border-app-gray-100 p-4 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-app-gray-800">Apply progress</h4>
                  {isApplying && <Loader2 className="h-4 w-4 text-app-iris animate-spin" />}
                </div>

                <PlannerProgressTimeline events={timeline} />

                <div className="rounded-lg border border-app-gray-200 bg-white p-3 space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-app-gray-500">
                    Agent responses
                  </div>
                  {agentResponses.length === 0 ? (
                    <div className="text-sm text-app-gray-600">
                      Waiting for planner stream updates...
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                      {agentResponses.map((entry) => (
                        <div key={entry.id} className="rounded-md border border-app-gray-200 bg-app-gray-50 px-3 py-2 space-y-1">
                          <div className="text-sm font-medium text-app-gray-800">{entry.summary}</div>
                          <div className="text-[11px] text-app-gray-600">
                            {entry.type}
                            {entry.node ? ` • ${entry.node}` : ''}
                            {entry.status ? ` • ${entry.status}` : ''}
                          </div>
                          {entry.warnings.length > 0 ? (
                            <ul className="list-disc pl-4 text-xs text-amber-700 space-y-0.5">
                              {entry.warnings.map((warning, index) => (
                                <li key={`${entry.id}-warning-${index}`}>{String(warning)}</li>
                              ))}
                            </ul>
                          ) : null}
                          {entry.choices.length > 0 ? (
                            <ul className="list-disc pl-4 text-xs text-app-gray-700 space-y-0.5">
                              {entry.choices.map((choice, index) => (
                                <li key={`${entry.id}-choice-${choice.id || index}`}>{choice.label || choice.value || `Option ${index + 1}`}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {hitlRequest && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Human in the loop</div>
                        <div className="text-sm font-semibold text-amber-900 mt-1">{hitlRequest.question}</div>
                        {hitlRequest.subtitle ? (
                          <div className="text-xs text-amber-800 mt-1">{hitlRequest.subtitle}</div>
                        ) : null}
                      </div>
                      <div className="shrink-0 rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-700">
                        {hitlCountdown}s
                      </div>
                    </div>

                    <div className="grid gap-2">
                      {hitlRequest.options.map((option, index) => {
                        const hotkey = String(index + 1);
                        const isRecommended = index === hitlRequest.recommendedIndex;
                        return (
                          <Button
                            key={option.id || hotkey}
                            type="button"
                            variant={isRecommended ? 'appPrimary' : 'outline'}
                            className="justify-between h-auto py-2.5"
                            disabled={hitlResponding}
                            onClick={() => submitHitlSelection(index, 'manual')}
                          >
                            <span className="inline-flex items-center gap-2 text-left">
                              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-current px-1 text-[11px]">{hotkey}</span>
                              <span>{option.label}</span>
                            </span>
                            {isRecommended ? <span className="text-[11px]">Recommended</span> : null}
                          </Button>
                        );
                      })}
                    </div>

                    <div className="text-xs text-amber-800">
                      Waiting for selection: {hitlCountdown > 0 ? `${hitlCountdown}, ${Math.max(hitlCountdown - 1, 0)}...` : '0'}.
                      {!hitlResponding ? ' If no response, option 1 (recommended) is applied automatically.' : ' Submitting choice...'}
                    </div>
                  </div>
                )}

                {applyResult && (
                  <div className="rounded-md border border-app-gray-200 bg-app-gray-50 px-3 py-2 text-sm text-app-gray-800 space-y-1">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="font-medium">
                        {clarificationState ? 'Planner response received (action needed).' : 'Planner apply completed.'}
                      </span>
                    </div>
                    {plannerStatus ? (
                      <div className="text-xs text-app-gray-600">Status: {plannerStatus}</div>
                    ) : null}
                    {plannerSummaryMessage ? (
                      <div className="text-xs text-app-gray-700">{plannerSummaryMessage}</div>
                    ) : null}
                    {Array.isArray(applyResult?.warnings) && applyResult.warnings.length > 0 ? (
                      <div className="text-xs text-amber-700">
                        {applyResult.warnings.map((warning, index) => (
                          <div key={`${String(warning)}-${index}`}>{String(warning)}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}

                {clarificationState?.approval && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-2">
                    <div className="text-sm font-semibold text-amber-900">Delete confirmation required</div>
                    <div className="text-xs text-amber-800">
                      {clarificationState.approval.payload?.message
                        || clarificationState.approval.payload?.question
                        || 'Approve or reject this delete action.'}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        disabled={isApplying}
                        onClick={() => handleApprovalDecision('approve')}
                      >
                        Approve delete
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isApplying}
                        onClick={() => handleApprovalDecision('reject')}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                )}

                {clarificationState?.structure && (
                  <div className="rounded-lg border border-blue-300 bg-blue-50 p-3 space-y-2">
                    <div className="text-sm font-semibold text-blue-900">Structure confirmation required</div>
                    <div className="text-xs text-blue-800">
                      {clarificationState.structure.payload?.message
                        || clarificationState.structure.payload?.question
                        || 'Confirm whether planner should continue with this structure.'}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="appPrimary"
                        size="sm"
                        disabled={isApplying}
                        onClick={() => handleStructureDecision('yes')}
                      >
                        Yes
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isApplying}
                        onClick={() => handleStructureDecision('no')}
                      >
                        No
                      </Button>
                    </div>
                  </div>
                )}

                {clarificationState?.candidates && (
                  <div className="rounded-lg border border-app-gray-300 bg-white p-3 space-y-3">
                    <div className="text-sm font-semibold text-app-gray-900">Choose target page</div>
                    <div className="text-xs text-app-gray-600">
                      Planner found multiple page matches. Select one to continue.
                    </div>
                    <div className="grid gap-2">
                      {candidatePages.map((candidate, index) => {
                        const label = resolveCandidateLabel(candidate, index);
                        const reference = resolveCandidateReference(candidate);
                        return (
                          <button
                            key={`${label}-${reference || index}`}
                            type="button"
                            className={cn(
                              'text-left rounded-md border px-3 py-2 text-sm transition-colors',
                              selectedCandidateIndex === index
                                ? 'border-app-iris bg-app-iris/10 text-app-iris'
                                : 'border-app-gray-200 bg-white hover:border-app-iris/60'
                            )}
                            onClick={() => setSelectedCandidateIndex(index)}
                          >
                            <div className="font-medium">{index + 1}. {label}</div>
                            {reference ? (
                              <div className="text-xs text-app-gray-600 mt-0.5">{reference}</div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                    <div>
                      <Button
                        type="button"
                        variant="appPrimary"
                        size="sm"
                        disabled={isApplying || selectedCandidateIndex === null}
                        onClick={handleCandidateSelectionApply}
                      >
                        Apply selected page
                      </Button>
                    </div>
                  </div>
                )}

                {hasGenericClarificationUi && (
                  <div className="rounded-lg border border-indigo-300 bg-indigo-50 p-3 space-y-3">
                    <div className="text-sm font-semibold text-indigo-900">Send clarification</div>
                    <div className="text-xs text-indigo-800">
                      Provide extra details so planner can continue.
                    </div>

                    {clarificationChoices.length > 0 ? (
                      <div className="grid gap-2">
                        {clarificationChoices.map((choice) => (
                          <Button
                            key={choice.id}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="justify-start"
                            disabled={isApplying}
                            onClick={() => handleClarificationChoice(choice)}
                          >
                            {choice.label}
                          </Button>
                        ))}
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Textarea
                        value={clarificationInput}
                        onChange={(event) => setClarificationInput(event.target.value)}
                        className="min-h-[96px] bg-white"
                        placeholder="Example: create 3 chapters with 2 pages per chapter, focused on Spiderman timeline."
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          variant="appPrimary"
                          size="sm"
                          disabled={isApplying || !clarificationInput.trim()}
                          onClick={() => submitFreeformClarification(clarificationInput)}
                        >
                          Submit clarification
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isApplying}
              >
                Close
              </Button>

              <Button
                type="button"
                variant="appPrimary"
                onClick={hasCompletedApply ? () => onOpenChange(false) : handleApply}
                disabled={isApplying || Boolean(clarificationState)}
                className="inline-flex items-center gap-2"
              >
                <span>
                  {hasCompletedApply
                    ? 'Done'
                    : (isApplying ? 'Processing...' : submitActionLabel)}
                </span>
                {hasCompletedApply ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Sparkles className={cn('h-4 w-4', isApplying ? 'animate-pulse' : '')} />
                )}
              </Button>
            </DialogFooter>
          </div>
      </DialogContent>
    </Dialog>
  );
};

export default PhotoPlannerDialog;
