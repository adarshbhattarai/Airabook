import React from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Info,
  ListTree,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { buildUiActionStateKey } from '@/lib/chatUiEvents';
import { convertToEmulatorURL } from '@/lib/pageUtils';

const cardMeta = {
  LIMIT_REACHED: {
    title: 'Limit reached',
    icon: AlertTriangle,
    shell: 'border-amber-300 bg-amber-50 text-amber-950',
    subtitle: 'Upgrade your plan or free up existing resources.',
  },
  HITL_REQUEST: {
    title: 'Approval needed',
    icon: ShieldAlert,
    shell: 'border-blue-300 bg-blue-50 text-blue-950',
    subtitle: 'Choose an option so the workflow can continue.',
  },
  APPROVAL_REQUIRED: {
    title: 'Approval required',
    icon: ShieldAlert,
    shell: 'border-rose-300 bg-rose-50 text-rose-950',
    subtitle: 'A write action is paused and waiting for your decision.',
  },
  BOOK_CREATE_RESULT: {
    title: 'Book created',
    icon: BookOpen,
    shell: 'border-emerald-300 bg-emerald-50 text-emerald-950',
    subtitle: 'Your new book is ready.',
  },
  BOOK_LIST: {
    title: 'Books',
    icon: ListTree,
    shell: 'border-indigo-300 bg-indigo-50 text-indigo-950',
    subtitle: 'Available books in your account.',
  },
  PAGE_CONTENT_RESULT: {
    title: 'Page content',
    icon: FileText,
    shell: 'border-sky-300 bg-sky-50 text-sky-950',
    subtitle: 'Requested page details.',
  },
  MEDIA_RESULT: {
    title: 'Media',
    icon: ImageIcon,
    shell: 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-950',
    subtitle: 'Requested media assets.',
  },
  PLANNER_SUMMARY: {
    title: 'Planner summary',
    icon: ListTree,
    shell: 'border-cyan-300 bg-cyan-50 text-cyan-950',
    subtitle: 'Planner execution summary.',
  },
  BOOK_DELETE_RESULT: {
    title: 'Book deleted',
    icon: Trash2,
    shell: 'border-red-300 bg-red-50 text-red-950',
    subtitle: 'Book deletion completed.',
  },
};

const formatLimitValue = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
};

const asArray = (value) => (Array.isArray(value) ? value : []);
const asString = (value) => (value === null || value === undefined ? '' : String(value));

