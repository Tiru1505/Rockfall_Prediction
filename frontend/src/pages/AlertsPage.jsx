import { useEffect, useState, useCallback } from 'react'
import { BellRing, AlertTriangle, Check } from 'lucide-react'
import api from '../api/client'
import Topbar from '../components/Topbar'
import ScopeToggle from '../components/ScopeToggle'
import { useSite } from '../context/SiteContext'
import { colorForLevel } from '../lib/risk'

export default function AlertsPage() {
  const { siteId, site } = useSite()
  const [alerts, setAlerts] = useState(null)
  const [scoped, setScoped] = useState(true)

  const load = useCallback(async () => {
    const params = { limit: 100 }
    if (scoped && siteId) params.site_id = siteId
    const { data } = await api.get('/alerts', { params })
    setAlerts(data)
  }, [scoped, siteId])

  useEffect(() => {
    setAlerts(null)
    load()
    const id = setInterval(load, 20000)
    return () => clearInterval(id)
  }, [load])

  async function acknowledge(id) {
    await api.post(`/alerts/${id}/acknowledge`)
    load()
  }

  return (
    <div className="flex-1">
      <Topbar title="Alerts" subtitle="Every alert raised when fused risk crosses the 80% threshold" />

      <div className="p-8">
        <div className="bg-panel border border-line rounded-lg p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="font-display text-sm font-semibold text-stone uppercase tracking-wider flex items-center gap-2">
              <BellRing size={15} className="text-hazard" /> Alert History
            </h2>
            <ScopeToggle scoped={scoped} onChange={setScoped} />
          </div>

          {alerts === null && <p className="text-sm text-slate-muted">Loading…</p>}
          {alerts?.length === 0 && (
            <p className="text-sm text-slate-muted">
              No alerts have been raised{scoped && site ? ` for ${site.name}` : ''}. Everything is
              currently below the critical threshold.
            </p>
          )}

          {alerts && alerts.length > 0 && (
            <ul className="divide-y divide-line">
              {alerts.map((a) => (
                <li key={a.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <AlertTriangle size={16} style={{ color: colorForLevel(a.risk_level) }} className="shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm text-stone">{a.message}</div>
                      <div className="text-xs text-slate-muted font-mono mt-0.5">
                        {a.site_name} · {new Date(a.timestamp).toLocaleString()}
                        {a.acknowledged ? ' · acknowledged' : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!a.acknowledged && (
                      <button
                        onClick={() => acknowledge(a.id)}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-line text-slate-muted hover:text-stone hover:border-signal transition-colors"
                      >
                        <Check size={12} /> Ack
                      </button>
                    )}
                    <span
                      className="text-xs font-mono px-2 py-1 rounded-md border"
                      style={{ color: colorForLevel(a.risk_level), borderColor: colorForLevel(a.risk_level) }}
                    >
                      {a.risk_level} · {a.final_risk}%
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
