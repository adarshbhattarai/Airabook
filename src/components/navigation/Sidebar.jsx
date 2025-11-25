import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  BookOpen,
  Image as ImageIcon,
  StickyNote,
  Heart,
} from 'lucide-react';

const sections = [
  {
    label: 'Main',
    items: [
      { name: 'Dashboard', icon: LayoutDashboard, to: '/dashboard' },
      { name: 'Books', icon: BookOpen, to: '/books' },
      { name: 'Media', icon: ImageIcon, to: '/media' },
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

const SidebarContent = ({ onNavigate }) => {
  return (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-2 px-4 pt-4 pb-6 cursor-pointer"
        onClick={() => window.location.href = '/dashboard'}
      >
        <div className="h-9 w-9 rounded-2xl bg-app-iris text-white flex items-center justify-center text-lg font-semibold shadow-appCard">
          A
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-app-gray-900">Airäbook</span>
          <span className="text-xs text-app-gray-600">Creative studio</span>
        </div>
      </div>

      <nav className="flex-1 px-3 space-y-6">
        {sections.map((section) => (
          <div key={section.label}>
            <div className="px-2 mb-2 text-[11px] font-semibold text-app-gray-600 uppercase tracking-wide">
              {section.label}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.name}
                    to={item.to}
                    className={({ isActive }) =>
                      [
                        'flex items-center gap-3 px-3 py-2 text-sm rounded-xl border-l-4 transition-colors',
                        isActive
                          ? 'bg-app-iris/10 border-app-iris text-app-iris font-medium'
                          : 'border-transparent text-app-gray-600 hover:bg-app-gray-50 hover:text-app-gray-900',
                      ].join(' ')
                    }
                    onClick={onNavigate}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.name}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
};

const Sidebar = ({ open, onClose }) => {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 bg-white border-r border-app-gray-300 shadow-sm">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-black/30"
            onClick={onClose}
          />
          <div className="relative z-50 h-full w-72 bg-white border-r border-app-gray-300 shadow-appCard">
            <SidebarContent onNavigate={onClose} />
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;


