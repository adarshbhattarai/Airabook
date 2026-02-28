import React, { useEffect, useRef, useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertCircle, ChevronDown, Save, Sparkles } from 'lucide-react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const SectionQA = ({
    section,
    value,
    onChange,
    readOnly,
    themeClass,
    variant = 'default',
    rewritePrompt = '',
    onRewritePromptChange,
    onRewrite,
    rewriteBusy = false,
    canRewrite = false,
    rewriteOptions = ['Improve clarity', 'Make it concise', 'Fix grammar', 'Expand this', 'Translate to Nepali'],
    onSave,
    saveBusy = false,
    canSave = false,
    maxChars = null,
}) => {
    const isLinedJournal = variant === 'lined-journal';
    const useRichEditor = isLinedJournal && canRewrite;
    const [showRewriteDropdown, setShowRewriteDropdown] = useState(false);
    const dropdownRef = useRef(null);
    const quillModules = {
        toolbar: [
            ['bold', 'italic', 'underline'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            [{ color: [] }, { background: [] }],
            ['clean'],
        ],
    };
    const quillFormats = ['bold', 'italic', 'underline', 'list', 'bullet', 'color', 'background'];
    const normalizedHtmlValue = (() => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (/<[a-z][\s\S]*>/i.test(raw)) return raw;
        return `<p>${raw.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p>`;
    })();
    const hasMaxChars = Number.isFinite(maxChars) && maxChars > 0;
    const toPlainText = (rawValue) => {
        const input = String(rawValue || '');
        if (!/<[a-z][\s\S]*>/i.test(input)) return input;
        if (typeof document === 'undefined') {
            return input.replace(/<[^>]*>/g, '');
        }
        const parser = document.createElement('div');
        parser.innerHTML = input;
        return parser.textContent || parser.innerText || '';
    };
    const getCharCount = (rawValue) => toPlainText(rawValue).length;
    const currentCount = getCharCount(value || '');
    const isOverLimit = hasMaxChars && currentCount > maxChars;
    const handleEditorChange = (nextValue) => {
        onChange(nextValue);
    };

    useEffect(() => {
        if (!showRewriteDropdown) return undefined;
        const handleClickOutside = (event) => {
            if (!dropdownRef.current?.contains(event.target)) {
                setShowRewriteDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showRewriteDropdown]);

    return (
        <div
            key={section.id}
            className={cn(
                'rounded-2xl border bg-white/90 shadow-appSoft template-qa-card',
                themeClass.accentBorder
            )}
        >
            {isLinedJournal ? (
                <>
                    <div className="rounded-t-2xl border-b border-app-gray-100 bg-app-gray-50/80 px-4 py-3">
                        <div className="text-xs font-semibold text-app-gray-600 uppercase tracking-wide">
                            {section.question || section.label}
                        </div>
                        <div className={cn('text-sm font-semibold mt-1', themeClass.accentText)}>{section.label}</div>
                    </div>
                    <div className="px-4 py-3">
                        {useRichEditor ? (
                            readOnly ? (
                                <div className="rounded-xl border border-app-gray-100 bg-white/75 px-3 py-2 min-h-[170px] template-qa-editor-shell">
                                    <div
                                        className="reflection-rich-view text-app-gray-800 break-words"
                                        dangerouslySetInnerHTML={{ __html: normalizedHtmlValue || '<p></p>' }}
                                    />
                                </div>
                            ) : (
                                <div className="reflection-quill rounded-xl border border-app-gray-100 bg-white/80 template-qa-editor-shell">
                                    <ReactQuill
                                        className="reflection-quill-editor min-h-[200px]"
                                        theme="snow"
                                        value={normalizedHtmlValue}
                                        onChange={(next) => handleEditorChange(next)}
                                        modules={quillModules}
                                        formats={quillFormats}
                                        readOnly={readOnly}
                                        placeholder={section.placeholder}
                                    />
                                </div>
                            )
                        ) : (
                            <Textarea
                                value={value || ''}
                                onChange={(e) => handleEditorChange(e.target.value)}
                                placeholder={section.placeholder}
                                readOnly={readOnly}
                                rows={7}
                                className="border-app-gray-100 bg-transparent leading-7"
                                style={{
                                    backgroundImage: 'repeating-linear-gradient(to bottom, rgba(148, 163, 184, 0) 0px, rgba(148, 163, 184, 0) 27px, rgba(148, 163, 184, 0.35) 28px)',
                                }}
                            />
                        )}
                    </div>
                    <div className="rounded-b-2xl border-t border-app-gray-100 bg-app-gray-50/70 px-4 py-2 text-[11px] text-app-gray-500 flex items-center justify-between">
                        <span>{section.guidance || 'Keep it short and heartfelt.'}</span>
                        {hasMaxChars && (
                            <span className="inline-flex items-center gap-2">
                                {isOverLimit && (
                                    <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                                        <AlertCircle className="h-3.5 w-3.5" />
                                        Over by {currentCount - maxChars}
                                    </span>
                                )}
                                <span className={cn(
                                    'tabular-nums',
                                    currentCount >= maxChars
                                        ? 'text-red-600'
                                        : (currentCount >= Math.floor(maxChars * 0.9) ? 'text-amber-600' : 'text-app-gray-500')
                                )}
                                >
                                    {currentCount}/{maxChars}
                                </span>
                            </span>
                        )}
                    </div>
                    {canRewrite && !readOnly && (
                        <div className="rounded-b-2xl border-t border-app-gray-100 bg-white px-4 py-3 template-qa-actions">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <Input
                                    value={rewritePrompt}
                                    onChange={(e) => onRewritePromptChange?.(e.target.value)}
                                    placeholder="Rewrite instruction (e.g., translate to Nepali, improve clarity)"
                                    className="h-9 text-sm bg-white template-page-input"
                                />
                                <div className="relative" ref={dropdownRef}>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="h-9 px-3"
                                        onClick={() => setShowRewriteDropdown((prev) => !prev)}
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                    {showRewriteDropdown && (
                                        <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-md border border-app-gray-200 bg-white shadow-lg py-1 template-qa-dropdown">
                                            {rewriteOptions.map((option) => (
                                                <button
                                                    key={option}
                                                    type="button"
                                                    className="w-full text-left px-3 py-2 text-xs hover:bg-app-gray-50"
                                                    onClick={() => {
                                                        onRewritePromptChange?.(option);
                                                        setShowRewriteDropdown(false);
                                                    }}
                                                >
                                                    {option}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="template-reflection-rewrite-btn h-9 whitespace-nowrap rounded-pill px-4"
                                    onClick={() => onRewrite?.(rewritePrompt)}
                                    disabled={rewriteBusy || saveBusy}
                                >
                                    <Sparkles className="h-4 w-4 mr-1 text-app-iris" />
                                    {rewriteBusy ? 'Rewriting...' : 'Rewrite'}
                                </Button>
                                {canSave && (
                                    <Button
                                        type="button"
                                        variant="appSuccess"
                                        size="sm"
                                        className="template-reflection-save-btn h-9 whitespace-nowrap rounded-pill px-4"
                                        onClick={() => onSave?.()}
                                        disabled={saveBusy || rewriteBusy || isOverLimit}
                                    >
                                        <Save className="h-4 w-4 mr-1" />
                                        {saveBusy ? 'Saving...' : 'Save'}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="p-4 space-y-2">
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
                        className="bg-white/70 template-page-input"
                    />
                    {canRewrite && !readOnly && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Input
                                value={rewritePrompt}
                                onChange={(e) => onRewritePromptChange?.(e.target.value)}
                                placeholder="Rewrite instruction"
                                className="h-9 text-sm bg-white template-page-input"
                            />
                            <div className="relative" ref={dropdownRef}>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-9 px-3"
                                    onClick={() => setShowRewriteDropdown((prev) => !prev)}
                                >
                                    <ChevronDown className="h-4 w-4" />
                                </Button>
                                {showRewriteDropdown && (
                                    <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-md border border-app-gray-200 bg-white shadow-lg py-1 template-qa-dropdown">
                                        {rewriteOptions.map((option) => (
                                            <button
                                                key={option}
                                                type="button"
                                                className="w-full text-left px-3 py-2 text-xs hover:bg-app-gray-50"
                                                onClick={() => {
                                                    onRewritePromptChange?.(option);
                                                    setShowRewriteDropdown(false);
                                                }}
                                            >
                                                {option}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="template-reflection-rewrite-btn h-9 whitespace-nowrap rounded-pill px-4"
                                onClick={() => onRewrite?.(rewritePrompt)}
                                disabled={rewriteBusy || saveBusy}
                            >
                                <Sparkles className="h-4 w-4 mr-1 text-app-iris" />
                                {rewriteBusy ? 'Rewriting...' : 'Rewrite'}
                            </Button>
                            {canSave && (
                                <Button
                                    type="button"
                                    variant="appSuccess"
                                    size="sm"
                                    className="template-reflection-save-btn h-9 whitespace-nowrap rounded-pill px-4"
                                    onClick={() => onSave?.()}
                                    disabled={saveBusy || rewriteBusy || isOverLimit}
                                >
                                    <Save className="h-4 w-4 mr-1" />
                                    {saveBusy ? 'Saving...' : 'Save'}
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SectionQA;
