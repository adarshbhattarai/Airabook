import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  BookOpen,
  Image as ImageIcon,
  Heart,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

const sections = [
  {
    label: 'Main',
    items: [
      { name: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
      { name: 'Books', icon: BookOpen, to: '/books' },
      { name: 'Memory Library', icon: ImageIcon, to: '/media' },
      // { name: 'Notes', icon: StickyNote, to: '/notes' },
    ],
  },
  {
    label: 'Support',
    items: [
      { name: '💝 Support Us', icon: Heart, to: '/donate' },
    ],
  },
];

const SidebarContent = ({ onNavigate, collapsed, toggleCollapse, isMobile }) => {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAdmin = async () => {
      if (user) {
        try {
          const tokenResult = await user.getIdTokenResult();
          setIsAdmin(!!tokenResult.claims.admin);
        } catch (error) {
          console.error("Error checking sidebar admin:", error);
        }
      }
    };
    checkAdmin();
  }, [user]);

  const adminSection = isAdmin ? {
    label: 'Admin',
    items: [
      { name: 'Admin Dashboard', icon: ShieldCheck, to: '/admin' },
    ],
  } : null;

  const displaySections = adminSection ? [...sections, adminSection] : sections;

  return (
    <div className="flex flex-col h-full">
      <div
        className={`cursor-pointer px-5 pb-6 pt-5 ${collapsed ? 'flex justify-center px-0' : 'flex items-center gap-3'}`}
        onClick={() => { if (!collapsed) window.location.href = '/dashboard'; }}
      >
        <div className="sidebar-brand-mark flex h-12 w-12 min-w-[48px] items-center justify-center overflow-hidden rounded-full bg-[#4f46e5] text-lg font-semibold text-white shadow-[0_10px_18px_-14px_rgba(79,70,229,0.55)]">
          <img
            src="/brand/airabook-mark.svg"
            alt="Airabook logo"
            className="sidebar-brand-logo h-6 w-6 object-contain"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) fallback.classList.remove('hidden');
            }}
          />
          <span className="sidebar-brand-fallback hidden">A</span>
        </div>
        {!collapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-[2rem] font-semibold tracking-tight text-slate-800">Airabook</span>
            <span className="truncate text-base text-slate-500">Creative studio</span>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 space-y-8 overflow-y-auto overflow-x-hidden scrollbar-hide">
        {displaySections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <div className="mb-2 truncate px-3 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
                {section.label}
              </div>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.name}
                    to={item.to}
                    className={({ isActive }) =>
                      [
                        'flex items-center gap-3 rounded-full px-4 py-3 text-[1.05rem] transition-colors',
                        collapsed ? 'justify-center px-0' : '',
                        isActive
                          ? 'bg-violet-100/80 text-violet-700 font-semibold'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800',
                      ].join(' ')
                    }
                    onClick={onNavigate}
                    title={collapsed ? item.name : ''}
                  >
                    <Icon className="h-4 w-4 min-w-[16px]" />
                    {!collapsed && <span className="truncate">{item.name}</span>}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer / User / Toggle */}
      <div className="space-y-2 border-t border-slate-200/60 p-4">
        {/* Toggle Button (Desktop only) */}
        {!isMobile && (
          <button
            onClick={toggleCollapse}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-base text-slate-600 transition-colors hover:bg-slate-100 ${collapsed ? 'justify-center' : ''}`}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        )}

        {/* User / Logout */}
        {user && !collapsed && (
          <div className="flex items-center gap-3 px-3 py-2">
            {/* Simple user info could go here */}
          </div>
        )}
      </div>
    </div>
  );
};

const Sidebar = ({ open, onClose }) => {
  // Initialize from localStorage or default to false (expanded)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebarCollapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    try {
      localStorage.setItem('sidebarCollapsed', String(newState));
    } catch (e) {
      console.error("Failed to save sidebar state", e);
    }
  };

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col bg-white/70 backdrop-blur border-r border-slate-200/60 shadow-sm transition-all duration-300 ${collapsed ? 'w-20' : 'w-80'
          }`}
      >
        <SidebarContent collapsed={collapsed} toggleCollapse={toggleCollapse} isMobile={false} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/30"
            onClick={onClose}
          />
          <div className="relative z-50 h-full w-80 bg-white/90 backdrop-blur border-r border-slate-200/60 shadow-appCard">
            <SidebarContent onNavigate={onClose} collapsed={false} isMobile={true} />
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
