import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const GenerateImagePrompt = ({
  open,
  anchor,
  prompt,
  onPromptChange,
  onCancel,
  onSubmit,
  inputRef,
  useContext,
  onUseContextChange,
  isSubmitting = false
}) => {
  if (!open) return null;

  return (
    <div
      className="absolute z-40"
      style={{ left: `${anchor.left}px`, top: `${anchor.top}px` }}
    >
      <div className="w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-2xl backdrop-blur">
        <div className="text-xs text-gray-500 mb-2">Generate image</div>
        <Input
          ref={inputRef}
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          placeholder="Describe the image you want to generate"
          className="h-9"
          disabled={isSubmitting}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <label className="mt-3 flex items-start gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-app-iris focus:ring-app-iris"
            checked={useContext}
            disabled={isSubmitting}
            onChange={(event) => onUseContextChange(event.target.checked)}
          />
          <span>
            Based on page context
            <span className="block text-[11px] text-gray-500">
              Use the current page text to guide the image.
            </span>
          </span>
        </label>
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Generating…' : 'Generate'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GenerateImagePrompt;
