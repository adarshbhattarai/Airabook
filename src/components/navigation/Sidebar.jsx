import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  BookOpen,
  Image as ImageIcon,
  StickyNote,
  Heart,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut
} from 'lucide-react';

const sections = [
  {
    label: 'Main',
    items: [
      { name: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
      { name: 'Books', icon: BookOpen, to: '/books' },
      { name: 'Asset Registry', icon: ImageIcon, to: '/media' },
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
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
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
        className={`flex items-center gap-2 px-4 pt-4 pb-6 cursor-pointer ${collapsed ? 'justify-center px-0' : ''}`}
        onClick={() => { if (!collapsed) window.location.href = '/dashboard'; }}
      >
        <div className="sidebar-brand-mark h-9 w-9 min-w-[36px] rounded-2xl bg-app-iris text-white flex items-center justify-center text-lg font-semibold shadow-appCard overflow-hidden">
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
            <span className="text-sm font-semibold text-app-gray-900 truncate">Airabook</span>
            <span className="text-xs text-app-gray-600 truncate">Creative studio</span>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 space-y-6 overflow-y-auto overflow-x-hidden scrollbar-hide">
        {displaySections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <div className="px-2 mb-2 text-[11px] font-semibold text-app-gray-600 uppercase tracking-wide truncate">
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
                    className={({ isActive }) => {
                      const isBookDetailRoute = item.to === '/books' && pathname.startsWith('/book/');
                      const isActiveRoute = isActive || isBookDetailRoute;

                      return [
                        'flex items-center gap-3 px-3 py-2 text-sm rounded-xl border-l-4 transition-colors',
                        collapsed ? 'justify-center px-0' : '',
                        isActiveRoute
                          ? 'bg-app-iris/10 border-app-iris text-app-iris font-medium'
                          : 'border-transparent text-app-gray-600 hover:bg-app-gray-50 hover:text-app-gray-900',
                      ].join(' ');
                    }}
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
      <div className="p-3 border-t border-app-gray-300 space-y-2">
        {/* Toggle Button (Desktop only) */}
        {!isMobile && (
          <button
            onClick={toggleCollapse}
            className={`flex items-center gap-3 px-3 py-2 text-sm text-app-gray-500 hover:bg-app-gray-50 rounded-xl w-full transition-colors ${collapsed ? 'justify-center' : ''}`}
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
        className={`hidden md:flex flex-col bg-white border-r border-app-gray-300 shadow-sm transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'
          } matrix-surface-soft`}
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
          <div className="relative z-50 h-full w-72 bg-white border-r border-app-gray-300 shadow-appCard matrix-surface-soft">
            <SidebarContent onNavigate={onClose} collapsed={false} isMobile={true} />
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;