const ActionButtons = ({
  card,
  actionState = {},
  onAction,
}) => {
  if (!Array.isArray(card.actions) || card.actions.length === 0) return null;
  return (
    <div className="mt-3 border-t border-current/20 pt-2">
      <div className="mb-1 text-[10px] uppercase tracking-wide font-semibold opacity-80">Actions</div>
      <div className="flex flex-wrap gap-2">
        {card.actions.map((action, index) => {
          const actionId = action?.id || `action_${index + 1}`;
          const actionKey = buildUiActionStateKey(card.id, actionId);
          const state = actionState[actionKey];
          const isPending = state?.status === 'pending';
          const isSuccess = state?.status === 'success';
          const isError = state?.status === 'error';
          return (
            <div key={actionKey} className="space-y-1">
              <Button
                type="button"
                size="sm"
                variant={(action.kind === 'primary' || index === 0) ? 'appPrimary' : 'appOutline'}
                className="h-7 px-2 text-[11px]"
                disabled={isPending}
                onClick={() => onAction?.(card, action)}
              >
                {isPending ? 'Working...' : (action.label || actionId)}
              </Button>
              {state?.message ? (
                <div
                  className={`text-[11px] ${
                    isSuccess ? 'text-emerald-700' : (isError ? 'text-red-700' : 'text-muted-foreground')
                  }`}
                >
                  {state.message}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const HitlOptions = ({
  card,
  actionState = {},
  onDecision,
}) => {
  const options = Array.isArray(card?.payload?.options) ? card.payload.options : [];
  if (options.length === 0) return null;
  return (
    <div className="mt-3 grid gap-2">
      {options.map((option, index) => {
        const optionId = option?.id || `${index + 1}`;
        const actionKey = buildUiActionStateKey(card.id, optionId);
        const state = actionState[actionKey];
        const isPending = state?.status === 'pending';
        return (
          <div key={actionKey} className="space-y-1">
            <Button
              type="button"
              size="sm"
              variant={option?.recommended ? 'appPrimary' : 'outline'}
              className="h-auto justify-start py-2 px-2 text-[11px]"
              disabled={isPending}
              onClick={() => onDecision?.(card, option, index)}
            >
              {isPending ? 'Submitting...' : option.label}
            </Button>
            {state?.message ? (
              <div className={`text-[11px] ${state?.status === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
                {state.message}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

const LimitDetails = ({ payload = {} }) => (
  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
    <div className="rounded-md border border-amber-200 bg-white px-2 py-1">
      <div className="text-amber-700">Type</div>
      <div className="font-medium text-amber-900">{formatLimitValue(payload.limitType)}</div>
    </div>
    <div className="rounded-md border border-amber-200 bg-white px-2 py-1">
      <div className="text-amber-700">Plan</div>
      <div className="font-medium text-amber-900">{formatLimitValue(payload.planTier)}</div>
    </div>
    <div className="rounded-md border border-amber-200 bg-white px-2 py-1">
      <div className="text-amber-700">Current</div>
      <div className="font-medium text-amber-900">{formatLimitValue(payload.currentCount)}</div>
    </div>
    <div className="rounded-md border border-amber-200 bg-white px-2 py-1">
      <div className="text-amber-700">Allowed</div>
      <div className="font-medium text-amber-900">{formatLimitValue(payload.maxAllowed)}</div>
    </div>
    {payload.blockedOperation ? (
      <div className="col-span-2 rounded-md border border-amber-200 bg-white px-2 py-1">
        <div className="text-amber-700">Blocked operation</div>
        <div className="font-medium text-amber-900">{formatLimitValue(payload.blockedOperation)}</div>
      </div>
    ) : null}
  </div>
);

const ApprovalDetails = ({ payload = {} }) => (
  <div className="mt-2 space-y-1 text-[11px]">
    <div><span className="font-semibold">Operation:</span> {asString(payload.operation || payload.blockedOperation || '-') || '-'}</div>
    {payload.bookId ? <div><span className="font-semibold">Book:</span> {payload.bookId}</div> : null}
    {payload.chapterId ? <div><span className="font-semibold">Chapter:</span> {payload.chapterId}</div> : null}
    {payload.pageId ? <div><span className="font-semibold">Page:</span> {payload.pageId}</div> : null}
    {payload.reason ? <div><span className="font-semibold">Reason:</span> {payload.reason}</div> : null}
    {payload.expiresAt ? <div><span className="font-semibold">Expires:</span> {payload.expiresAt}</div> : null}
  </div>
);

const BookCreateDetails = ({ payload = {} }) => {
  const chapterIds = asArray(payload.createdChapterIds);
  return (
    <div className="mt-2 space-y-1 text-[11px]">
      <div><span className="font-semibold">Title:</span> {asString(payload.title || 'Untitled Book')}</div>
      <div><span className="font-semibold">Book ID:</span> {asString(payload.bookId || '-')}</div>
      <div><span className="font-semibold">Created chapters:</span> {payload.createdChapterCount ?? chapterIds.length}</div>
      {chapterIds.length > 0 ? (
        <ul className="list-disc pl-4 space-y-0.5">
          {chapterIds.map((chapterId, index) => (
            <li key={`${chapterId}-${index}`} className="break-all">{asString(chapterId)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

const BookListDetails = ({ payload = {} }) => {
  const books = asArray(payload.books);
  if (books.length === 0) {
    return <div className="mt-2 text-[11px] opacity-80">No books found.</div>;
  }
  return (
    <ul className="mt-2 list-disc pl-4 space-y-1 text-[11px]">
      {books.map((book, index) => {
        const id = asString(book?.bookId || book?.id || '');
        const title = asString(book?.title || book?.babyName || 'Untitled Book');
        return (
          <li key={`${id || title}-${index}`}>
            <span className="font-medium">{title}</span>
            {id ? <span className="opacity-80"> ({id})</span> : null}
          </li>
        );
      })}
    </ul>
  );
};

const PageContentDetails = ({ payload = {} }) => {
  const title = asString(payload.pageTitle || payload.title || '');
  const content = asString(payload.content || payload.plainText || payload.message || '');
  return (
    <div className="mt-2 space-y-1 text-[11px]">
      {title ? <div><span className="font-semibold">Title:</span> {title}</div> : null}
      {payload.pageId ? <div><span className="font-semibold">Page ID:</span> {payload.pageId}</div> : null}
      {content ? (
        <div className="rounded border border-current/20 bg-white/60 p-2 whitespace-pre-wrap max-h-48 overflow-y-auto">
          {content}
        </div>
      ) : null}
    </div>
  );
};

const MediaDetails = ({ payload = {} }) => {
  const items = asArray(payload.items || payload.media || payload.assets);
  if (items.length === 0) {
    return <div className="mt-2 text-[11px] opacity-80">No media items found.</div>;
  }
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {items.slice(0, 8).map((item, index) => {
        const url = convertToEmulatorURL(asString(item?.thumbnailUrl || item?.url || item?.imageUrl || ''));
        const label = asString(item?.name || item?.title || item?.storagePath || `Item ${index + 1}`);
        const type = asString(item?.type || '').toLowerCase();
        return (
          <div key={`${label}-${index}`} className="rounded border border-current/20 bg-white/70 p-1">
            {url ? (
              type.includes('video') ? (
                <video src={url} className="h-20 w-full rounded object-cover" controls preload="metadata" />
              ) : (
                <img src={url} alt={label} className="h-20 w-full rounded object-cover" />
              )
            ) : (
              <div className="h-20 w-full rounded bg-white flex items-center justify-center text-[10px] opacity-70">No preview</div>
            )}
            <div className="mt-1 truncate text-[10px]">{label}</div>
          </div>
        );
      })}
    </div>
  );
};

const PlannerSummaryDetails = ({ payload = {} }) => {
  const warnings = asArray(payload.warnings);
  const summary = asString(payload.summary || payload.message || '');
  return (
    <div className="mt-2 space-y-1 text-[11px]">
      {summary ? <div className="whitespace-pre-wrap">{summary}</div> : null}
      {warnings.length > 0 ? (
        <div>
          <div className="font-semibold">Warnings</div>
          <ul className="list-disc pl-4 space-y-0.5">
            {warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{asString(warning)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

const BookDeleteDetails = ({ payload = {} }) => (
  <div className="mt-2 space-y-1 text-[11px]">
    {payload.title ? <div><span className="font-semibold">Title:</span> {payload.title}</div> : null}
    {payload.bookId ? <div><span className="font-semibold">Book ID:</span> {payload.bookId}</div> : null}
    {payload.summary ? <div className="whitespace-pre-wrap">{payload.summary}</div> : null}
  </div>
);

const StreamUiCards = ({
  cards = [],
  actionState = {},
  onAction,
  onDecision,
}) => {
  if (!Array.isArray(cards) || cards.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      {cards.map((card, index) => {
        const cardType = String(card?.cardType || '').toUpperCase();
        const meta = cardMeta[cardType] || {
          title: cardType || 'Notice',
          icon: Info,
          shell: 'border-app-gray-200 bg-app-gray-50 text-app-gray-900',
          subtitle: '',
        };
        const Icon = meta.icon;
        const payload = card?.payload || {};

        return (
          <div key={card.id || `${cardType}-${index}`} className={`rounded-lg border px-3 py-2 text-xs ${meta.shell}`}>
            <div className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5" />
              <div className="font-semibold uppercase tracking-wide text-[10px]">{meta.title}</div>
            </div>
            <div className="mt-1 text-[12px] leading-relaxed">
              {payload.message || payload.question || meta.subtitle || 'Action required.'}
            </div>

            {cardType === 'LIMIT_REACHED' ? <LimitDetails payload={payload} /> : null}
            {cardType === 'HITL_REQUEST' ? (
              <div className="mt-1 text-[11px] text-blue-800">
                {payload.subtitle || (payload.timeoutSec ? `Timeout: ${payload.timeoutSec}s` : '')}
              </div>
            ) : null}
            {cardType === 'APPROVAL_REQUIRED' ? <ApprovalDetails payload={payload} /> : null}
            {cardType === 'BOOK_CREATE_RESULT' ? <BookCreateDetails payload={payload} /> : null}
            {cardType === 'BOOK_LIST' ? <BookListDetails payload={payload} /> : null}
            {cardType === 'PAGE_CONTENT_RESULT' ? <PageContentDetails payload={payload} /> : null}
            {cardType === 'MEDIA_RESULT' ? <MediaDetails payload={payload} /> : null}
            {cardType === 'PLANNER_SUMMARY' ? <PlannerSummaryDetails payload={payload} /> : null}
            {cardType === 'BOOK_DELETE_RESULT' ? <BookDeleteDetails payload={payload} /> : null}

            <ActionButtons card={card} actionState={actionState} onAction={onAction} />
            {cardType === 'HITL_REQUEST'
              ? <HitlOptions card={card} actionState={actionState} onDecision={onDecision} />
              : null}

            {payload?.acknowledged ? (
              <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />
                Acknowledged
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default StreamUiCards;
