import React from 'react';
import PreviewCard from '@/components/app/PreviewCard';

const BookCardPreview = ({ title, subtitle }) => {
  const trimmedTitle = (title || '').trim();
  const displayTitle = trimmedTitle || 'Your new book';
  const initial = (trimmedTitle.charAt(0) || 'A').toUpperCase();

  return (
    <PreviewCard>
      <div className="w-full max-w-sm bg-white/70 backdrop-blur rounded-2xl shadow-appSoft border border-white/50 p-4 md:p-5 relative overflow-hidden">
        {/* Vibrant gradient background layers (like Stripe) */}
        <div className="absolute inset-0 opacity-70">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-purple-300 via-pink-300 to-transparent rounded-full blur-3xl transform translate-x-20 -translate-y-20" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-gradient-to-tr from-blue-300 via-violet-300 to-transparent rounded-full blur-3xl transform -translate-x-20 translate-y-20" />
          <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-gradient-to-br from-pink-200 to-transparent rounded-full blur-2xl transform -translate-x-1/2 -translate-y-1/2" />
        </div>

        {/* Content layer */}
        <div className="relative z-10">
          {/* Top row: avatar + title */}
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-8 rounded-xl bg-app-mint text-app-navy flex items-center justify-center text-sm font-semibold shadow-sm">
              {initial}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-app-gray-900">
                {displayTitle}
              </span>
              <span className="mt-0.5 inline-flex items-center rounded-full bg-white/70 px-2 py-0.5 text-[11px] text-app-gray-600 shadow-sm">
                • Journey on Airäbook
              </span>
            </div>
          </div>

          {/* Optional subtitle */}
          {subtitle && (
            <p className="mt-1 text-xs text-app-gray-600 line-clamp-2">
              {subtitle}
            </p>
          )}

          {/* "Empty book" body with colorful gradient - taller for book proportion */}
          <div className="mt-4 h-64 md:h-80 rounded-xl bg-gradient-to-br from-purple-100/80 via-pink-100/60 to-blue-100/70 border border-white/50 backdrop-blur-sm shadow-inner" />
        </div>
      </div>
    </PreviewCard>
  );
};

export default BookCardPreview;


