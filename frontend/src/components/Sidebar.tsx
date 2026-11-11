import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Mail,
  Users,
  FileCode,
  ShieldAlert,
  Settings,
  Sliders,
  Send,
  Server,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();

  const links = [
    { to: '/', label: 'Overview', icon: LayoutDashboard },
    { to: '/campaigns', label: 'Campaigns', icon: Mail },
    { to: '/campaigns/new', label: 'Create Campaign', icon: Send },
    { to: '/recipients', label: 'Recipients & Lists', icon: Users },
    { to: '/providers', label: 'Email Providers', icon: Server },
    { to: '/templates', label: 'Templates', icon: FileCode },
    { to: '/suppression', label: 'Suppression & Compliance', icon: ShieldAlert },
    { to: '/settings', label: 'Engine & SES Settings', icon: Sliders },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col min-h-screen border-r border-slate-800">
      <div className="p-6 border-b border-slate-800 flex items-center space-x-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
          <Mail className="w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-white text-lg tracking-tight">Bulk Email</h1>
          <p className="text-xs text-indigo-400 font-medium tracking-wide uppercase">Enterprise Delivery</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              <span>{link.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {user && (
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user.name}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">{user.role}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
