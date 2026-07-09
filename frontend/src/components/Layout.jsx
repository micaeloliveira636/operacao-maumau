import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui';
import { Icon } from './Icon';
import { NotificationBell } from './NotificationBell';

function navItems(isAdmin) {
  const base = [
    { to: '/', label: 'Dashboard', icon: 'dashboard', end: true },
    { to: '/board', label: 'Board', icon: 'board' },
    { to: '/copys', label: 'Copys', icon: 'copy' },
  ];
  if (isAdmin) base.push({ to: '/usuarios', label: 'Equipe', icon: 'users' });
  base.push({ to: '/config', label: 'Ajustes', icon: 'sparkle' });
  return base;
}

export function Layout({ children }) {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const itens = navItems(isAdmin);

  const linkClass = ({ isActive }) =>
    `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
      isActive
        ? 'bg-brand-500/15 text-white shadow-[inset_0_0_0_1px_rgba(74,143,212,0.35)]'
        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
    }`;

  return (
    <div className="flex min-h-full">
      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/[0.06] bg-ink-900/70 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg" />
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">Operação Maumau</p>
            <p className="text-[11px] text-slate-500">Painel de mídias</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {itens.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className={linkClass}>
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="nav-active-indicator absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-400" />
                  )}
                  <Icon name={it.icon} className="h-[18px] w-[18px]" />
                  {it.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <Avatar nome={user?.nome} role={user?.role} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-200">{user?.nome}</p>
              <p className="truncate text-[11px] capitalize text-slate-500">{user?.role}</p>
            </div>
            <button onClick={logout} className="link-quiet p-1.5" title="Sair">
              <Icon name="logout" className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </aside>

      {/* Coluna principal */}
      <div className="flex min-h-full min-w-0 flex-1 flex-col lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/[0.06] bg-ink-950/80 px-4 py-3 backdrop-blur-xl safe-top sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span className="text-sm font-semibold text-white">Maumau</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => navigate('/demandas/nova')}
                className="btn-primary hidden sm:inline-flex"
              >
                <Icon name="plus" className="h-4 w-4" />
                Nova demanda
              </button>
            )}
            <NotificationBell />
            <button onClick={logout} className="link-quiet p-2 lg:hidden" title="Sair">
              <Icon name="logout" className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 pb-24 sm:px-6 lg:pb-8">{children}</main>
      </div>

      {/* Navegação inferior mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-white/[0.06] bg-ink-900/90 backdrop-blur-xl safe-bottom lg:hidden">
        {itens.slice(0, 4).map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                isActive ? 'text-brand-300' : 'text-slate-500'
              }`
            }
          >
            <Icon name={it.icon} className="h-5 w-5" />
            {it.label}
          </NavLink>
        ))}
        {isAdmin && (
          <button
            onClick={() => navigate('/demandas/nova')}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-slate-500"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white">
              <Icon name="plus" className="h-4 w-4" />
            </span>
            Nova
          </button>
        )}
      </nav>
    </div>
  );
}
