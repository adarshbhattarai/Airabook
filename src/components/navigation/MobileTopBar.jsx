import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Menu, LogOut, User, Bell, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { collabApi, getCallableErrorMessage } from '@/services/collabApi';
import { useToast } from '@/components/ui/use-toast';

const profileMenuItems = [
  {
    label: 'Profile Settings',
    icon: User,
    action: 'settings',
  },
  {
    label: 'Log out',
    icon: LogOut,
    action: 'logout',
  },
];

const MobileTopBar = ({ onMenuClick }) => {
  const navigate = useNavigate();
  const { user, appUser, logout } = useAuth();
  const { toast } = useToast();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationItems, setNotificationItems] = useState([]);
  const [notificationLoading, setNotificationLoading] = useState(false);
  const [actingInviteId, setActingInviteId] = useState(null);
  const profileMenuRef = useRef(null);
  const notificationsRef = useRef(null);

  const displayName = appUser?.displayName || user?.displayName || 'You';
  const pendingInvitesCount = Math.max(0, Number(appUser?.notificationCounters?.pendingInvites || 0));
  const badgeLabel = pendingInvitesCount > 99 ? '99+' : String(pendingInvitesCount);

  useEffect(() => {
    if (!showProfileMenu && !showNotifications) return;

    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showProfileMenu, showNotifications]);

  const handleMenuAction = async (action) => {
    if (action === 'settings') {
      navigate('/settings');
    }

    if (action === 'logout') {
      await logout();
      navigate('/');
    }

    setShowProfileMenu(false);
  };

  const loadNotifications = useCallback(async () => {
    setNotificationLoading(true);
    try {
      const result = await collabApi.listNotifications({ pageSize: 10 });
      setNotificationItems(Array.isArray(result?.notifications) ? result.notifications : []);
    } catch (error) {
      toast({
        title: 'Notifications',
        description: getCallableErrorMessage(error, 'Failed to load notifications.'),
        variant: 'destructive',
      });
    } finally {
      setNotificationLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!showNotifications) return;
    loadNotifications();
  }, [showNotifications, loadNotifications]);

  const handleInviteAction = async (inviteId, action) => {
    setActingInviteId(inviteId);
    try {
      await collabApi.respondCoAuthorInvite({ inviteId, action });
      setNotificationItems((prev) => prev.filter((item) => item.inviteId !== inviteId));
      toast({ title: action === 'accept' ? 'Invite accepted' : 'Invite declined' });
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
    <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card/90 backdrop-blur-sm text-foreground relative z-30">
      <button
        type="button"
        onClick={onMenuClick}
        className="inline-flex items-center justify-center rounded-xl border border-border bg-background text-foreground h-9 w-9 shadow-appSoft"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="relative flex items-center gap-2">
        <div className="relative" ref={notificationsRef}>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9 relative"
            onClick={() => setShowNotifications((prev) => !prev)}
          >
            <Bell className="h-4 w-4" />
            {pendingInvitesCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] leading-[18px] px-1 text-center font-semibold">
                {badgeLabel}
              </span>
            )}
          </Button>
          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-xl shadow-appCard z-50">
              <div className="px-3 py-2 border-b border-border/70 flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Notifications</p>
                <span className="text-xs text-muted-foreground">{pendingInvitesCount} pending</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notificationLoading ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">Loading...</p>
                ) : notificationItems.length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No notifications</p>
                ) : (
                  <div className="divide-y divide-border/60">
                    {notificationItems.map((item) => (
                      <div key={item.id} className="px-3 py-3 space-y-2">
                        <p className="text-xs text-foreground">
                          <span className="font-semibold">{item.ownerName || 'Book owner'}</span> invited you to co-author{' '}
                          <span className="font-semibold">{item.bookTitle || 'Untitled Book'}</span>.
                        </p>
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1"
                            disabled={actingInviteId === item.inviteId}
                            onClick={() => handleInviteAction(item.inviteId, 'decline')}
                          >
                            <X className="h-3 w-3" />
                            Decline
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs gap-1"
                            disabled={actingInviteId === item.inviteId}
                            onClick={() => handleInviteAction(item.inviteId, 'accept')}
                          >
                            <Check className="h-3 w-3" />
                            Accept
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-3 py-2 border-t border-border/70">
                <Button
                  variant="outline"
                  className="w-full h-8 text-xs"
                  onClick={() => {
                    navigate('/notifications');
                    setShowNotifications(false);
                  }}
                >
                  View all notifications
                </Button>
              </div>
            </div>
          )}
        </div>

      <div className="relative flex items-center gap-2" ref={profileMenuRef}>
        <div className="flex flex-col items-end">
          <span className="text-xs font-medium text-muted-foreground">Airäbook</span>
          <span className="text-sm font-semibold text-foreground">{displayName}</span>
        </div>
        <button
          type="button"
          onClick={() => setShowProfileMenu((prev) => !prev)}
          className="app-avatar-fallback relative h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold border border-border/70 hover:border-primary/60 transition-colors"
          aria-label="Open profile menu"
        >
          {displayName.charAt(0).toUpperCase()}
        </button>

        {showProfileMenu && (
          <div
            className="absolute right-0 top-full mt-2 w-52 bg-card border border-border rounded-xl shadow-appCard text-left py-2 z-50"
            role="menu"
          >
            <div className="px-4 py-3 border-b border-border/70">
              <p className="text-sm font-semibold text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{appUser?.email || user?.email || ''}</p>
            </div>

            <div className="py-1">
              {profileMenuItems.map(({ label, icon: Icon, action }) => (
                <button
                  key={action}
                  onClick={() => handleMenuAction(action)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors',
                    action === 'logout' && 'text-destructive hover:text-destructive hover:bg-destructive/10',
                  )}
                  role="menuitem"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    </header>
  );
};

export default MobileTopBar;
