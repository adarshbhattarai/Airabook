import React, { useState } from 'react';
import TemplatePage from '@/components/PageEditor/TemplatePage';
import { templateService } from '@/services/TemplateService';

const BabyJournalPreview = () => {
  const templateType = 'babyJournalPage';
  const template = templateService.getTemplate(templateType);

  const [content, setContent] = useState({
    ...templateService.getDefaultContent(templateType),
    title: 'Week 1: First giggles',
    date: new Date().toISOString().slice(0, 10),
    dadNotes: 'We spent the afternoon napping together and you smiled in your sleep.',
    momNotes: 'You held my finger so tight today. Tiny moments I never want to forget.',
    imageUrl: 'https://images.unsplash.com/photo-1503453363464-743ee9ce1584?auto=format&fit=crop&w=900&q=80',
  });

  return (
    <div className="p-6 sm:p-10 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Baby Journal Template</h1>
            <p className="text-sm text-gray-600">Rendered from {template?.type} ({template?.templateVersion})</p>
          </div>
        </div>

        <TemplatePage
          template={template}
          content={content}
          onChange={setContent}
          onImageUpload={async (file) => {
            const previewUrl = URL.createObjectURL(file);
            // No actual upload in preview, just local blob
            return previewUrl;
          }}
        />
      </div>
    </div>
  );
};

export default BabyJournalPreview;
