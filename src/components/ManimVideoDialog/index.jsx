import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Clapperboard, Loader2 } from 'lucide-react';

const QUALITY_OPTIONS = [
  { value: 'low', label: 'Low', description: 'Fast preview (~30s)' },
  { value: 'medium', label: 'Medium', description: 'Balanced (~2min)' },
  { value: 'high', label: 'High', description: 'Full quality (~5min)' },
];

/**
 * Dialog shown before generating a Manim video clip for a page.
 * Collects optional instruction text and render quality, then confirms.
 *
 * Props:
 *   open           - boolean, controls visibility
 *   onOpenChange   - (open: boolean) => void
 *   defaultInstruction - string, pre-filled from page content/AI style
 *   loading        - boolean, shows spinner while job is being created
 *   onConfirm      - ({ instruction: string, quality: string }) => void
 */
export default function ManimVideoDialog({
  open,
  onOpenChange,
  defaultInstruction = '',
  loading = false,
  onConfirm,
}) {
  const [instruction, setInstruction] = useState(defaultInstruction);
  const [quality, setQuality] = useState('low');

  // Sync instruction when dialog opens with new page context
  useEffect(() => {
    if (open) {
      setInstruction(defaultInstruction);
      setQuality('low');
    }
  }, [open, defaultInstruction]);

  const handleConfirm = () => {
    onConfirm?.({ instruction: instruction.trim(), quality });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        data-testid="manim-video-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-indigo-500" />
            Generate a page video
          </DialogTitle>
          <DialogDescription>
            The AI will create an animated Manim video for this page.
            Add any style or focus notes, or leave blank to use the page content.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Instruction */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700" htmlFor="manim-instruction">
              Instruction <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <Textarea
              id="manim-instruction"
              data-testid="manim-video-instruction"
              placeholder="e.g. Focus on the geometry concepts, use blue tones…"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              rows={3}
              disabled={loading}
              className="resize-none text-sm"
            />
          </div>

          {/* Quality */}
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700">Render quality</p>
            <div className="grid grid-cols-3 gap-2" data-testid="manim-video-quality-selector">
              {QUALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  data-testid={`manim-quality-${opt.value}`}
                  onClick={() => setQuality(opt.value)}
                  disabled={loading}
                  className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                    quality === opt.value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange?.(false)}
            disabled={loading}
            data-testid="manim-video-cancel"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading}
            data-testid="manim-video-confirm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</>
              : <><Clapperboard className="h-4 w-4 mr-2" />Generate clip</>
            }
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
