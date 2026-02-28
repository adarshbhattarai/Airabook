import React, { useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { templateService } from '@/services/TemplateService';
import SectionTitle from './templates/sections/SectionTitle';
import SectionDate from './templates/sections/SectionDate';
import SectionImage from './templates/sections/SectionImage';
import SectionQA from './templates/sections/SectionQA';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, Upload, Trash2, Video } from 'lucide-react';

const MAX_TEMPLATE_MEDIA = 5;

const themePresets = {
  'soft-peach': {
    pageBg: 'bg-gradient-to-br from-app-gray-50 via-white to-app-gray-100',
    card: 'bg-white/90 border-app-gray-100',
    accentText: 'text-app-iris',
    accentBorder: 'border-app-iris/20',
    chip: 'bg-white/80 text-app-gray-600 border border-app-gray-100',
  },
};

const fontPresets = {
  serif: 'font-serif',
  sans: 'font-sans',
};

const TemplatePage = ({
  template,
  content,
  mediaItems = [],
  onChange,
  onRewriteField,
  onSaveField,
  rewritePrompts = {},
  onRewritePromptChange,
  rewriteBusyField = '',
  saveBusyField = '',
  pageSaving = false,
  onImageUpload,
  onAddImages,
  onRemoveImage,
  onOpenMediaPicker,
  onOpenPreview,
  readOnly = false,
}) => {
  const [uploadingId, setUploadingId] = useState(null);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const fileInputRef = useRef(null);

  const theme = template?.theme || {};
  const themeClass = themePresets[theme.bg] || themePresets['soft-peach'];
  const fontClass = fontPresets[theme.font] || fontPresets.serif;
  const isBabyTemplate = template?.type === 'babyJournalPage';

  const updateField = (field, value) => {
    onChange?.({ ...(content || {}), [field]: value });
  };

  const handleImageUpload = async (section, file) => {
    if (!file || !onImageUpload) return;
    setUploadingId(section.id);
    try {
      const url = await onImageUpload(file);
      if (url) {
        updateField(section.field, url);
      }
    } finally {
      setUploadingId(null);
    }
  };

  const renderSection = (section) => {
    if (!section) return null;
    const fieldValue = content?.[section.field];

    switch (section.type) {
      case 'title':
        return (
          <SectionTitle
            key={section.id}
            section={section}
            value={fieldValue}
            onChange={(val) => updateField(section.field, val)}
            readOnly={readOnly}
          />
        );
      case 'date':
        return (
          <SectionDate
            key={section.id}
            section={section}
            value={fieldValue}
            onChange={(val) => updateField(section.field, val)}
            readOnly={readOnly}
          />
        );
      case 'image':
        return (
          <SectionImage
            key={section.id}
            section={section}
            value={fieldValue}
            onChange={(val) => updateField(section.field, val)}
            readOnly={readOnly}
            onImageUpload={handleImageUpload}
            isUploading={uploadingId === section.id}
            themeClass={themeClass}
          />
        );
      case 'qa':
        {
          const isReflectionField = section.field === 'dadNotes' || section.field === 'momNotes';
        return (
          <SectionQA
            key={section.id}
            section={section}
            value={fieldValue}
            onChange={(val) => updateField(section.field, val)}
            readOnly={readOnly}
            themeClass={themeClass}
            variant={isBabyTemplate ? 'lined-journal' : 'default'}
            canRewrite={isReflectionField && typeof onRewriteField === 'function'}
            canSave={isReflectionField && typeof onSaveField === 'function'}
            rewritePrompt={rewritePrompts?.[section.field] || ''}
            rewriteBusy={rewriteBusyField === section.field}
            saveBusy={pageSaving || saveBusyField === section.field}
            maxChars={isReflectionField ? 500 : null}
            onRewritePromptChange={(value) => onRewritePromptChange?.(section.field, value)}
            onRewrite={(prompt) => onRewriteField?.(section.field, prompt)}
            onSave={() => onSaveField?.(section.field)}
          />
        );
        }
      default:
        return null;
    }
  };

  const layout = useMemo(() => {
    if (!template?.type) return { header: [], hero: [], bottom: [] };
    return templateService.getLayoutSections(template.type);
  }, [template?.type]);

  const heroImageSection = useMemo(
    () => layout.hero.find((section) => section?.type === 'image'),
    [layout.hero],
  );

  const nonImageHeroSections = useMemo(
    () => layout.hero.filter((section) => section?.type !== 'image'),
    [layout.hero],
  );

  const galleryItems = useMemo(
    () => (Array.isArray(mediaItems) ? mediaItems.filter((item) => item?.url).slice(0, MAX_TEMPLATE_MEDIA) : []),
    [mediaItems],
  );

  const galleryGridClass = galleryItems.length === 1
    ? 'max-w-md mx-auto'
    : galleryItems.length === 2
      ? 'grid grid-cols-2 gap-3'
      : 'grid grid-cols-2 md:grid-cols-3 gap-3';

  const handleAddMedia = async (event) => {
    if (readOnly) return;
    const files = Array.from(event.target.files || []);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (files.length === 0 || !onAddImages) return;

    const remainingSlots = Math.max(0, MAX_TEMPLATE_MEDIA - galleryItems.length);
    if (remainingSlots === 0) return;

    setGalleryUploading(true);
    try {
      await onAddImages(files.slice(0, remainingSlots));
    } finally {
      setGalleryUploading(false);
    }
  };

  return (
    <div
      className={cn(
        'rounded-3xl border shadow-appCard p-6 sm:p-8 template-page-canvas template-page-shell',
        themeClass.pageBg,
        themeClass.card,
        fontClass
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3 flex-1">
          {layout.header.filter((s) => s.type !== 'date').map(renderSection)}
        </div>
        <div className="w-full sm:w-56 space-y-3">
          {layout.header.filter((s) => s.type === 'date').map(renderSection)}
        </div>
      </div>

      <div className={cn('mt-6 rounded-2xl border p-4 sm:p-5 template-page-section', themeClass.accentBorder)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-app-gray-500">Media section</div>
            <p className="text-sm text-app-gray-700">Add up to 5 photos or videos for this page. Tap any item to enlarge.</p>
          </div>
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (typeof onOpenMediaPicker === 'function') {
                  onOpenMediaPicker();
                  return;
                }
                fileInputRef.current?.click();
              }}
              disabled={galleryUploading || galleryItems.length >= MAX_TEMPLATE_MEDIA}
              className="whitespace-nowrap"
            >
              <Upload className="h-4 w-4 mr-2" />
              {galleryUploading ? 'Uploading...' : 'Add media'}
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={handleAddMedia}
          />
        </div>

        <div className="mt-4">
          {galleryItems.length === 0 ? (
            <div
              className={cn(
                'rounded-2xl border border-dashed p-8 text-center bg-white/70 template-media-empty',
                themeClass.accentBorder
              )}
            >
              <ImageIcon className="h-9 w-9 mx-auto text-app-iris mb-2" />
              <p className="text-sm font-semibold text-app-gray-700">No media yet</p>
              <p className="text-xs text-app-gray-500 mt-1">Your page photos and videos will show here.</p>
            </div>
          ) : (
            <div className={galleryGridClass}>
              {galleryItems.map((mediaItem, index) => (
                <div
                  key={mediaItem.storagePath || mediaItem.url || index}
                  className={cn(
                    'group/media-card relative overflow-hidden rounded-2xl border bg-white shadow-appSoft template-media-card',
                    themeClass.accentBorder,
                    galleryItems.length === 1 ? 'aspect-[4/5]' : 'aspect-square'
                  )}
                >
                  <button
                    type="button"
                    className="h-full w-full"
                    onClick={() => onOpenPreview?.(index)}
                  >
                    {mediaItem.type === 'video' ? (
                      <div className="relative h-full w-full">
                        <video
                          src={mediaItem.url}
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
                      <img src={mediaItem.url} alt={mediaItem.name || `Media ${index + 1}`} className="h-full w-full object-cover" />
                    )}
                  </button>
                  {mediaItem.isLegacyFallback && (
                    <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-app-gray-600">
                      Legacy
                    </span>
                  )}
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute right-2 top-2 h-7 w-7 opacity-0 transition-opacity group-hover/media-card:opacity-100 focus-visible:opacity-100"
                      onClick={() => onRemoveImage?.(mediaItem)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {nonImageHeroSections.map(renderSection)}
        {!isBabyTemplate && heroImageSection && renderSection(heroImageSection)}
      </div>

      <div className={cn('mt-6 rounded-2xl border p-4 sm:p-5 template-page-section', themeClass.accentBorder)}>
        <div className="text-xs uppercase tracking-wide text-app-gray-500 mb-3">Parent reflections</div>
        <p className="text-sm text-app-gray-700 mb-3">Capture one meaningful moment: what happened, how your baby responded, and how it made you feel.</p>
        <div className="flex flex-col gap-4">
          {layout.bottom.map(renderSection)}
        </div>
      </div>
    </div>
  );
};

export default TemplatePage;
