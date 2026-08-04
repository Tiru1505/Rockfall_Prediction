import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, ImageUp, CloudRain, Radio, Gauge as GaugeIcon,
  BellRing, History, BarChart3, ShieldCheck, Mountain, RadioTower, LineChart,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useSite } from '../context/SiteContext'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/live', label: 'Live Monitor', icon: RadioTower },
  { to: '/sites', label: 'Mining Sites', icon: Mountain },
  { to: '/site-graphs', label: 'Site Graphs', icon: LineChart },
  { to: '/image-prediction', label: 'Image Prediction', icon: ImageUp },
  { to: '/weather', label: 'Weather', icon: CloudRain },
  { to: '/sensors', label: 'Sensors', icon: Radio },
  { to: '/risk', label: 'Risk Analysis', icon: GaugeIcon },
  { to: '/alerts', label: 'Alerts', icon: BellRing },
  { to: '/history', label: 'History', icon: History },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
]

export default function Sidebar() {
  const { user } = useAuth()
  const { sites } = useSite()

  return (
    <aside className="contour-bg w-60 shrink-0 bg-panel border-r border-line flex flex-col h-screen sticky top-0">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-line">
        <Mountain size={22} className="text-hazard" />
        <div className="font-display leading-tight">
          <div className="text-sm font-semibold text-stone">STRATA<span className="text-hazard">WATCH</span></div>
          <div className="text-[10px] tracking-widest text-slate-muted uppercase">Rockfall Early Warning</div>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-panel-raised text-stone border border-line'
                  : 'text-slate-muted hover:text-stone hover:bg-panel-raised/60 border border-transparent'
              }`
            }
          >
            <Icon size={16} />
            {label}
            {to === '/sites' && sites.length > 0 && (
              <span className="ml-auto font-mono text-[10px] text-slate-muted">{sites.length}</span>
            )}
          </NavLink>
        ))}

        {user?.role === 'admin' && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-panel-raised text-stone border border-line'
                  : 'text-slate-muted hover:text-stone hover:bg-panel-raised/60 border border-transparent'
              }`
            }
          >
            <ShieldCheck size={16} />
            Admin Panel
          </NavLink>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-line text-[11px] text-slate-muted font-mono">
        v0.2.0 · prototype build
      </div>
    </aside>
  )
}
