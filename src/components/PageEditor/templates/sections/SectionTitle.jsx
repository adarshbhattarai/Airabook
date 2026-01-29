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
                className="text-2xl sm:text-3xl font-semibold bg-white/80 border border-app-gray-100 shadow-appSoft focus-visible:ring-2 focus-visible:ring-app-iris/30"
            />
        </div>
    );
};

export default SectionTitle;
