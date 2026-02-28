import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, Check, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { collabApi, getCallableErrorMessage } from '@/services/collabApi';
import { useToast } from '@/components/ui/use-toast';

const PAGE_SIZE = 25;

const formatDateTime = (value) => {
  if (!value) return 'Unknown time';
  try {
    return new Date(value).toLocaleString();
  } catch (_) {
    return 'Unknown time';
  }
};

const Notifications = () => {
  const { appUser } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [bookFilter, setBookFilter] = useState('all');
  const [actingInviteId, setActingInviteId] = useState(null);

  const books = useMemo(() => {
    const source = Array.isArray(appUser?.accessibleBookIds) ? appUser.accessibleBookIds : [];
    return source
      .map((entry) => {
        if (typeof entry === 'string') {
          return { id: entry, title: 'Untitled Book' };
        }
        return { id: entry.bookId, title: entry.title || 'Untitled Book' };
      })
      .filter((entry) => !!entry.id);
  }, [appUser?.accessibleBookIds]);

  const loadNotifications = useCallback(async ({ reset = false, cursorId = null } = {}) => {
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const payload = {
        pageSize: PAGE_SIZE,
        ...(reset || !cursorId ? {} : { cursorId }),
        ...(typeFilter === 'all' ? {} : { type: typeFilter }),
        ...(bookFilter === 'all' ? {} : { bookId: bookFilter }),
      };
      const result = await collabApi.listNotifications(payload);
      const notifications = Array.isArray(result?.notifications) ? result.notifications : [];
      setItems((prev) => (reset ? notifications : [...prev, ...notifications]));
      setNextCursor(result?.nextCursor || null);
    } catch (error) {
      toast({
        title: 'Notifications',
        description: getCallableErrorMessage(error, 'Failed to load notifications.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [bookFilter, toast, typeFilter]);

  useEffect(() => {
    setNextCursor(null);
    loadNotifications({ reset: true, cursorId: null });
  }, [typeFilter, bookFilter, loadNotifications]);

  const handleAction = async (inviteId, action) => {
    setActingInviteId(inviteId);
    try {
      await collabApi.respondCoAuthorInvite({ inviteId, action });
      setItems((prev) => prev.filter((item) => item.inviteId !== inviteId));
      toast({
        title: action === 'accept' ? 'Invite accepted' : 'Invite declined',
      });
    } catch (error) {
      toast({
        title: 'Action failed',
        description: getCallableErrorMessage(error, 'Could not update invitation.'),
        variant: 'destructive',
      });
    } finally {
      setActingInviteId(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">Review collaboration requests and updates.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All types</option>
            <option value="coauthor_invite">Co-author invites</option>
          </select>
          <select
            className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
            value={bookFilter}
            onChange={(e) => setBookFilter(e.target.value)}
          >
            <option value="all">All books</option>
            {books.map((book) => (
              <option key={book.id} value={book.id}>{book.title}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Loading notifications...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            <Bell className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-foreground">No notifications</p>
          <p className="text-xs text-muted-foreground mt-1">You are all caught up.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    {item.ownerName || 'Book owner'} invited you to co-author
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Book: <span className="text-foreground">{item.bookTitle || 'Untitled Book'}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Received {formatDateTime(item.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={actingInviteId === item.inviteId}
                    onClick={() => handleAction(item.inviteId, 'decline')}
                    className="gap-1"
                  >
                    <X className="h-3.5 w-3.5" />
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    disabled={actingInviteId === item.inviteId}
                    onClick={() => handleAction(item.inviteId, 'accept')}
                    className="gap-1"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Accept
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {nextCursor && !loading && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => loadNotifications({ reset: false, cursorId: nextCursor })}
            disabled={loadingMore}
          >
            {loadingMore ? 'Loading...' : 'Load more'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default Notifications;
