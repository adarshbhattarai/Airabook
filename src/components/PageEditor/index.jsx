import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { doc, getDoc, updateDoc, arrayRemove } from 'firebase/firestore';
import { ref as firebaseRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { firestore, storage, functions } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { httpsCallable } from 'firebase/functions';
import {
  ChevronDown, ChevronLeft, ChevronRight, Sparkles, UploadCloud, X, Trash2, Save
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '@/components/ui/dialog';
import BlockEditor from '@/components/BlockEditor';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { stripHtml, convertToEmulatorURL, textToHtml } from '@/lib/pageUtils';
import GenerateImagePrompt from '@/components/PageEditor/GenerateImagePrompt';
import TemplatePage from '@/components/PageEditor/TemplatePage';
import { pageTemplates } from '@/constants/pageTemplates';
import { pageBlockApiService } from '@/services/pageBlockApiService';

const MEDIA_PICKER_CONTEXT_EDITOR = 'editor';
const MEDIA_PICKER_CONTEXT_TEMPLATE = 'template';

const PageEditor = forwardRef(({
  bookId,
  chapterId,
  page,
  onPageUpdate,
  onAddPage,
  onNavigate,
  pageIndex,
  totalPages,
  pages,
  chapterTitle,
  draft,
  onDraftChange,
  onBlocksChange,
  onRequestReflow,
  onNearOverflowAtEnd,
  onUserInput,
  onFocus,
  onReplacePageId,
  onRequestPageDelete,
  layoutMode = 'standard',
  standardPageHeightPx,
  readOnly = false
}, ref) => {
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [aiBusy, setAiBusy] = useState(false);

  // AI preview dialog state
  const [aiPreviewOpen, setAiPreviewOpen] = useState(false);
  const [aiPreviewText, setAiPreviewText] = useState('');
  const [aiStyle, setAiStyle] = useState('Improve clarity');
  const [showAiStyleDropdown, setShowAiStyleDropdown] = useState(false);
  const [aiModel, setAiModel] = useState('gpt-4o');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [genImgOpen, setGenImgOpen] = useState(false);
  const [genImgPrompt, setGenImgPrompt] = useState('');
  const [genImgAnchor, setGenImgAnchor] = useState({ left: 16, top: 16 });
  const [genImgUseContext, setGenImgUseContext] = useState(true);
  const [genImgLoading, setGenImgLoading] = useState(false);
  const [reflectionRewritePrompts, setReflectionRewritePrompts] = useState({
    dadNotes: 'Improve clarity',
    momNotes: 'Improve clarity',
  });
  const [rewriteBusyField, setRewriteBusyField] = useState('');
  const [saveBusyField, setSaveBusyField] = useState('');
  const [blockRewritePreviewOpen, setBlockRewritePreviewOpen] = useState(false);
  const [blockRewritePreviewText, setBlockRewritePreviewText] = useState('');
  const [blockRewriteTargetField, setBlockRewriteTargetField] = useState('');
  const [blockRewriteTargetBlockId, setBlockRewriteTargetBlockId] = useState('');
  const [blockRewriteActions, setBlockRewriteActions] = useState(['insert', 'replace', 'discard']);

  const [mediaToDelete, setMediaToDelete] = useState(null);
  const [limitStatus, setLimitStatus] = useState('ok'); // 'ok', 'warning', 'full'

  const quillRef = useRef(null);
  const { user, appUser } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const pageRootRef = useRef(null);
  const contentMeasureRef = useRef(null);
  const toolbarRef = useRef(null);
  const editorContainerRef = useRef(null);
  const genImgInputRef = useRef(null);

  // Track last saved blocks for reconciliation (to detect deleted album images)
  const previousBlocksRef = useRef(null);

  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerTab, setMediaPickerTab] = useState('upload');
  const [albums, setAlbums] = useState([]);
  const [selectedAlbumId, setSelectedAlbumId] = useState(null);
  const [albumMedia, setAlbumMedia] = useState([]);
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [mediaPickerContext, setMediaPickerContext] = useState(MEDIA_PICKER_CONTEXT_EDITOR);

  const template = page?.type ? pageTemplates[page.type] : null;
  const isTemplatePage = !!template;
  const isBabyTemplatePage = template?.type === 'babyJournalPage';
  const BABY_REFLECTION_MAX_CHARS = 500;
  const isResponsiveLayout = layoutMode === 'standard';
  const templateDraft = draft?.templateContent || null;
  const templateMediaDraft = draft?.templateMedia;
  const latestDraftRef = useRef(draft);
  useEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);
  const templateContent = React.useMemo(() => {
    if (!template) return null;
    const mergedContent = {
      ...(template.defaults || {}),
      ...(page?.content || {}),
      ...(templateDraft || {}),
    };

    // Keep title aligned with existing page name when template title is still unset.
    if (isBabyTemplatePage && !templateDraft) {
      const normalizedTitle = (mergedContent.title || '').trim();
      const normalizedPageName = (page?.pageName || '').trim();
      if (!normalizedTitle && normalizedPageName) {
        mergedContent.title = normalizedPageName;
      }
    }

    return mergedContent;
  }, [template, page?.content, page?.pageName, templateDraft, isBabyTemplatePage]);
  const countPlainTextChars = React.useCallback(
    (rawValue) => stripHtml(String(rawValue || '')).length,
    []
  );
  const babyReflectionLimits = React.useMemo(() => {
    if (!isBabyTemplatePage) {
      return {
        dadCount: 0,
        momCount: 0,
        overLimitFields: [],
        hasOverLimit: false,
      };
    }
    const source = templateDraft || templateContent || template?.defaults || {};
    const dadCount = countPlainTextChars(source?.dadNotes || '');
    const momCount = countPlainTextChars(source?.momNotes || '');
    const overLimitFields = [];
    if (dadCount > BABY_REFLECTION_MAX_CHARS) overLimitFields.push('Dad reflection');
    if (momCount > BABY_REFLECTION_MAX_CHARS) overLimitFields.push('Mom reflection');
    return {
      dadCount,
      momCount,
      overLimitFields,
      hasOverLimit: overLimitFields.length > 0,
    };
  }, [isBabyTemplatePage, templateDraft, templateContent, template?.defaults, countPlainTextChars]);
  const templateMedia = React.useMemo(() => {
    if (!isTemplatePage) return [];

    const sourceMedia = Array.isArray(templateMediaDraft)
      ? templateMediaDraft
      : (Array.isArray(page?.media) ? page.media : []);

    const validMedia = sourceMedia
      .filter((item) => {
        if (!item?.url) return false;
        const mediaType = item?.type || 'image';
        return mediaType === 'image' || mediaType === 'video';
      })
      .slice(0, 5);

    if (validMedia.length > 0) {
      return validMedia;
    }

    if (templateContent?.imageUrl) {
      return [{
        url: templateContent.imageUrl,
        storagePath: templateContent.imageUrl,
        name: 'Legacy image',
        type: 'image',
        isLegacyFallback: true,
      }];
    }

    return [];
  }, [isTemplatePage, page?.media, templateMediaDraft, templateContent?.imageUrl]);
  const mediaList = (isTemplatePage && isBabyTemplatePage) ? templateMedia : (page.media || []);
  const previewItem = mediaList[previewIndex] || null;

  const logContentMeasure = React.useCallback((label) => {
    const el = contentMeasureRef.current;
    if (!el) return;
    console.log(`[PageEditor] ${label}`, {
      pageId: page.id,
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight
    });
  }, [page.id]);

  useEffect(() => {
    const el = contentMeasureRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      logContentMeasure('contentMeasureRef scroll');
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
    };
  }, [page.id, logContentMeasure]);

  useEffect(() => {
    if (!toolbarOpen) return undefined;
    const handleClick = (event) => {
      if (!toolbarRef.current?.contains(event.target)) {
        setToolbarOpen(false);
      }
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setToolbarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [toolbarOpen]);

  useEffect(() => {
    if (!genImgOpen) return undefined;
    const raf = requestAnimationFrame(() => {
      genImgInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [genImgOpen]);

  useEffect(() => {
    if (!isResponsiveLayout) {
      setToolbarOpen(false);
    }
  }, [isResponsiveLayout]);

  // Helper: Extract metadata from a media block's name prop (image or video)
  const getMediaMetadata = (block) => {
    if (!['image', 'video'].includes(block?.type) || !block?.props?.name) return null;
    try {
      return JSON.parse(block.props.name);
    } catch {
      return null;
    }
  };

  // Helper: Get all media blocks (images and videos) with albumId from a blocks array
  const getAlbumMediaBlocks = (blocks) => {
    if (!Array.isArray(blocks)) return [];
    return blocks
      .filter(b => ['image', 'video'].includes(b?.type))
      .map(b => ({ block: b, metadata: getMediaMetadata(b) }))
      .filter(item => item.metadata?.albumId);
  };

  // Helper: Find deleted album media by comparing previous and current blocks
  const findDeletedAlbumMedia = (prevBlocks, currentBlocks) => {
    const prevAlbumMedia = getAlbumMediaBlocks(prevBlocks);
    const currentAlbumMedia = getAlbumMediaBlocks(currentBlocks);

    // Get storage paths of current media
    const currentPaths = new Set(
      currentAlbumMedia.map(item => item.metadata?.storagePath).filter(Boolean)
    );

    // Find media in previous that are not in current
    return prevAlbumMedia.filter(
      item => item.metadata?.storagePath && !currentPaths.has(item.metadata.storagePath)
    );
  };

  // Untrack deleted album media (images and videos)
  const untrackDeletedAlbumMedia = async (deletedMedia) => {
    for (const item of deletedMedia) {
      const { albumId, storagePath } = item.metadata;
      if (!albumId || !storagePath) continue;

      try {
        const untrackUsage = httpsCallable(functions, 'untrackMediaUsage');
        await untrackUsage({
          albumId,
          storagePath,
          bookId,
          chapterId,
          pageId: page.id
        });
        console.log('Untracked deleted album media:', storagePath);
      } catch (error) {
        console.error('Failed to untrack album image:', error);
      }
    }
  };

  const getCurrentHTML = async () => {
    if (isTemplatePage) {
      return page?.note || '';
    }
    if (quillRef.current?.getHTML) {
      return await quillRef.current.getHTML();
    }
    return page?.note || '';
  };

  const persistTemplateDraft = (partial = {}) => {
    const nextDraft = {
      templateContent: templateDraft || templateContent || template?.defaults || {},
      ...(Array.isArray(templateMediaDraft) ? { templateMedia: templateMediaDraft } : {}),
      ...partial,
      updatedAt: Date.now(),
    };
    onDraftChange?.(page.id, nextDraft);
  };

  const handleTemplateChange = (nextContent) => {
    if (readOnly) return;
    persistTemplateDraft({ templateContent: nextContent });
    onUserInput?.(page.id);
    requestAnimationFrame(updateLimitStatusFromMeasure);
  };

  const handleReflectionRewritePromptChange = (field, value) => {
    if (!field) return;
    setReflectionRewritePrompts((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const normalizeSuggestedHtml = (content) => {
    const raw = String(content || '').trim();
    if (!raw) return '';
    if (/<[a-z][\s\S]*>/i.test(raw)) {
      return raw;
    }
    return textToHtml(raw);
  };

  const getReflectionFieldLabel = (field) => {
    if (field === 'dadNotes') return 'Dad reflection';
    if (field === 'momNotes') return 'Mom reflection';
    return 'Reflection';
  };

  const getReflectionBlockId = (field) => `legacy-${field}`;

  const buildSectionPayload = (field, options = {}) => {
    const {
      blockId = getReflectionBlockId(field),
      html = '',
      text = '',
      rewritePrompt = '',
      action = 'replace',
    } = options;
    const plainText = String(text || stripHtml(html || '')).trim();
    const sectionItem = {
      blockId,
      section: field,
      field,
      name: field,
      type: 'text',
      content: html || plainText,
      value: plainText,
      text: plainText,
      ...(rewritePrompt ? { prompt: rewritePrompt } : {}),
    };
    return {
      bookId,
      chapterId,
      pageId: page.id,
      action,
      pageText: plainText,
      ...(rewritePrompt ? { rewritePrompt } : {}),
      section: [field],
      sections: [sectionItem],
    };
  };

  const extractRewriteResult = (responseData, field) => {
    const payload = responseData?.data || responseData || {};
    const blocks = Array.isArray(payload?.blocks) ? payload.blocks : [];
    const matchedBlock = blocks.find((item) => {
      const key = item?.section || item?.field || item?.name;
      return key === field;
    }) || blocks[0];

    const rewritten = String(
      matchedBlock?.rewrittenText
      || payload?.rewrittenText
      || ''
    ).trim();
    const actions = Array.isArray(matchedBlock?.actions)
      ? matchedBlock.actions
      : (Array.isArray(payload?.actions) ? payload.actions : ['insert', 'replace', 'discard']);
    const blockId = String(matchedBlock?.blockId || getReflectionBlockId(field)).trim();

    return { rewritten, actions, blockId };
  };

  const closeBlockRewritePreview = () => {
    setBlockRewritePreviewOpen(false);
    setBlockRewritePreviewText('');
    setBlockRewriteTargetField('');
    setBlockRewriteTargetBlockId('');
    setBlockRewriteActions(['insert', 'replace', 'discard']);
  };

  const applyBlockRewrite = async (mode = 'discard') => {
    const targetField = blockRewriteTargetField;
    if (!targetField) {
      closeBlockRewritePreview();
      return;
    }
    if (mode === 'discard') {
      closeBlockRewritePreview();
      toast({
        title: 'Rewrite discarded',
        description: 'No changes were saved.',
      });
      return;
    }
    if (saveBusyField || rewriteBusyField) return;

    const contentSource = templateDraft || templateContent || template?.defaults || {};
    const existingHtml = String(contentSource?.[targetField] || '');
    const nextSuggestionHtml = normalizeSuggestedHtml(blockRewritePreviewText);
    const nextSuggestionText = stripHtml(nextSuggestionHtml || '');
    if (mode !== 'discard' && !nextSuggestionText) {
      closeBlockRewritePreview();
      return;
    }

    const fieldLabel = getReflectionFieldLabel(targetField);
    try {
      setSaveBusyField(targetField);
      const payload = buildSectionPayload(targetField, {
        blockId: blockRewriteTargetBlockId || getReflectionBlockId(targetField),
        html: nextSuggestionHtml,
        text: nextSuggestionText,
        action: mode,
      });
      const response = await pageBlockApiService.savePageBlocks(payload);

      if (mode === 'replace' || mode === 'insert') {
        let mergedHtml = nextSuggestionHtml;
        if (mode === 'insert') {
          mergedHtml = stripHtml(existingHtml)
            ? `${existingHtml}<p><br></p>${nextSuggestionHtml}`
            : nextSuggestionHtml;
        }
        handleTemplateChange({
          ...contentSource,
          [targetField]: mergedHtml,
        });
      }

      const backendMessage = response?.data?.message || response?.message || '';
      toast({
        title: mode === 'discard' ? 'Rewrite discarded' : (mode === 'insert' ? 'Rewrite inserted' : 'Rewrite replaced'),
        description: backendMessage || `${fieldLabel} updated.`,
      });
      closeBlockRewritePreview();
    } catch (error) {
      console.error('Reflection apply failed:', error);
      toast({
        title: 'Save failed',
        description: error?.message || `Could not apply rewrite to ${fieldLabel.toLowerCase()}.`,
        variant: 'destructive',
      });
    } finally {
      setSaveBusyField('');
    }
  };

  const rewriteReflectionField = async (field, promptText = '') => {
    if (!field || readOnly) return;
    if (rewriteBusyField || saveBusyField) return;
    if (page.id.startsWith('temp_')) {
      toast({
        title: 'Save page first',
        description: 'Please save this page first so block rewrite can be linked to a page id.',
        variant: 'warning',
      });
      return;
    }

    const contentSource = templateDraft || templateContent || template?.defaults || {};
    const originalHtml = String(contentSource?.[field] || '').trim();
    const originalText = stripHtml(originalHtml || '');
    if (!originalText) {
      toast({
        title: 'Nothing to rewrite',
        description: 'Please write some reflection text first.',
        variant: 'warning',
      });
      return;
    }

    const basePrompt = String(promptText || '').trim() || 'Improve clarity';
    const fieldLabel = getReflectionFieldLabel(field);
    const scopedPrompt = `Rewrite this ${fieldLabel}. Keep voice and intent unless asked otherwise. ${basePrompt}`;

    setRewriteBusyField(field);
    try {
      const payload = buildSectionPayload(field, {
        blockId: getReflectionBlockId(field),
        html: originalHtml,
        text: originalText,
        rewritePrompt: scopedPrompt,
      });
      const response = await pageBlockApiService.rewritePageBlock(payload);
      const { rewritten, actions, blockId } = extractRewriteResult(response, field);
      if (!rewritten) {
        throw new Error('No rewritten text was returned.');
      }

      setBlockRewriteTargetField(field);
      setBlockRewritePreviewText(rewritten);
      setBlockRewriteTargetBlockId(blockId || getReflectionBlockId(field));
      setBlockRewriteActions(Array.isArray(actions) && actions.length > 0 ? actions : ['insert', 'replace', 'discard']);
      setBlockRewritePreviewOpen(true);
    } catch (error) {
      console.error('Reflection rewrite failed:', error);
      toast({
        title: 'Rewrite failed',
        description: error?.message || 'Could not rewrite reflection.',
        variant: 'destructive',
      });
    } finally {
      setRewriteBusyField('');
    }
  };

  const saveReflectionField = async (field) => {
    if (!field || readOnly || !isTemplatePage) return false;
    if (saveBusyField || rewriteBusyField) return false;
    if (page.id.startsWith('temp_')) {
      toast({
        title: 'Save page first',
        description: 'Please save this page first so block save can be linked to a page id.',
        variant: 'warning',
      });
      return false;
    }

    const fieldLabel = getReflectionFieldLabel(field);
    const contentSource = templateDraft || templateContent || template?.defaults || {};
    const fieldHtml = String(contentSource?.[field] || '');
    const fieldText = stripHtml(fieldHtml || '');
    const isReflectionField = field === 'dadNotes' || field === 'momNotes';
    if (isReflectionField && countPlainTextChars(fieldHtml) > BABY_REFLECTION_MAX_CHARS) {
      toast({
        title: 'Character limit exceeded',
        description: `${fieldLabel} must be ${BABY_REFLECTION_MAX_CHARS} characters or fewer before saving.`,
        variant: 'destructive',
      });
      return false;
    }
    try {
      setSaveBusyField(field);
      const payload = buildSectionPayload(field, {
        blockId: getReflectionBlockId(field),
        html: fieldHtml,
        text: fieldText,
        action: 'replace',
      });
      await pageBlockApiService.savePageBlocks(payload);
      toast({
        title: 'Reflection saved',
        description: `${fieldLabel} saved.`,
      });
      return true;
    } catch (error) {
      console.error('Reflection save failed:', error);
      toast({
        title: 'Save failed',
        description: error?.message || `Could not save ${fieldLabel.toLowerCase()}.`,
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaveBusyField('');
    }
  };

  const uploadTemplateMediaItem = async (file) => {
    if (!file || !user) return null;
    const isVideo = file.type.startsWith('video');
    const isImage = file.type.startsWith('image');
    if (!isVideo && !isImage) {
      toast({
        title: 'Unsupported file type',
        description: 'Only images and videos are supported.',
        variant: 'destructive',
      });
      return null;
    }
    const mediaType = isVideo ? 'video' : 'image';
    const uniqueFileName = `${Date.now()}_${file.name}`;
    const storagePath = `${user.uid}/${bookId}/${chapterId}/${page.id}/media/${mediaType}/${uniqueFileName}`;
    const storageRef = firebaseRef(storage, storagePath);

    const metadata = {
      customMetadata: {
        originalName: file.name,
        bookId: bookId,
        mediaType: mediaType,
      },
    };

    const uploadTask = uploadBytesResumable(storageRef, file, metadata);

    return await new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress((prev) => ({ ...prev, [file.name]: progress }));
        },
        (error) => {
          setUploadProgress((prev) => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
          reject(error);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          setUploadProgress((prev) => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
          resolve({
            url: convertToEmulatorURL(downloadURL),
            storagePath,
            name: file.name,
            type: mediaType,
          });
        }
      );
    });
  };

  const handleTemplateImageUpload = async (file) => {
    const mediaItem = await uploadTemplateMediaItem(file);
    return mediaItem?.url || null;
  };

  const handleTemplateAddImages = async (files = []) => {
    if (readOnly) return;
    if (!Array.isArray(files) || files.length === 0) return;
    const editableExisting = templateMedia.filter((item) => !item.isLegacyFallback);
    const remainingSlots = Math.max(0, 5 - editableExisting.length);
    const nextFiles = files.slice(0, remainingSlots);
    if (nextFiles.length === 0) {
      toast({
        title: 'Media limit reached',
        description: 'You can add up to 5 photos or videos per baby journal page.',
        variant: 'destructive',
      });
      return;
    }

    const uploadedItems = [];
    for (const file of nextFiles) {
      const uploaded = await uploadTemplateMediaItem(file);
      if (uploaded) {
        uploadedItems.push(uploaded);
      }
    }
    if (uploadedItems.length === 0) return;

    persistTemplateDraft({ templateMedia: [...editableExisting, ...uploadedItems].slice(0, 5) });
    onUserInput?.(page.id);
  };

  const handleTemplateRemoveImage = (mediaItemToRemove) => {
    if (readOnly) return;
    const editableExisting = templateMedia.filter((item) => !item.isLegacyFallback);
    const removeKey = mediaItemToRemove?.storagePath || mediaItemToRemove?.url;
    const nextMedia = editableExisting.filter((item) => {
      const itemKey = item?.storagePath || item?.url;
      return itemKey !== removeKey;
    });
    persistTemplateDraft({ templateMedia: nextMedia });
    onUserInput?.(page.id);
  };

  const buildTemplateNote = (nextContent) => {
    if (!nextContent) return '';
    const textParts = [
      nextContent.title,
      nextContent.dadNotes,
      nextContent.momNotes,
    ].filter(Boolean);
    if (textParts.length === 0) return '';
    return textToHtml(textParts.join('\n'));
  };

  // Initialize previousBlocksRef when content first loads
  useEffect(() => {
    // Only set once when draft blocks first become available
    if (previousBlocksRef.current === null && draft?.blocks) {
      previousBlocksRef.current = [...draft.blocks];
    }
  }, [draft?.blocks]);

  // NOTE: Migration disabled - legacy page.media[] will be displayed in grid format
  // Users can use /media command to add new media as blocks
  // Old media stays in page.media[] and is shown in the legacy media grid below the editor

  useEffect(() => {
    const availableAlbums = appUser?.accessibleAlbums || [];
    setAlbums(availableAlbums);
    if (!selectedAlbumId && availableAlbums.length > 0) {
      setSelectedAlbumId(availableAlbums[0].id);
    } else if (availableAlbums.length === 0) {
      setSelectedAlbumId(null);
    }
  }, [appUser, selectedAlbumId]);

  useEffect(() => {
    if (!mediaPickerOpen || mediaPickerTab !== 'library' || !selectedAlbumId) {
      return;
    }

    let isMounted = true;
    const fetchAlbumMedia = async () => {
      try {
        setLoadingAlbums(true);
        setAlbumMedia([]);
        const albumRef = doc(firestore, 'albums', selectedAlbumId);
        const albumSnap = await getDoc(albumRef);
        if (!albumSnap.exists()) {
          toast({ title: 'Album not found', description: 'Please pick another album.', variant: 'destructive' });
          return;
        }

        const data = albumSnap.data();
        const images = (data.images || []).map((item) => {
          const url = typeof item === 'string' ? item : item.url;
          const storagePath = typeof item === 'string' ? null : item.storagePath;
          return {
            url: convertToEmulatorURL(url),
            storagePath,
            type: 'image',
            name: typeof item === 'string' ? (url?.split('/')?.pop() || 'Image') : (item.name || item.fileName || 'Image'),
          };
        });
        const videos = (data.videos || []).map((item) => {
          const url = typeof item === 'string' ? item : item.url;
          const storagePath = typeof item === 'string' ? null : item.storagePath;
          return {
            url: convertToEmulatorURL(url),
            storagePath,
            type: 'video',
            name: typeof item === 'string' ? (url?.split('/')?.pop() || 'Video') : (item.name || item.fileName || 'Video'),
          };
        });

        if (isMounted) {
          setAlbumMedia([...images, ...videos]);
        }
      } catch (error) {
        console.error('Failed to load album assets', error);
        toast({ title: 'Unable to load assets', description: error.message || 'Try again later.', variant: 'destructive' });
      } finally {
        if (isMounted) setLoadingAlbums(false);
      }
    };

    fetchAlbumMedia();

    return () => { isMounted = false; };
  }, [mediaPickerOpen, mediaPickerTab, selectedAlbumId, toast]);

  // Expose methods to parent via ref (including NEW cursor APIs)
  useImperativeHandle(ref, () => ({
    save: async (options = {}) => {
      return handleSave(options);
    },
    insertAI: async (style) => {
      return callRewrite(style);
    },
    hasUnsavedChanges: () => {
      return !!draft;
    },
    getHTML: async () => {
      return await getCurrentHTML();
    },
    // Block APIs
    getBlocks: () => {
      return quillRef.current?.getBlocks?.() || [];
    },
    setBlocks: async (blocks, options = {}) => {
      if (quillRef.current?.setBlocks) {
        await quillRef.current.setBlocks(blocks, options);
      }
    },
    // Measurement APIs
    getContentScrollHeight: () => {
      return contentMeasureRef.current?.scrollHeight ?? 0;
    },
    getContentClientHeight: () => {
      return pageRootRef.current?.clientHeight ?? 0;
    },
    // Cursor APIs (forwarded from BlockEditor)
    getSelection: () => {
      return quillRef.current?.getSelection?.() || null;
    },
    getActiveBlockId: () => {
      return quillRef.current?.getActiveBlockId?.() || null;
    },
    isCursorInLastBlock: () => {
      return quillRef.current?.isCursorInLastBlock?.() || false;
    },
    isCursorAtEndOfPage: () => {
      return quillRef.current?.isCursorAtEndOfPage?.() || false;
    },
    focusBlock: (blockId, pos = 'start') => {
      return quillRef.current?.focusBlock?.(blockId, pos) || false;
    },
    focusAtStart: () => {
      // Focus the first block at start
      const blocks = quillRef.current?.getBlocks?.() || [];
      if (blocks.length > 0 && blocks[0]?.id) {
        return quillRef.current?.focusBlock?.(blocks[0].id, 'start') || false;
      }
      return quillRef.current?.focus?.() || false;
    },
    focusAtEnd: () => {
      // Focus the last block at end
      const blocks = quillRef.current?.getBlocks?.() || [];
      if (blocks.length > 0 && blocks[blocks.length - 1]?.id) {
        return quillRef.current?.focusBlock?.(blocks[blocks.length - 1].id, 'end') || false;
      }
      return quillRef.current?.focus?.() || false;
    },
    splitActiveBlockAtCursor: () => {
      return quillRef.current?.splitActiveBlockAtCursor?.() || null;
    },
    insertText: (text) => {
      return quillRef.current?.insertText?.(text) || false;
    },
    focus: () => {
      return quillRef.current?.focus?.();
    },
    // NEW: Insert media blocks (images and videos)
    insertMediaBlocks: (media) => {
      return quillRef.current?.insertMediaBlocks?.(media) || false;
    },
    // Legacy: Insert image blocks only
    insertImageBlocks: (images) => {
      return quillRef.current?.insertImageBlocks?.(images) || false;
    },
    // Insert video blocks only
    insertVideoBlocks: (videos) => {
      return quillRef.current?.insertVideoBlocks?.(videos) || false;
    },
    // NEW: Get media block metadata
    getMediaBlockMetadata: (block) => {
      return quillRef.current?.getMediaBlockMetadata?.(block) || null;
    },
    // Legacy: Get image block metadata
    getImageBlockMetadata: (block) => {
      return quillRef.current?.getImageBlockMetadata?.(block) || null;
    },
    // NEW: Open media picker dialog
    openMediaPicker: () => {
      handleMediaRequest();
    }
  }));

  // keyboard arrows for media modal
  useEffect(() => {
    if (!previewOpen) return;
    const onKey = (e) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'Escape') closePreview();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previewOpen, mediaList.length]);

  const handleTemplateSave = async (options = {}) => {
    if (readOnly) return true;
    const { silent = false } = options;
    const draftVersion = latestDraftRef.current?.updatedAt ?? null;
    setIsSaving(true);
    const contentToSave = templateDraft || templateContent || template?.defaults || {};
    const mediaToSave = (isBabyTemplatePage ? templateMedia : (page.media || []))
      .filter((item) => item?.url)
      .map((item) => ({
        url: item.url,
        storagePath: item.storagePath || item.url,
        name: item.name || 'Image',
        type: item.type || 'image',
        ...(item.albumId ? { albumId: item.albumId } : {}),
      }));
    const normalizedContent = { ...contentToSave };

    if (isBabyTemplatePage) {
      const firstImage = mediaToSave.find((item) => item?.url && (item?.type || 'image') === 'image');
      normalizedContent.imageUrl = firstImage?.url || '';
      const overLimitFields = [];
      if (countPlainTextChars(normalizedContent?.dadNotes || '') > BABY_REFLECTION_MAX_CHARS) {
        overLimitFields.push('Dad reflection');
      }
      if (countPlainTextChars(normalizedContent?.momNotes || '') > BABY_REFLECTION_MAX_CHARS) {
        overLimitFields.push('Mom reflection');
      }
      if (overLimitFields.length > 0) {
        if (!silent) {
          toast({
            title: 'Character limit exceeded',
            description: `${overLimitFields.join(' and ')} must be ${BABY_REFLECTION_MAX_CHARS} characters or fewer before saving.`,
            variant: 'destructive',
          });
        }
        setIsSaving(false);
        return false;
      }
    }

    const templatePageName = (normalizedContent.title || '').trim() || 'Untitled Page';
    const shortNote = templatePageName;
    const note = buildTemplateNote(normalizedContent) || textToHtml(shortNote);

    try {
      if (page.id.startsWith('temp_')) {
        const createPageFn = httpsCallable(functions, 'createPage');
        const result = await createPageFn({
          bookId,
          chapterId,
          note,
          media: mediaToSave,
          pageName: templatePageName,
          order: page.order,
          type: template?.type,
          templateVersion: template?.templateVersion,
          content: normalizedContent,
          theme: template?.theme,
        });
        const newPage = result.data.page;
        onReplacePageId?.(page.id, {
          ...newPage,
          pageName: newPage.pageName ?? templatePageName,
          shortNote,
          media: mediaToSave,
          content: normalizedContent
        });
        if (!silent) {
          toast({ title: 'Page Created', description: 'Your draft page has been saved.' });
        }
      } else {
        const updatePageFn = httpsCallable(functions, 'updatePage');
        await updatePageFn({
          bookId,
          chapterId,
          pageId: page.id,
          note,
          media: mediaToSave,
          pageName: templatePageName,
          type: template?.type,
          templateVersion: template?.templateVersion,
          content: normalizedContent,
          theme: template?.theme,
        });
        onPageUpdate({
          ...page,
          note,
          pageName: templatePageName,
          shortNote,
          media: mediaToSave,
          content: normalizedContent,
          type: template?.type,
          templateVersion: template?.templateVersion,
          theme: template?.theme,
        });
        if (!silent) {
          toast({ title: 'Success', description: 'Page saved.' });
        }
      }

      const latestDraft = latestDraftRef.current;
      if (!latestDraft || latestDraft.updatedAt === draftVersion) {
        onDraftChange?.(page.id, null);
      }
      return true;
    } catch (error) {
      console.error('Save error detailed:', error);
      if (!silent) {
        toast({ title: 'Save Failed', description: error.message || 'Unknown save error', variant: 'destructive' });
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async (options = {}) => {
    if (readOnly) return true;
    const { silent = false } = options;
    const draftVersion = latestDraftRef.current?.updatedAt ?? null;
    if (isTemplatePage) {
      return await handleTemplateSave({ silent });
    }
    setIsSaving(true);
    const htmlToSave = await getCurrentHTML();
    const plain = stripHtml(htmlToSave);
    const shortNote = plain.substring(0, 40) + (plain.length > 40 ? '...' : '');

    // Get current blocks for reconciliation
    const currentBlocks = quillRef.current?.getBlocks?.() || [];

    try {
      if (page.id.startsWith('temp_')) {
        const createPageFn = httpsCallable(functions, 'createPage');
        const result = await createPageFn({
          bookId,
          chapterId,
          note: htmlToSave,
          media: page.media || [],
          ...(page.pageName !== undefined ? { pageName: page.pageName } : {}),
          order: page.order
        });
        const newPage = result.data.page;
        onReplacePageId?.(page.id, newPage);
        if (!silent) {
          toast({ title: 'Page Created', description: 'Your draft page has been saved.' });
        }
      } else {
        const updatePageFn = httpsCallable(functions, 'updatePage');
        await updatePageFn({
          bookId,
          chapterId,
          pageId: page.id,
          note: htmlToSave,
          media: page.media || [],
          ...(page.pageName !== undefined ? { pageName: page.pageName } : {})
        });
        onPageUpdate({ ...page, note: htmlToSave, pageName: page.pageName ?? '', shortNote });
        if (!silent) {
          toast({ title: 'Success', description: 'Page saved.' });
        }
      }

      // Reconciliation: Untrack deleted album media (images and videos)
      if (previousBlocksRef.current) {
        const deletedMedia = findDeletedAlbumMedia(previousBlocksRef.current, currentBlocks);
        if (deletedMedia.length > 0) {
          console.log(`Found ${deletedMedia.length} deleted album media item(s) to untrack`);
          await untrackDeletedAlbumMedia(deletedMedia);
        }
      }

      // Update previousBlocksRef for next save comparison
      previousBlocksRef.current = [...currentBlocks];

      const latestDraft = latestDraftRef.current;
      if (!latestDraft || latestDraft.updatedAt === draftVersion) {
        onDraftChange?.(page.id, null);
      }
      return true;
    } catch (error) {
      console.error('Save error detailed:', error);
      if (!silent) {
        toast({ title: 'Save Failed', description: error.message || 'Unknown save error', variant: 'destructive' });
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const updateLimitStatusFromMeasure = () => {
    const scrollH = contentMeasureRef.current?.scrollHeight ?? 0;
    const clientH = pageRootRef.current?.clientHeight ?? 0;
    if (clientH <= 0) return;
    const ratio = scrollH / clientH;
    if (ratio > 1.0) setLimitStatus('full');
    else if (ratio > 0.9) setLimitStatus('warning');
    else setLimitStatus('ok');
  };

  const handleBlocksChange = (blocks) => {
    if (readOnly) return;
    const nextDraft = { blocks, updatedAt: Date.now() };
    onDraftChange?.(page.id, nextDraft);
    onBlocksChange?.(page.id, blocks);
    onUserInput?.(page.id);
    requestAnimationFrame(updateLimitStatusFromMeasure);
  };

  // Fast-path: detect typing at end of page when near overflow
  const handleKeyDownCapture = (e) => {
    if (readOnly) return;
    // Track user input timestamp
    onUserInput?.(page.id);

    // Only intercept character keys and Enter (skip Backspace).
    if (e.key === 'Backspace') return;
    if (e.key.length > 1) return;

    // Check if cursor is at end of page and page is near full
    const atEndOfPage = quillRef.current?.isCursorAtEndOfPage?.();
    console.log('atEndOfPage ' + 'Key', atEndOfPage, e.key);
    if (!atEndOfPage) return;

    const scrollH = contentMeasureRef.current?.scrollHeight ?? 0;
    const clientH = pageRootRef.current?.clientHeight ?? 0;
    const nearOverflow = clientH > 0 && scrollH >= clientH - 24;

    if (nearOverflow && onNearOverflowAtEnd) {
      // Trigger fast-path: create/focus next page
      // DO NOT preventDefault - let the character appear on this page first.
      // e.preventDefault();
      // e.stopPropagation();
      console.log('Triggering overflow jump (allowing char insert first)');
      onNearOverflowAtEnd(page.id);
    }
  };

  const handleFileSelect = async (event) => {
    if (readOnly) return;
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Limit to 5 media items per /media insertion (Option C)
    if (files.length > 5) {
      toast({
        title: 'Too many files',
        description: 'You can select up to 5 media items at a time. Please select fewer files.',
        variant: 'destructive',
      });
      return;
    }

    setMediaPickerOpen(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (mediaPickerContext === MEDIA_PICKER_CONTEXT_TEMPLATE) {
      await handleTemplateAddImages(files);
      return;
    }

    // Upload each file, collect results, then insert as blocks
    files.forEach(file => handleUpload(file));
  };

  const openFileDialog = () => {
    if (readOnly) return;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleUpload = (file) => {
    if (readOnly) return;
    if (!file || !user) return;

    // Determine media type from file
    const isVideo = file.type.startsWith('video');
    const isImage = file.type.startsWith('image');

    if (!isVideo && !isImage) {
      toast({
        title: 'Unsupported file type',
        description: 'Only images and videos are supported.',
        variant: 'destructive'
      });
      return;
    }

    const mediaType = isVideo ? 'video' : 'image';
    const uniqueFileName = `${Date.now()}_${file.name}`;
    const storagePath = `${user.uid}/${bookId}/${chapterId}/${page.id}/media/${mediaType}/${uniqueFileName}`;
    const storageRef = firebaseRef(storage, storagePath);

    const metadata = {
      customMetadata: {
        originalName: file.name,
        bookId: bookId,
        mediaType: mediaType
      }
    };

    const uploadTask = uploadBytesResumable(storageRef, file, metadata);

    uploadTask.on('state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        setUploadProgress(prev => ({ ...prev, [file.name]: progress }));
      },
      (error) => {
        toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
        setUploadProgress(prev => {
          const next = { ...prev };
          delete next[file.name];
          return next;
        });
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
          // Insert as media block (image or video)
          const mediaData = {
            url: downloadURL,
            storagePath,
            name: file.name,
            type: mediaType,
          };

          // Insert as BlockNote media block
          if (quillRef.current?.insertMediaBlocks) {
            quillRef.current.insertMediaBlocks([mediaData]);
          }

          setUploadProgress(prev => {
            const next = { ...prev };
            delete next[file.name];
            return next;
          });
          toast({ title: 'Upload Success', description: `"${file.name}" has been inserted.` });
        });
      }
    );
  };

  const handleAttachFromAlbum = async (asset) => {
    if (readOnly) return;
    try {
      // Determine media type
      const mediaType = asset.type === 'video' ? 'video' : 'image';

      // Insert as media block (image or video)
      const mediaData = {
        url: asset.url,
        storagePath: asset.storagePath || asset.url,
        name: asset.name || 'Asset',
        albumId: selectedAlbumId, // Important for tracking
        type: mediaType,
      };

      // Insert as BlockNote media block
      if (quillRef.current?.insertMediaBlocks) {
        quillRef.current.insertMediaBlocks([mediaData]);
      }

      // Track usage for album assets (so they can't be deleted while in use)
      try {
        const trackUsage = httpsCallable(functions, 'trackMediaUsage');
        await trackUsage({
          albumId: selectedAlbumId,
          storagePath: asset.storagePath,
          bookId,
          chapterId,
          pageId: page.id
        });
      } catch (trackError) {
        console.error('Failed to track usage:', trackError);
      }

      toast({ title: 'Asset added', description: `${imageData.name} inserted from library.` });
    } catch (error) {
      console.error('Failed to attach asset', error);
      toast({ title: 'Attach failed', description: error.message || 'Could not attach asset.', variant: 'destructive' });
    }
  };

  const toggleAssetSelection = (asset) => {
    if (readOnly) return;
    setSelectedAssets(prev => {
      const isSelected = prev.some(a => (a.storagePath || a.url) === (asset.storagePath || asset.url));
      if (isSelected) {
        return prev.filter(a => (a.storagePath || a.url) !== (asset.storagePath || asset.url));
      } else {
        return [...prev, asset];
      }
    });
  };

  const handleSaveSelectedAssets = async () => {
    if (readOnly) return;
    if (selectedAssets.length === 0) return;

    // Option C: Limit to 5 media items per /media insertion
    if (selectedAssets.length > 5) {
      toast({
        title: 'Too many items selected',
        description: 'You can select up to 5 media items at a time. Please select fewer items.',
        variant: 'destructive',
      });
      return;
    }

    if (mediaPickerContext === MEDIA_PICKER_CONTEXT_TEMPLATE) {
      const editableExisting = templateMedia.filter((item) => !item.isLegacyFallback);
      const remainingSlots = Math.max(0, 5 - editableExisting.length);
      if (remainingSlots === 0) {
        toast({
          title: 'Media limit reached',
          description: 'You can add up to 5 photos or videos per baby journal page.',
          variant: 'destructive',
        });
        return;
      }

      const mediaToInsert = selectedAssets
        .slice(0, remainingSlots)
        .map((asset) => ({
          url: asset.url,
          storagePath: asset.storagePath || asset.url,
          name: asset.name || 'Asset',
          type: asset.type === 'video' ? 'video' : 'image',
          ...(selectedAlbumId || asset.albumId ? { albumId: selectedAlbumId || asset.albumId } : {}),
        }));

      persistTemplateDraft({ templateMedia: [...editableExisting, ...mediaToInsert].slice(0, 5) });
      onUserInput?.(page.id);
      toast({
        title: 'Media added',
        description: `${mediaToInsert.length} media item(s) added from asset registry.`,
      });

      setSelectedAssets([]);
      setMediaPickerOpen(false);
      return;
    }

    // Prepare media data for block insertion (both images and videos)
    const mediaToInsert = selectedAssets.map(asset => ({
      url: asset.url,
      storagePath: asset.storagePath || asset.url,
      name: asset.name || 'Asset',
      albumId: selectedAlbumId,
      type: asset.type === 'video' ? 'video' : 'image',
    }));

    // Insert all media as blocks at once
    if (quillRef.current?.insertMediaBlocks) {
      quillRef.current.insertMediaBlocks(mediaToInsert);
    }

    // Track usage for all album assets
    for (const asset of selectedAssets) {
      try {
        const trackUsage = httpsCallable(functions, 'trackMediaUsage');
        await trackUsage({
          albumId: selectedAlbumId,
          storagePath: asset.storagePath,
          bookId,
          chapterId,
          pageId: page.id
        });
      } catch (trackError) {
        console.error('Failed to track usage:', trackError);
      }
    }

    toast({
      title: 'Assets added',
      description: `${mediaToInsert.length} media item(s) inserted from library.`
    });

    setSelectedAssets([]);
    setMediaPickerOpen(false);
  };

  const handleMediaDelete = (mediaItemToDelete) => {
    if (readOnly) return;
    setMediaToDelete(mediaItemToDelete);
  };

  const confirmMediaDelete = async () => {
    if (readOnly) return;
    if (!mediaToDelete) return;

    const pageRef = doc(firestore, 'books', bookId, 'chapters', chapterId, 'pages', page.id);
    try {
      await updateDoc(pageRef, { media: arrayRemove(mediaToDelete) });

      if (mediaToDelete.albumId && mediaToDelete.storagePath) {
        try {
          const untrackUsage = httpsCallable(functions, 'untrackMediaUsage');
          await untrackUsage({
            albumId: mediaToDelete.albumId,
            storagePath: mediaToDelete.storagePath,
            bookId,
            chapterId,
            pageId: page.id
          });
        } catch (untrackError) {
          console.error('Failed to untrack usage:', untrackError);
        }
      }

      onPageUpdate({
        ...page,
        media: (page.media || []).filter(m => m.storagePath !== mediaToDelete.storagePath),
      });
      toast({ title: 'Success', description: 'Media deleted.' });
    } catch {
      toast({ title: 'Deletion Error', description: 'Could not update page details.', variant: 'destructive' });
    } finally {
      setMediaToDelete(null);
    }
  };

  const openPreview = (mediaOrIndex) => {
    const idx = typeof mediaOrIndex === 'number'
      ? mediaOrIndex
      : mediaList.findIndex(m => m.storagePath === mediaOrIndex.storagePath);
    if (idx >= 0) {
      setPreviewIndex(idx);
      setPreviewOpen(true);
    }
  };

  const closePreview = () => setPreviewOpen(false);
  const goPrev = () => {
    if (mediaList.length === 0) return;
    setPreviewIndex((i) => (i - 1 + mediaList.length) % mediaList.length);
  };
  const goNext = () => {
    if (mediaList.length === 0) return;
    setPreviewIndex((i) => (i + 1) % mediaList.length);
  };

  const openMediaPicker = (context = MEDIA_PICKER_CONTEXT_EDITOR, tab = 'upload') => {
    if (readOnly) return;
    setMediaPickerContext(context);
    setMediaPickerTab(tab);
    setSelectedAssets([]);
    setMediaPickerOpen(true);
  };

  // NEW: Handle /media command from editor - opens media picker dialog
  const handleMediaRequest = () => {
    openMediaPicker(MEDIA_PICKER_CONTEXT_EDITOR);
  };

  const openGenImagePrompt = (payload = {}) => {
    if (readOnly) return;
    const anchorRect = payload?.anchorRect;
    const container = editorContainerRef.current;

    if (container && anchorRect) {
      const containerRect = container.getBoundingClientRect();
      const leftRaw = anchorRect.left - containerRect.left;
      const maxLeft = Math.max(12, containerRect.width - 360);
      const left = Math.min(Math.max(12, leftRaw), maxLeft);
      const top = anchorRect.bottom - containerRect.top + 8;
      setGenImgAnchor({ left, top });
    } else {
      setGenImgAnchor({ left: 16, top: 16 });
    }

    quillRef.current?.saveCursorPosition?.();
    setGenImgPrompt('');
    setGenImgUseContext(true);
    setGenImgOpen(true);
  };

  const closeGenImagePrompt = () => {
    setGenImgOpen(false);
    setGenImgPrompt('');
  };

  const submitGenImagePrompt = async () => {
    if (readOnly) return;
    if (genImgLoading) return;
    const prompt = genImgPrompt.trim();
    if (!prompt) {
      toast({ title: 'Add a prompt', description: 'Describe the image you want to generate.', variant: 'warning' });
      return;
    }

    setGenImgLoading(true);
    try {
      let pageContext = '';
      if (genImgUseContext) {
        const currentHtml = await getCurrentHTML();
        pageContext = stripHtml(currentHtml || '');
      }

      const generateImageFn = httpsCallable(functions, 'generateImage');
      const response = await generateImageFn({
        prompt,
        useContext: genImgUseContext,
        bookId,
        chapterId,
        pageId: page.id,
        pageContext,
      });

      const data = response?.data || {};
      const mediaData = {
        url: data.url,
        storagePath: data.storagePath,
        name: data.name || 'Generated image',
        albumId: data.albumId || bookId,
        type: 'image',
      };

      if (mediaData.url && mediaData.storagePath && quillRef.current?.insertMediaBlocks) {
        quillRef.current.insertMediaBlocks([mediaData]);
      }

      toast({
        title: 'Image generated',
        description: genImgUseContext ? 'Added to the page using your text as context.' : 'Added to the page.',
      });
    } catch (error) {
      console.error('AI image generation failed:', error);
      toast({
        title: 'Generation failed',
        description: error?.message || 'Could not generate the image. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setGenImgLoading(false);
      setGenImgOpen(false);
      setGenImgPrompt('');
      setGenImgUseContext(true);
    }
  };

  // --- AI: callable + preview modal ---
  const callRewrite = async (styleToUse) => {
    if (aiBusy) return;

    const style = styleToUse || 'Improve clarity';
    const currentContent = await getCurrentHTML();

    const text = stripHtml(currentContent);
    if (!text || !text.trim()) {
      toast({ title: 'Nothing to rewrite', description: 'Please write some text first.', variant: 'warning' });
      return;
    }

    setAiBusy(true);
    try {
      const rewriteFn = httpsCallable(functions, 'rewriteNote');
      const response = await rewriteFn({
        noteText: text,
        prompt: style,
        bookId: bookId,
        chapterId: chapterId,
        pageId: page.id
      });

      const data = response.data;
      if (data.rewritten) {
        setAiPreviewText(data.rewritten);
        setAiPreviewOpen(true);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('AI Rewrite error:', error);
      toast({ title: 'Rewrite failed', description: error.message, variant: 'destructive' });
    } finally {
      setAiBusy(false);
    }
  };

  const applyRewrite = async (mode = 'replace') => {
    if (!quillRef.current) return;

    try {
      if (mode === 'replace') {
        if (quillRef.current.setHTML) {
          await quillRef.current.setHTML(aiPreviewText);
        } else {
          toast({ title: 'Error', description: 'Replace not supported in this editor mode.', variant: 'destructive' });
        }
        toast({ title: 'Rewrite Applied', description: 'Your note has been completely updated.' });
      } else if (mode === 'insert') {
        if (quillRef.current.insertHTML) {
          await quillRef.current.insertHTML(aiPreviewText);
          toast({ title: 'Text Inserted', description: 'AI text inserted at cursor.' });
        } else {
          toast({ title: 'Error', description: 'Insert not supported in this editor mode.', variant: 'destructive' });
        }
      }
      onRequestReflow?.(page.id);
    } catch (error) {
      console.error('Error applying rewrite:', error);
      toast({ title: 'Application Failed', description: 'Could not apply changes.', variant: 'destructive' });
    } finally {
      setAiPreviewOpen(false);
    }
  };

  const layoutStyles = {
    a4: 'bg-white shadow-2xl p-[5%] page-sheet group',
    scrapbook: 'bg-white shadow-2xl p-[5%] page-sheet group',
    standard: 'w-full flex flex-col max-w-5xl mx-auto p-8 group'
  };

  const PAGE_SIZES_MM = {
    a4: { width: 210, height: 297 },
    scrapbook: { width: 254, height: 254 }
  };

  const mmToPx = (mm) => (mm * 96) / 25.4;

  const pageOuterRef = useRef(null);
  const [pageHeightPx, setPageHeightPx] = useState(null);
  const [pageScale, setPageScale] = useState(1);
  const [pageSizePx, setPageSizePx] = useState({ width: null, height: null });

  useEffect(() => {
    const outerEl = pageOuterRef.current;
    const sizeMm = PAGE_SIZES_MM[layoutMode] || null;

    const compute = () => {
      if (sizeMm) {
        const widthPx = mmToPx(sizeMm.width);
        const heightPx = mmToPx(sizeMm.height);
        const availableWidth = outerEl?.clientWidth || widthPx;
        const scale = Math.min(1, availableWidth / widthPx);

        setPageSizePx({ width: widthPx, height: heightPx });
        setPageScale(scale);
        setPageHeightPx(heightPx);
        requestAnimationFrame(updateLimitStatusFromMeasure);
        return;
      }

      if (typeof standardPageHeightPx === 'number' && standardPageHeightPx > 0) {
        setPageHeightPx(Math.max(420, Math.floor(standardPageHeightPx)));
        requestAnimationFrame(updateLimitStatusFromMeasure);
      }
    };

    compute();
    const ro = new ResizeObserver(() => compute());
    if (outerEl) ro.observe(outerEl);
    return () => ro.disconnect();
  }, [layoutMode, standardPageHeightPx]);

  const fixedLayout = layoutMode === 'a4' || layoutMode === 'scrapbook';
  const sizeMm = PAGE_SIZES_MM[layoutMode];
  const scaledWidth = pageSizePx.width ? Math.round(pageSizePx.width * pageScale) : null;
  const scaledHeight = pageSizePx.height ? Math.round(pageSizePx.height * pageScale) : null;
  const fallbackHeightPx = 420;
  const standardHeightStyle = pageHeightPx
    ? (isTemplatePage ? { minHeight: `${pageHeightPx}px` } : { height: `${pageHeightPx}px` })
    : { minHeight: `${fallbackHeightPx}px` };
  const saveButtonLabel = pageIndex < totalPages - 1 ? 'Save Page' : 'Save + New';
  const showSidePageNav = !readOnly && isBabyTemplatePage && totalPages > 1 && typeof onNavigate === 'function';
  const handlePrimarySaveAction = async () => {
    if (pageIndex < totalPages - 1) {
      await handleSave();
      return;
    }
    await handleSave();
    onAddPage?.(true, '', page.id);
  };

  return (
    <div
      ref={pageOuterRef}
      className={fixedLayout ? 'w-full flex justify-start' : undefined}
    >
      <div
        className={fixedLayout ? 'page-sheet-outer' : undefined}
        style={fixedLayout && scaledWidth && scaledHeight ? { width: `${scaledWidth}px`, height: `${scaledHeight}px` } : undefined}
      >
        <div
          ref={pageRootRef}
          className={`page-editor-surface ${layoutStyles[layoutMode] || layoutStyles.standard} overflow-visible relative`}
          style={fixedLayout && sizeMm ? {
            width: `${sizeMm.width}mm`,
            height: `${sizeMm.height}mm`,
            transform: `scale(${pageScale})`,
            transformOrigin: 'top left'
          } : standardHeightStyle}
          onMouseDownCapture={() => onFocus?.(page.id)}
          onTouchStartCapture={() => onFocus?.(page.id)}
        >
          {showSidePageNav && (
            <>
              <button
                type="button"
                aria-label="Previous page"
                className={`page-nav-btn absolute left-2 top-1/2 z-30 -translate-y-1/2 rounded-full border bg-white/95 p-2 shadow-md transition ${pageIndex > 0 ? 'border-app-gray-200 text-app-gray-700 hover:bg-white hover:shadow-lg' : 'page-nav-btn-disabled border-app-gray-100 text-app-gray-300 cursor-not-allowed'}`}
                disabled={pageIndex <= 0}
                onClick={() => onNavigate?.('prev')}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                aria-label="Next page"
                className={`page-nav-btn absolute right-2 top-1/2 z-30 -translate-y-1/2 rounded-full border bg-white/95 p-2 shadow-md transition ${pageIndex < totalPages - 1 ? 'border-app-gray-200 text-app-gray-700 hover:bg-white hover:shadow-lg' : 'page-nav-btn-disabled border-app-gray-100 text-app-gray-300 cursor-not-allowed'}`}
                disabled={pageIndex >= totalPages - 1}
                onClick={() => onNavigate?.('next')}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          <div ref={contentMeasureRef} className={isTemplatePage ? 'min-h-full overflow-visible flex flex-col' : 'h-full overflow-hidden flex flex-col'}>
                <div className="flex justify-center items-center mb-6 relative">
                  {chapterTitle && (
                <div className="page-editor-chapter-title text-xs font-semibold text-violet-600 uppercase tracking-wider mb-1">
                  {chapterTitle}
                </div>
              )}
            </div>

            {/* Hidden file input for uploader */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Media Picker Dialog */}
            <Dialog open={mediaPickerOpen} onOpenChange={(open) => {
              setMediaPickerOpen(open);
              if (!open) {
                setSelectedAssets([]);
                setMediaPickerContext(MEDIA_PICKER_CONTEXT_EDITOR);
              }
            }}>
              <DialogContent className="media-picker-dialog max-w-4xl bg-white rounded-2xl shadow-2xl border border-gray-100 p-6">
                <DialogHeader>
                  <DialogTitle>Insert Media</DialogTitle>
                  <DialogDescription>
                    Upload from your computer or select from your asset library. Select up to 5 media items at a time.
                  </DialogDescription>
                </DialogHeader>

                <div className="flex gap-2 mb-4">
                  <Button
                    variant={mediaPickerTab === 'upload' ? 'appPrimary' : 'outline'}
                    onClick={() => setMediaPickerTab('upload')}
                    className="media-picker-tab-btn flex-1"
                  >
                    Upload from computer
                  </Button>
                  <Button
                    variant={mediaPickerTab === 'library' ? 'appPrimary' : 'outline'}
                    onClick={() => setMediaPickerTab('library')}
                    className="media-picker-tab-btn flex-1"
                  >
                    Choose from asset registry
                  </Button>
                </div>

                {mediaPickerTab === 'upload' ? (
                  <div
                    className="media-picker-upload-dropzone p-6 border-2 border-dashed rounded-lg bg-gray-50 text-center text-sm text-app-gray-700"
                    onClick={openFileDialog}
                  >
                    <UploadCloud className="h-10 w-10 mx-auto mb-3 text-app-iris" />
                    <p className="font-semibold">Select files to upload</p>
                    <p className="text-xs text-app-gray-500">Select up to 5 images or videos at a time</p>
                    <div className="mt-4">
                      <Button className="media-picker-upload-btn" variant="appPrimary" onClick={(e) => {
                        e.stopPropagation();
                        openFileDialog();
                      }}>
                        Choose files
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-[220px,1fr]">
                    <div className="media-picker-album-list space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {albums.length === 0 ? (
                        <div className="text-sm text-app-gray-600 bg-app-gray-50 border border-app-gray-100 rounded-md p-3">
                          No asset albums yet. Create one from the Asset Registry page.
                        </div>
                      ) : (
                        albums.map((album) => (
                          <button
                            key={album.id}
                            className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${selectedAlbumId === album.id
                              ? 'border-app-iris bg-app-iris/10 text-app-iris'
                              : 'border-app-gray-100 hover:border-app-iris/40'
                              }`}
                            onClick={() => setSelectedAlbumId(album.id)}
                          >
                            <div className="font-semibold text-sm">{album.name || 'Untitled album'}</div>
                            <div className="text-xs text-app-gray-500">{album.mediaCount || 0} assets</div>
                          </button>
                        ))
                      )}
                    </div>

                    <div className="media-picker-library-pane border border-app-gray-100 rounded-lg p-4 min-h-[260px] max-h-[400px] overflow-y-auto bg-white">
                      {loadingAlbums ? (
                        <div className="flex items-center justify-center h-full text-sm text-app-gray-600">Loading assets...</div>
                      ) : !selectedAlbumId ? (
                        <div className="text-sm text-app-gray-600">Select an album to view its assets.</div>
                      ) : albumMedia.length === 0 ? (
                        <div className="text-sm text-app-gray-600">No assets found in this album.</div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                          {albumMedia.map((asset) => {
                            const isSelected = selectedAssets.some(a => (a.storagePath || a.url) === (asset.storagePath || asset.url));
                            return (
                              <button
                                key={`${asset.storagePath || asset.url}`}
                                className={`relative rounded-lg overflow-hidden border-2 group transition-all ${isSelected
                                  ? 'border-app-iris bg-app-iris/10'
                                  : 'border-app-gray-100 hover:border-app-iris/60'
                                  }`}
                                onClick={() => toggleAssetSelection(asset)}
                              >
                                {asset.type === 'image' ? (
                                  <img src={asset.url} alt={asset.name} className="h-24 w-full object-cover" />
                                ) : (
                                  <video src={asset.url} className="h-24 w-full object-cover" />
                                )}
                                <div className={`absolute inset-0 transition-opacity flex items-center justify-center ${isSelected ? 'bg-app-iris/40' : 'bg-black/30 opacity-0 group-hover:opacity-100'
                                  }`}>
                                  {isSelected ? (
                                    <div className="bg-app-iris rounded-full p-1">
                                      <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                  ) : (
                                    <span className="text-xs font-semibold text-white">Select</span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {selectedAssets.length > 0 && (
                      <div className="mt-4 flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setSelectedAssets([])}
                          size="sm"
                        >
                          Clear Selection
                        </Button>
                        <Button
                          variant="appPrimary"
                          onClick={handleSaveSelectedAssets}
                          size="sm"
                        >
                          Add ({selectedAssets.length})
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </DialogContent>
            </Dialog>

            {/* AI Rewrite Preview Dialog */}
            <Dialog open={aiPreviewOpen} onOpenChange={setAiPreviewOpen}>
              <DialogContent className="max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100 p-6">
                <DialogHeader>
                  <DialogTitle>AI Rewrite Suggestion</DialogTitle>
                  <DialogDescription>
                    Here is the suggested rewrite. You can apply it or discard it.
                  </DialogDescription>
                </DialogHeader>

                <div className="bg-gray-50 p-4 rounded-md text-sm text-gray-800 max-h-[60vh] overflow-y-auto whitespace-pre-wrap">
                  {aiPreviewText}
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setAiPreviewOpen(false)}
                  >
                    Discard
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => applyRewrite('insert')}
                  >
                    Insert at Cursor
                  </Button>
                  <Button
                    variant="appPrimary"
                    onClick={() => applyRewrite('replace')}
                  >
                    Replace All
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Reflection Rewrite Preview Dialog */}
            <Dialog open={blockRewritePreviewOpen} onOpenChange={(open) => (open ? setBlockRewritePreviewOpen(true) : closeBlockRewritePreview())}>
              <DialogContent className="max-w-2xl bg-white rounded-2xl shadow-2xl border border-gray-100 p-6">
                <DialogHeader>
                  <DialogTitle>Reflection Rewrite Suggestion</DialogTitle>
                  <DialogDescription>
                    Apply this rewrite only to the selected reflection block.
                  </DialogDescription>
                </DialogHeader>

                <div className="bg-gray-50 p-4 rounded-md text-sm text-gray-800 max-h-[60vh] overflow-y-auto whitespace-pre-wrap">
                  {blockRewritePreviewText}
                </div>

                <div className="flex justify-end gap-2 mt-4">
                  {blockRewriteActions.includes('discard') && (
                    <Button
                      variant="outline"
                      onClick={() => applyBlockRewrite('discard')}
                      disabled={!!saveBusyField}
                    >
                      Discard
                    </Button>
                  )}
                  {blockRewriteActions.includes('insert') && (
                    <Button
                      variant="secondary"
                      onClick={() => applyBlockRewrite('insert')}
                      disabled={!!saveBusyField}
                    >
                      Insert
                    </Button>
                  )}
                  {blockRewriteActions.includes('replace') && (
                    <Button
                      variant="appPrimary"
                      onClick={() => applyBlockRewrite('replace')}
                      disabled={!!saveBusyField}
                    >
                      Replace
                    </Button>
                  )}
                </div>
              </DialogContent>
            </Dialog>

            {/* Upload Progress Indicator (shown only when uploading) */}
            {Object.keys(uploadProgress).length > 0 && (
              <div className="mb-4 p-3 bg-violet-50 border border-violet-200 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-violet-700 mb-2">
                  <UploadCloud className="h-4 w-4 animate-pulse" />
                  <span className="font-medium">Uploading...</span>
                </div>
                <div className="space-y-2">
                  {Object.entries(uploadProgress).map(([name, progress]) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="text-xs text-violet-600 truncate max-w-[150px]">{name}</span>
                      <div className="flex-1 bg-violet-200 rounded-full h-1.5">
                        <div
                          className="bg-violet-600 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-violet-500">{Math.round(progress)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Legacy Media Grid - Shows media from page.media[] (old format) */}
            {mediaList.length > 0 && !(isTemplatePage && isBabyTemplatePage) && (
              <div className="mb-4 p-3 border border-gray-200 rounded-lg bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">Attached Media</span>
                  <span className="text-xs text-gray-400">{mediaList.length} item(s)</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                  {mediaList.map((media, idx) => (
                    <div
                      key={media.storagePath || idx}
                      className="relative group aspect-square bg-gray-200 rounded-md overflow-hidden cursor-pointer"
                      onClick={() => openPreview(idx)}
                    >
                      {media.type === 'video' ? (
                        <video src={media.url} className="w-full h-full object-cover" />
                      ) : (
                        <img src={media.url} alt={media.name} className="w-full h-full object-cover" />
                      )}

                      <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center items-center text-white text-xs font-medium">
                        <span>Click to view</span>
                      </div>

                      {!readOnly && (
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-6 w-6"
                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMediaDelete(media);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes + controls */}
            <div className={`space-y-4 flex-grow flex flex-col ${isTemplatePage ? '' : 'h-full'}`}>
              <div className={`flex-grow flex flex-col ${isTemplatePage ? '' : 'h-full'}`}>
                <div className="flex items-center justify-between mb-1"></div>

                <div className={isTemplatePage ? '' : 'flex-grow h-full'}>
                  <div
                    ref={editorContainerRef}
                    className={isTemplatePage ? 'bg-transparent relative' : 'h-full bg-transparent overflow-hidden relative'}
                    onKeyDownCapture={handleKeyDownCapture}
                    onMouseDownCapture={() => {
                      logContentMeasure('editor mousedown');
                      requestAnimationFrame(() => logContentMeasure('editor mousedown raf'));
                    }}
                  >
                    {isTemplatePage ? (
                      <div className="flex flex-col relative">
                        <TemplatePage
                          template={template}
                          content={templateContent}
                          mediaItems={templateMedia}
                          onChange={handleTemplateChange}
                          onRewriteField={rewriteReflectionField}
                          onSaveField={saveReflectionField}
                          rewritePrompts={reflectionRewritePrompts}
                          onRewritePromptChange={handleReflectionRewritePromptChange}
                          rewriteBusyField={rewriteBusyField}
                          saveBusyField={saveBusyField}
                          pageSaving={isSaving}
                          onImageUpload={handleTemplateImageUpload}
                          onAddImages={handleTemplateAddImages}
                          onRemoveImage={handleTemplateRemoveImage}
                          onOpenMediaPicker={() => openMediaPicker(MEDIA_PICKER_CONTEXT_TEMPLATE)}
                          onOpenPreview={openPreview}
                          readOnly={readOnly}
                        />
                      </div>
                    ) : (
                      <>
                        {!readOnly && (
                          <GenerateImagePrompt
                            open={genImgOpen}
                            anchor={genImgAnchor}
                            prompt={genImgPrompt}
                            onPromptChange={setGenImgPrompt}
                            onCancel={closeGenImagePrompt}
                            onSubmit={submitGenImagePrompt}
                            inputRef={genImgInputRef}
                            useContext={genImgUseContext}
                            onUseContextChange={setGenImgUseContext}
                            isSubmitting={genImgLoading}
                          />
                        )}
                        <BlockEditor
                          key={page.id}
                          ref={quillRef}
                          initialBlocks={draft?.blocks}
                          initialContent={page.note || ""}
                          onBlocksChange={handleBlocksChange}
                          onSave={handleSave}
                          onFocus={() => {
                            logContentMeasure('editor focus');
                            requestAnimationFrame(() => logContentMeasure('editor focus raf'));
                            onFocus?.(page.id);
                          }}
                          onMediaRequest={handleMediaRequest}
                          onGenImageRequest={openGenImagePrompt}
                          readOnly={readOnly}
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Focus Trigger */}
              <div
                className="absolute inset-0 -z-10"
                onClick={() => onFocus && onFocus(page.id)}
              />
            </div>

            {/* Media Preview Overlay */}
            {previewOpen && previewItem && (
              <div
                className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
                onClick={closePreview}
              >
                <button
                  className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
                  onClick={closePreview}
                >
                  <X className="h-8 w-8" />
                </button>

                <button
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-all"
                  onClick={(e) => { e.stopPropagation(); goPrev(); }}
                >
                  <ChevronLeft className="h-8 w-8" />
                </button>

                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white p-2 rounded-full hover:bg-white/10 transition-all"
                  onClick={(e) => { e.stopPropagation(); goNext(); }}
                >
                  <ChevronRight className="h-8 w-8" />
                </button>

                <div className="relative max-w-5xl w-full max-h-[85vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                  {previewItem.type === 'video' ? (
                    <video src={previewItem.url} controls autoPlay className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" />
                  ) : (
                    <img src={previewItem.url} alt={previewItem.name} className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" />
                  )}
                  <div className="mt-4 text-white/80 text-sm font-medium">
                    {previewIndex + 1} / {mediaList.length}
                  </div>
                </div>
              </div>
            )}

            {/* Delete Confirmation Modal */}
            {!readOnly && (
              <ConfirmationModal
                isOpen={!!mediaToDelete}
                onClose={() => setMediaToDelete(null)}
                onConfirm={confirmMediaDelete}
                title="Delete Media"
                description="Are you sure you want to remove this media from the page? This cannot be undone."
              />
            )}

            {/* Page actions - Static Footer at bottom of page content */}
            {!readOnly && isBabyTemplatePage ? (
              <div className="mt-6 pb-8 w-full">
                <div className="template-save-pill mx-auto w-fit rounded-full border border-app-gray-200 bg-white/95 px-3 py-2 shadow-appSoft backdrop-blur">
                  {babyReflectionLimits.hasOverLimit && (
                    <div className="mb-2 text-center text-xs font-medium text-red-600">
                      Character limit exceeded for {babyReflectionLimits.overLimitFields.join(' and ')}.
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="appSuccess"
                      size="sm"
                      className="h-9 whitespace-nowrap min-w-[140px] rounded-full px-5"
                      onClick={handlePrimarySaveAction}
                      disabled={isSaving || babyReflectionLimits.hasOverLimit}
                    >
                      {saveButtonLabel}
                    </Button>
                  </div>
                </div>
              </div>
            ) : !readOnly && isResponsiveLayout ? (
              <div ref={toolbarRef} className="mt-8 pb-8 w-full relative z-20">
                <div className="editor-action-bar w-full flex flex-wrap items-center justify-between gap-3 px-2 py-3 rounded-2xl bg-gray-50/50 border border-gray-100">
                  <div className="flex items-center gap-2 flex-wrap flex-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => onRequestPageDelete?.(page, pageIndex)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="h-4 w-px bg-gray-200 mx-1" />

                    <div className="relative flex items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                        className="h-8 px-2 text-xs font-medium text-gray-600"
                      >
                        {aiModel}
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                      {showModelDropdown && (
                        <div className="editor-menu-popover absolute bottom-full left-0 mb-2 w-36 bg-white border rounded-md shadow-lg py-1 z-30">
                          {['gpt-4o'].map(model => (
                            <button
                              key={model}
                              onClick={() => {
                                setAiModel(model);
                                setShowModelDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                            >
                              {model}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <Input
                      value={aiStyle}
                      onChange={(e) => setAiStyle(e.target.value)}
                      placeholder="AI instruction..."
                      className="editor-ai-input h-8 w-28 sm:w-40 text-xs bg-white"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAiStyleDropdown(!showAiStyleDropdown)}
                      className="ml-1 h-8 px-2"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>

                    {showAiStyleDropdown && (
                      <div className="editor-menu-popover absolute bottom-full left-0 mb-2 w-48 bg-white border rounded-md shadow-lg py-1 z-30">
                        {['Improve clarity', 'Make it concise', 'Fix grammar', 'Expand this'].map(style => (
                          <button
                            key={style}
                            onClick={() => {
                              setAiStyle(style);
                              setShowAiStyleDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                          >
                            {style}
                          </button>
                        ))}
                      </div>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="editor-rewrite-btn h-8 whitespace-nowrap bg-white shadow-sm border border-gray-100"
                      onClick={() => callRewrite(aiStyle)}
                      disabled={aiBusy}
                    >
                      <Sparkles className="h-4 w-4 mr-1 text-app-iris" />
                      Rewrite
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    {pageIndex < totalPages - 1 ? (
                      <Button
                        variant="appSuccess"
                        size="sm"
                        className="editor-save-btn h-8 whitespace-nowrap min-w-[110px]"
                        onClick={handleSave}
                      >
                        Save Page
                      </Button>
                    ) : (
                      <Button
                        variant="appSuccess"
                        size="sm"
                        className="editor-save-btn h-8 whitespace-nowrap min-w-[110px]"
                        onClick={async () => {
                          await handleSave();
                          onAddPage?.(true, '', page.id);
                        }}
                      >
                        Save + New
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : !readOnly ? (
              <div className="editor-action-bar editor-action-bar-floating absolute bottom-0 left-0 right-0 mx-auto rounded-full border border-gray-200 bg-white/95 px-4 py-2 shadow-sm opacity-0 translate-y-3 transition-all duration-200 pointer-events-none group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto z-20 w-[calc(100%-2rem)] mb-2">
                <div className="flex items-center gap-2 w-full">
                  <div className="relative flex items-center gap-2 min-w-0 flex-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-red-500 hover:text-red-600 hover:bg-red-50"
                      onClick={() => onRequestPageDelete?.(page, pageIndex)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="relative flex items-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                        className="h-8 px-2 text-xs"
                      >
                        {aiModel}
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                      {showModelDropdown && (
                        <div className="editor-menu-popover absolute bottom-full left-0 mb-2 w-36 bg-white border rounded-md shadow-lg py-1 z-30">
                          {['gpt-4o'].map(model => (
                            <button
                              key={model}
                              onClick={() => {
                                setAiModel(model);
                                setShowModelDropdown(false);
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                            >
                              {model}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Input
                      value={aiStyle}
                      onChange={(e) => setAiStyle(e.target.value)}
                      placeholder="AI instruction..."
                      className="editor-ai-input h-8 w-28 sm:w-40 md:w-56 text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAiStyleDropdown(!showAiStyleDropdown)}
                      className="ml-1 h-8 px-2"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>

                    {showAiStyleDropdown && (
                      <div className="editor-menu-popover absolute bottom-full right-0 mb-2 w-48 bg-white border rounded-md shadow-lg py-1 z-30">
                        {['Improve clarity', 'Make it concise', 'Fix grammar', 'Expand this'].map(style => (
                          <button
                            key={style}
                            onClick={() => {
                              setAiStyle(style);
                              setShowAiStyleDropdown(false);
                            }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50"
                          >
                            {style}
                          </button>
                        ))}
                      </div>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="editor-rewrite-btn h-8 whitespace-nowrap"
                      onClick={() => callRewrite(aiStyle)}
                      disabled={aiBusy}
                    >
                      <Sparkles className="h-4 w-4 mr-1" />
                      Rewrite
                    </Button>
                  </div>
                  {/* CSS Override to prevent Editor from scrolling internally. 
                      We want the page to be a FIXED viewport where content overflows 
                      (and is caught by our reflow logic), rather than a scrollable window. 
                  */}
                  <style>{`
                    .bn-editor {
                      overflow: visible !important; 
                      height: 100% !important;
                    }
                    .bn-block-outer {
                      /* Ensure blocks don't trap scroll either */
                    }
                    /* Hide scrollbars just in case */
                    ::-webkit-scrollbar {
                      width: 0px;
                      background: transparent;
                    }
                  `}</style>
                  {pageIndex < totalPages - 1 ? (
                    <Button
                      variant="appSuccess"
                      size="sm"
                      className="editor-save-btn h-8 whitespace-nowrap min-w-[110px]"
                      onClick={handleSave}
                    >
                      Save Page
                    </Button>
                  ) : (
                    <Button
                      variant="appSuccess"
                      size="sm"
                      className="editor-save-btn h-8 whitespace-nowrap min-w-[110px]"
                      onClick={async () => {
                        await handleSave();
                        onAddPage?.(true, '', page.id);
                      }}
                    >
                      Save + New
                    </Button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});

export default PageEditor;
