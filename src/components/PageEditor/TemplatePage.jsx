import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { templateService } from '@/services/TemplateService';
import SectionTitle from './templates/sections/SectionTitle';
import SectionDate from './templates/sections/SectionDate';
import SectionImage from './templates/sections/SectionImage';
import SectionQA from './templates/sections/SectionQA';

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
  onChange,
  onImageUpload,
  readOnly = false,
}) => {
  const [uploadingId, setUploadingId] = useState(null);

  const theme = template?.theme || {};
  const themeClass = themePresets[theme.bg] || themePresets['soft-peach'];
  const fontClass = fontPresets[theme.font] || fontPresets.serif;

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
        return (
          <SectionQA
            key={section.id}
            section={section}
            value={fieldValue}
            onChange={(val) => updateField(section.field, val)}
            readOnly={readOnly}
            themeClass={themeClass}
          />
        );
      default:
        return null;
    }
  };

  const layout = useMemo(() => {
    if (!template?.type) return { header: [], hero: [], bottom: [] };
    return templateService.getLayoutSections(template.type);
  }, [template?.type]);

  return (
    <div
      className={cn(
        'rounded-3xl border shadow-appCard p-6 sm:p-8',
        themeClass.pageBg,
        themeClass.card,
        fontClass
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3 flex-1">
          <div className={cn('inline-flex items-center gap-2 rounded-pill px-3 py-1 text-xs font-semibold shadow-appSoft', themeClass.chip)}>
            <span>{template?.type || 'template'}</span>
            <span className="h-1.5 w-1.5 rounded-full bg-app-iris" />
            <span>{template?.templateVersion || 'v1'}</span>
          </div>
          {layout.header.filter((s) => s.type !== 'date').map(renderSection)}
        </div>
        <div className="w-full sm:w-56 space-y-3">
          {layout.header.filter((s) => s.type === 'date').map(renderSection)}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          {layout.hero.map(renderSection)}
        </div>
        <div className="lg:col-span-1 space-y-4">
          <div className={cn('rounded-2xl border p-4 shadow-appSoft text-sm text-app-gray-600', themeClass.accentBorder)}>
            <div className="text-xs uppercase tracking-wide text-app-gray-500 mb-2">Template notes</div>
            <p>Photo first, then the parent reflections. Layout stays locked so pages feel consistent.</p>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {layout.bottom.map(renderSection)}
      </div>
    </div>
  );
};

export default TemplatePage;
