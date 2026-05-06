import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  Package,
  FlaskConical,
  ClipboardList,
  BookOpen,
  Settings as SettingsIcon,
  FlaskRound,
  LogOut,
  X,
} from 'lucide-react';
import { t } from '../i18n/index.js';
import { cn } from '../lib/utils.js';
import { isMockMode } from '../api/db.js';
import { useAuth } from '../auth/AuthContext.jsx';

const items = [
  { to: '/', icon: Home, key: 'nav.dashboard', end: true },
  { to: '/warehouse', icon: Package, key: 'nav.warehouse' },
  { to: '/production', icon: FlaskConical, key: 'nav.production' },
  { to: '/journal', icon: ClipboardList, key: 'nav.journal' },
  { to: '/recipes', icon: BookOpen, key: 'nav.recipes' },
  { to: '/settings', icon: SettingsIcon, key: 'nav.settings' },
];

export default function Sidebar({ onClose }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <FlaskRound size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight">
            {t('app.title')}
          </h1>
          <p className="truncate text-xs text-muted-foreground">{t('app.subtitle')}</p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('nav.closeMenu')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-foreground/70 hover:bg-accent lg:hidden"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {items.map(({ to, icon: Icon, key, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-foreground/75 hover:bg-accent hover:text-foreground'
              )
            }
          >
            <Icon size={18} />
            <span>{t(key)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="space-y-2 border-t border-border px-3 py-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut size={18} />
          <span>{t('auth.logout')}</span>
        </button>
        <div className="flex items-center justify-between px-3 text-xs text-muted-foreground">
          <span>v0.2.0</span>
          {isMockMode() && (
            <span className="inline-flex items-center rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-warning">
              {t('app.mockBadge')}
            </span>
          )}
        </div>
      </div>
    </aside>
  );
}
