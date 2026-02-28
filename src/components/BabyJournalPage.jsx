import React, { useMemo, useRef } from 'react';
import { babyJournalTemplateV1 } from '@/constants/pageTemplates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Calendar, Image as ImageIcon, Sparkles } from 'lucide-react';

const themePresets = {
  'soft-peach': {
    bgGradient: 'from-amber-50 via-rose-50 to-orange-50',
    card: 'bg-white/80 border-amber-100',
    accentText: 'text-teal-800',
    accentBorder: 'border-teal-200',
    chip: 'bg-white/80 text-amber-700 border border-amber-100',
  },
};

const fontPresets = {
  serif: 'font-serif',
  sans: 'font-sans',
};

const NoteCard = ({ label, placeholder, value, onChange, accentClass, readOnly }) => (
  <div className={cn('rounded-2xl border bg-white/90 shadow-sm p-4 space-y-2', accentClass)}>
    <div className="flex items-center justify-between">
      <span className="text-sm font-semibold text-gray-800">{label}</span>
      <Sparkles className="h-4 w-4 text-amber-500" />
    </div>
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={5}
      readOnly={readOnly}
      className="bg-white/60"
    />
  </div>
);

const BabyJournalPage = ({
  content = {},
  theme = babyJournalTemplateV1.theme,
  readOnly = false,
  onChange,
  onImageSelect,
}) => {
  const mergedContent = useMemo(
    () => ({
      ...babyJournalTemplateV1.defaults,
      ...(content || {}),
    }),
    [content],
  );

  const preset = themePresets[theme?.bg] || themePresets['soft-peach'];
  const fontClass = fontPresets[theme?.font] || fontPresets.serif;
  const fileInputRef = useRef(null);

  const handleFieldChange = (field, value) => {
    const next = { ...mergedContent, [field]: value };
    onChange?.(next);
  };

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      const localUrl = URL.createObjectURL(file);
      handleFieldChange('imageUrl', localUrl);
      onImageSelect?.(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formattedDate = useMemo(() => {
    if (!mergedContent.date) return '';
    const dateObj = new Date(mergedContent.date);
    if (Number.isNaN(dateObj.getTime())) return mergedContent.date;
    return dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }, [mergedContent.date]);

  return (
    <div
      className={cn(
        'rounded-3xl shadow-2xl overflow-hidden border border-amber-100/70',
        'bg-gradient-to-b p-6 sm:p-8',
        preset.bgGradient,
        fontClass,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className={cn('inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold shadow-sm', preset.chip)}>
            <span>Baby Journal</span>
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span>v1</span>
          </div>
          <Input
            value={mergedContent.title}
            onChange={(e) => handleFieldChange('title', e.target.value)}
            placeholder="Give this page a name"
            readOnly={readOnly}
            className="text-2xl sm:text-3xl font-semibold bg-white/70 border-none shadow-inner focus-visible:ring-2 focus-visible:ring-amber-200"
          />
          <p className="text-sm text-gray-600 max-w-xl">
            Drop in a daily memory: a center photo, then Dad and Mom reflections lined up underneath to keep every page consistent.
          </p>
        </div>
        <div className="flex flex-col gap-2 items-start sm:items-end min-w-[200px]">
          <div className="text-xs uppercase tracking-wide text-gray-500">Date</div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-amber-500" />
            <Input
              type="date"
              value={mergedContent.date}
              onChange={(e) => handleFieldChange('date', e.target.value)}
              readOnly={readOnly}
              className="w-full min-w-[180px] bg-white/80 border border-amber-100 shadow-inner"
            />
          </div>
          {formattedDate && (
            <span className="text-xs text-amber-700 bg-white/70 rounded-full px-3 py-1 border border-amber-100 shadow-sm">
              {formattedDate}
            </span>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div
            className={cn(
              'relative aspect-[4/5] rounded-3xl border border-dashed',
              preset.accentBorder,
              'bg-white/70 shadow-inner overflow-hidden',
            )}
          >
            {mergedContent.imageUrl ? (
              <img
                src={mergedContent.imageUrl}
                alt="Baby journal visual"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 text-gray-500">
                <ImageIcon className="h-10 w-10 text-amber-400 mb-3" />
                <p className="font-semibold text-gray-700">Add a centerpiece photo</p>
                <p className="text-sm text-gray-500">Square or 4:5 works best. Keeps pages aligned.</p>
              </div>
            )}

            {!readOnly && (
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-black/10 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
                <Button
                  variant="secondary"
                  className="bg-white/90 text-gray-800 hover:bg-white"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImageIcon className="h-4 w-4 mr-2" />
                  {mergedContent.imageUrl ? 'Replace photo' : 'Upload photo'}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1 space-y-3">
          <div className={cn('rounded-2xl p-4 shadow-sm backdrop-blur bg-white/80 border', preset.accentBorder)}>
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Template</div>
            <div className={cn('text-base font-semibold', preset.accentText)}>Baby Journal</div>
            <p className="text-sm text-gray-600 mt-1">
              Locked layout: photo on top, Dad and Mom notes below. Theme colors come from the template.
            </p>
          </div>
          <div className={cn('rounded-2xl p-4 shadow-sm bg-white/80 border', preset.accentBorder)}>
            <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">Tips</div>
            <ul className="space-y-2 text-sm text-gray-600 list-disc list-inside">
              <li>Keep text concise so pages stay tidy.</li>
              <li>Use the same aspect ratio for photos.</li>
              <li>Titles + dates auto-carry the theme.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <NoteCard
          label="Dad"
          value={mergedContent.dadNotes}
          onChange={(val) => handleFieldChange('dadNotes', val)}
          placeholder="Today we discovered..."
          accentClass="border-amber-100"
          readOnly={readOnly}
        />
        <NoteCard
          label="Mom"
          value={mergedContent.momNotes}
          onChange={(val) => handleFieldChange('momNotes', val)}
          placeholder="I want to remember..."
          accentClass="border-amber-100"
          readOnly={readOnly}
        />
      </div>
    </div>
  );
};

export default BabyJournalPage;
