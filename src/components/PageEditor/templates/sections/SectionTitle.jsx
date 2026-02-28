import React from 'react';
import { Input } from '@/components/ui/input';

const SectionTitle = ({ section, value, onChange, readOnly }) => {
    return (
        <div key={section.id} className="space-y-2">
            <label className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide">
                {section.label}
            </label>
            <Input
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                placeholder={section.placeholder}
                readOnly={readOnly}
                className="text-2xl sm:text-3xl font-semibold bg-white/90 border border-app-gray-300 shadow-appSoft focus-visible:ring-2 focus-visible:ring-app-iris/30 template-page-input"
            />
            {section.helperText && (
                <p className="text-xs text-app-gray-600">{section.helperText}</p>
            )}
        </div>
    );
};

export default SectionTitle;
