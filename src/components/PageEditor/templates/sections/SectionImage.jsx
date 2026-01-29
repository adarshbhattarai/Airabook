import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Image as ImageIcon } from 'lucide-react';

const SectionImage = ({ section, value, onChange, readOnly, onImageUpload, isUploading, themeClass }) => {
    const fileInputRef = useRef(null);

    const handleFileSelect = (event) => {
        const file = event.target.files?.[0];
        if (file) {
            onImageUpload(section, file);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div key={section.id} className="space-y-2">
            <label className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide">
                {section.label}
            </label>
            <div
                className={cn(
                    'relative rounded-2xl border border-dashed overflow-hidden shadow-appSoft',
                    themeClass.accentBorder,
                    'bg-white/80',
                    section.aspect === '4/5' ? 'aspect-[4/5]' : 'aspect-square'
                )}
            >
                {value ? (
                    <img src={value} alt={section.label} className="h-full w-full object-cover" />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 text-app-gray-600">
                        <ImageIcon className="h-8 w-8 text-app-iris mb-2" />
                        <p className="font-medium">Add a centerpiece photo</p>
                        <p className="text-xs text-app-gray-600">Drop or upload a 4:5 image.</p>
                    </div>
                )}

                {!readOnly && (
                    <div className="absolute inset-0 bg-gradient-to-t from-app-gray-900/20 via-app-gray-900/5 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end justify-center pb-4">
                        <Button
                            type="button"
                            variant="secondary"
                            className="bg-white/90 hover:bg-white"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                        >
                            {isUploading ? 'Uploading...' : (value ? 'Replace photo' : 'Upload photo')}
                        </Button>
                    </div>
                )}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                />
            </div>
        </div>
    );
};

export default SectionImage;
