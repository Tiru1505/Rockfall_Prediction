import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, Mountain, Plus, Check, MapPin, Radio } from 'lucide-react'
import { useSite } from '../context/SiteContext'
import { colorForLevel, relativeTime } from '../lib/risk'

export default function SiteSwitcher() {
  const { sites, site, selectSite, loading } = useSite()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    function onPointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (loading) {
    return <div className="text-xs text-slate-muted font-mono px-3">loading sites…</div>
  }

  if (!site) {
    return (
      <button
        onClick={() => navigate('/sites')}
        className="flex items-center gap-2 px-3 py-2 rounded-md border border-hazard/50 text-hazard text-sm hover:bg-hazard/10 transition-colors"
      >
        <Plus size={15} /> Add your first site
      </button>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-3 pl-3 pr-2.5 py-2 rounded-md border border-line bg-panel-raised/60 hover:border-signal transition-colors min-w-[230px]"
      >
        <Mountain size={16} className="text-hazard shrink-0" />
        <span className="flex-1 text-left leading-tight overflow-hidden">
          <span className="block text-sm text-stone truncate">{site.name}</span>
          <span className="block text-[10px] uppercase tracking-wider text-slate-muted truncate">
            {site.location || site.site_id}
          </span>
        </span>
        {site.current_risk != null && (
          <span
            className="font-mono text-xs px-1.5 py-0.5 rounded shrink-0"
            style={{
              color: colorForLevel(site.current_level),
              background: `color-mix(in srgb, ${colorForLevel(site.current_level)} 15%, transparent)`,
            }}
          >
            {site.current_risk.toFixed(0)}%
          </span>
        )}
        <ChevronDown size={15} className={`text-slate-muted shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 mt-2 w-[340px] bg-panel border border-line rounded-lg shadow-xl z-50 overflow-hidden"
        >
          <div className="px-3 py-2 border-b border-line text-[10px] uppercase tracking-widest text-slate-muted">
            Monitored Sites · {sites.length}
          </div>

          <div className="max-h-[320px] overflow-y-auto">
            {sites.map((s) => {
              const active = s.site_id === site.site_id
              return (
                <button
                  key={s.site_id}
                  role="option"
                  aria-selected={active}
                  onClick={() => { selectSite(s.site_id); setOpen(false) }}
                  className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors border-l-2 ${
                    active
                      ? 'bg-panel-raised border-l-hazard'
                      : 'border-l-transparent hover:bg-panel-raised/60'
                  }`}
                >
                  <span className="w-4 shrink-0">
                    {active && <Check size={14} className="text-hazard" />}
                  </span>

                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-stone truncate">{s.name}</span>
                    <span className="flex items-center gap-2 text-[11px] text-slate-muted">
                      <MapPin size={10} className="shrink-0" />
                      <span className="truncate">{s.location || '—'}</span>
                    </span>
                  </span>

                  <span className="text-right shrink-0">
                    {s.current_risk != null ? (
                      <span
                        className="block font-mono text-sm"
                        style={{ color: colorForLevel(s.current_level) }}
                      >
                        {s.current_risk.toFixed(0)}%
                      </span>
                    ) : (
                      <span className="block font-mono text-xs text-slate-muted">—</span>
                    )}
                    <span className="flex items-center justify-end gap-1 text-[10px] text-slate-muted">
                      {s.monitoring_enabled ? (
                        <Radio size={9} className="text-safe" />
                      ) : null}
                      {relativeTime(s.last_evaluated)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <button
            onClick={() => { setOpen(false); navigate('/sites') }}
            className="w-full flex items-center gap-2 px-3 py-2.5 border-t border-line text-sm text-slate-muted hover:text-stone hover:bg-panel-raised/60 transition-colors"
          >
            <Plus size={14} /> Add / manage mining sites
          </button>
        </div>
      )}
    </div>
  )
}
