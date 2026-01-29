import React from 'react';
import { Input } from '@/components/ui/input';
import { Calendar } from 'lucide-react';

const SectionDate = ({ section, value, onChange, readOnly }) => {
    return (
        <div key={section.id} className="space-y-2">
            <label className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide">
                {section.label}
            </label>
            <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-app-iris" />
                <Input
                    type="date"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    readOnly={readOnly}
                    className="bg-white/80 border border-app-gray-100 shadow-appSoft"
                />
            </div>
        </div>
    );
};

export default SectionDate;
