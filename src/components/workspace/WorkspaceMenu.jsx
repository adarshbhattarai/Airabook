import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, Loader2, LogOut, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useWorkspaceMenu } from '@/hooks/useWorkspaceMenu';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuPortal, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const menuClass = 'w-72 max-w-[calc(100vw-2rem)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto rounded-xl border border-border bg-card p-2 text-foreground shadow-xl';
const itemClass = 'gap-3 rounded-lg px-3 py-2.5 focus:bg-muted';

const DestinationItems = ({ menu, onSelected, disabled = false }) => (
  <>
    {menu.loading && <div role="status" className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading workspaces…</div>}
    {menu.error && <div role="alert" className="px-3 py-2 text-xs text-rose-600">{menu.error}</div>}
    {menu.error && <DropdownMenuItem className={itemClass} disabled={!!menu.busy || disabled} onSelect={(event) => { event.preventDefault(); menu.load(); }}>Try again</DropdownMenuItem>}
    {!menu.loading && menu.destinations.map((destination) => {
      const active = String(menu.selectedId) === String(destination.id);
      const Icon = destination.type === 'ENTERPRISE' ? Building2 : destination.type === 'ADMIN' ? ShieldCheck : User;
      return <DropdownMenuItem key={destination.id} role="menuitemradio" aria-checked={active}
        className={`${itemClass} ${active ? 'bg-muted font-medium' : ''}`} disabled={!!menu.busy || disabled}
        onSelect={(event) => { event.preventDefault(); menu.select(destination.id, onSelected); }}>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${destination.type === 'ENTERPRISE' ? 'bg-sky-100 text-sky-700' : destination.type === 'ADMIN' ? 'bg-indigo-100 text-indigo-700' : 'bg-violet-100 text-violet-700'}`}><Icon aria-hidden="true" className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1 break-words">{destination.label}</span>
        {active && <Check aria-hidden="true" className="h-4 w-4 shrink-0" />}
      </DropdownMenuItem>;
    })}
    {!menu.loading && !menu.error && !menu.destinations.length && <p className="px-3 py-3 text-xs text-muted-foreground">No active workspaces available.</p>}
  </>
);

/** Standalone switch buttons use the same destinations as the profile submenu. */
export const WorkspaceSwitcher = ({ mode = 'personal', account, children, onSelected }) => {
  const [open, setOpen] = useState(false);
  const menu = useWorkspaceMenu({ mode, account });
  return <DropdownMenu open={open} onOpenChange={(next) => { setOpen(next); if (next && !menu.busy) menu.load(); }}>
    <DropdownMenuTrigger asChild>{children || <button type="button" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"><Building2 className="h-4 w-4" />Switch workspace</button>}</DropdownMenuTrigger>
    <DropdownMenuContent className={menuClass} collisionPadding={12}>
      <DropdownMenuLabel className="text-xs text-muted-foreground">Switch workspace</DropdownMenuLabel>
      <DestinationItems menu={menu} onSelected={() => { setOpen(false); onSelected?.(); }} />
    </DropdownMenuContent>
  </DropdownMenu>;
};

/** Shared profile menu across Personal, Enterprise, and platform administration. */
export const WorkspaceProfileMenu = ({ mode = 'personal', account }) => {
  const { user, appUser, logout } = useAuth();
  const navigate = useNavigate();
  const menu = useWorkspaceMenu({ mode, account });
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const name = appUser?.displayName || user?.displayName || 'Your account';
  const email = appUser?.email || user?.email || '';

  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const signOut = async () => {
    setLoggingOut(true);
    setLogoutError('');
    try { await logout(); setOpen(false); navigate('/v2/personal-login', { replace: true }); }
    catch (error) { setLogoutError(error.message || 'Unable to sign out. Please try again.'); }
    finally { setLoggingOut(false); }
  };
  const close = () => setOpen(false);

  return <DropdownMenu open={open} onOpenChange={(next) => {
    setOpen(next); setExpanded(false); setLogoutError(''); if (next && !menu.busy) menu.load();
  }}>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label="Open profile menu" disabled={loggingOut}
        className="flex shrink-0 items-center gap-2 rounded-full p-1 pr-2 text-foreground transition hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        {user?.photoURL ? <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full object-cover" />
          : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-app-iris text-sm font-semibold text-white">{name.charAt(0).toUpperCase()}</span>}
        <span className="hidden max-w-28 truncate text-sm font-medium sm:block">{name}</span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className={menuClass} collisionPadding={12}>
      <DropdownMenuLabel className="px-3 py-3"><span className="block text-sm font-semibold">{name}</span><span className="mt-1 block truncate text-xs font-normal text-muted-foreground">{email}</span></DropdownMenuLabel>
      <DropdownMenuSeparator />
      {compact ? <>
        <DropdownMenuItem className={itemClass} aria-expanded={expanded} onSelect={(event) => { event.preventDefault(); setExpanded((value) => !value); }}>
          <Building2 className="h-4 w-4" /><span><span className="block">Switch workspace</span><span className="block text-xs text-muted-foreground">{menu.currentLabel}</span></span>
        </DropdownMenuItem>
        {expanded && <DestinationItems menu={menu} onSelected={close} disabled={loggingOut} />}
      </> : <DropdownMenuSub open={expanded} onOpenChange={(next) => {
        // Once opened, keep this popover stable across async loading/error/retry
        // resizing. Selection, outside click, Escape, or ArrowLeft dismiss it.
        if (next) setExpanded(true);
      }}>
        <DropdownMenuSubTrigger className={itemClass} disabled={!!menu.busy || loggingOut}><Building2 className="h-4 w-4" /><span className="min-w-0 flex-1"><span className="block">Switch workspace</span><span className="block truncate text-xs text-muted-foreground">{menu.currentLabel}</span></span></DropdownMenuSubTrigger>
        <DropdownMenuPortal><DropdownMenuSubContent className={menuClass} collisionPadding={12} sideOffset={6} onEscapeKeyDown={close} onKeyDown={(event) => { if (event.key === 'ArrowLeft') setExpanded(false); }}><DropdownMenuLabel className="truncate px-3 text-xs font-normal text-muted-foreground">{email}</DropdownMenuLabel><DestinationItems menu={menu} onSelected={close} disabled={loggingOut} /></DropdownMenuSubContent></DropdownMenuPortal>
      </DropdownMenuSub>}
      {mode === 'personal' && <DropdownMenuItem className={itemClass} onSelect={() => navigate('/settings')} disabled={!!menu.busy || loggingOut}><User className="h-4 w-4" />Profile Settings</DropdownMenuItem>}
      <DropdownMenuSeparator />
      {logoutError && <p role="alert" className="px-3 py-2 text-xs text-rose-600">{logoutError}</p>}
      <DropdownMenuItem className={`${itemClass} text-rose-600 focus:text-rose-600`} disabled={!!menu.busy || loggingOut}
        onSelect={(event) => { event.preventDefault(); signOut(); }}><LogOut className="h-4 w-4" />{loggingOut ? 'Signing out…' : 'Sign out'}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
};
