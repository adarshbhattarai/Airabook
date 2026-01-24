import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const SectionQA = ({ section, value, onChange, readOnly, themeClass }) => {
    return (
        <div
            key={section.id}
            className={cn(
                'rounded-2xl border bg-white/90 shadow-appSoft p-4 space-y-2',
                themeClass.accentBorder
            )}
        >
            <div className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide">
                {section.question || section.label}
            </div>
            <div className={cn('text-sm font-semibold', themeClass.accentText)}>{section.label}</div>
            <Textarea
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={section.placeholder}
                readOnly={readOnly}
                rows={5}
                className="bg-white/70"
            />
        </div>
    );
};

export default SectionQA;
