import { Sun, Moon, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import SiteSwitcher from './SiteSwitcher'

export default function Topbar({ title, subtitle, showSiteSwitcher = true }) {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()

  return (
    <header className="flex items-center justify-between gap-4 px-8 py-5 border-b border-line bg-basalt/80 backdrop-blur sticky top-0 z-10">
      <div className="min-w-0">
        <h1 className="font-display text-xl font-semibold text-stone">{title}</h1>
        {subtitle && <p className="text-sm text-slate-muted mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4 shrink-0">
        {showSiteSwitcher && <SiteSwitcher />}

        <button
          onClick={toggle}
          className="p-2 rounded-md border border-line text-slate-muted hover:text-stone transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {user && (
          <div className="flex items-center gap-3 pl-3 border-l border-line">
            <div className="text-right">
              <div className="text-sm text-stone leading-tight">{user.name}</div>
              <div className="text-[11px] uppercase tracking-wider text-slate-muted">{user.role}</div>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-md border border-line text-slate-muted hover:text-critical transition-colors"
              aria-label="Log out"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
