import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const GenerateImagePrompt = ({
  open,
  prompt,
  onPromptChange,
  onCancel,
  onSubmit,
  inputRef,
  useContext,
  onUseContextChange,
  isSubmitting = false
}) => {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent
        overlayClassName="bg-black/45 backdrop-blur-[2px]"
        className="matrix-surface matrix-neon-outline mx-auto w-full max-w-3xl rounded-3xl border-2 border-border bg-card/95 p-7 text-foreground shadow-[0_32px_100px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:p-8"
      >
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-2xl">Generate image</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Describe the image you want to generate.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <Input
            ref={inputRef}
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="Describe the image you want to generate"
            className="h-14 text-base"
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
          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-input bg-background text-app-iris focus:ring-app-iris"
              checked={useContext}
              disabled={isSubmitting}
              onChange={(event) => onUseContextChange(event.target.checked)}
            />
            <span>
              Based on page context
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Use the current page text to guide the image.
              </span>
            </span>
          </label>
          <div className="flex items-center justify-end gap-3 pt-1">
            <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant="appPrimary" onClick={onSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Generating…' : 'Generate'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default GenerateImagePrompt;
