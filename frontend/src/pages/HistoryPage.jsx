import { useEffect, useState, useCallback } from 'react'
import { Download, History as HistoryIcon } from 'lucide-react'
import api, { API_BASE_URL } from '../api/client'
import Topbar from '../components/Topbar'
import ScopeToggle from '../components/ScopeToggle'
import { useSite } from '../context/SiteContext'
import { colorForLevel } from '../lib/risk'

const selectClass = 'bg-panel-raised border border-line rounded-md px-3 py-1.5 text-xs text-stone focus:outline-none focus:border-signal'

export default function HistoryPage() {
  const { siteId } = useSite()
  const [rows, setRows] = useState(null)
  const [filter, setFilter] = useState('')
  const [source, setSource] = useState('')
  const [scoped, setScoped] = useState(true)

  const load = useCallback(async () => {
    const params = { limit: 200 }
    if (filter) params.risk_level = filter
    if (source) params.source = source
    if (scoped && siteId) params.site_id = siteId
    const { data } = await api.get('/history', { params })
    setRows(data)
  }, [filter, source, scoped, siteId])

  useEffect(() => {
    setRows(null)
    load()
  }, [load])

  function exportCsv() {
    // Built off API_BASE_URL, not a hardcoded '/api' — in production the API
    // lives on a different host and this would 404 against the static frontend.
    const qs = scoped && siteId ? `?site_id=${encodeURIComponent(siteId)}` : ''
    window.open(`${API_BASE_URL}/analytics/export/history.csv${qs}`, '_blank')
  }

  return (
    <div className="flex-1">
      <Topbar title="Prediction History" subtitle="Every fused risk evaluation, filterable and exportable" />

      <div className="p-8">
        <div className="bg-panel border border-line rounded-lg p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="font-display text-sm font-semibold text-stone uppercase tracking-wider flex items-center gap-2">
              <HistoryIcon size={15} /> History
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              <ScopeToggle scoped={scoped} onChange={setScoped} />
              <select value={filter} onChange={(e) => setFilter(e.target.value)} className={selectClass}>
                <option value="">All risk levels</option>
                {['Safe', 'Low', 'Medium', 'High', 'Critical'].map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
              <select value={source} onChange={(e) => setSource(e.target.value)} className={selectClass}>
                <option value="">All sources</option>
                <option value="monitor">Auto (monitor)</option>
                <option value="manual">Manual</option>
                <option value="drill">Drill (simulated)</option>
              </select>
              <button
                onClick={exportCsv}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-line text-slate-muted hover:text-stone hover:border-signal transition-colors"
              >
                <Download size={13} /> Export CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-muted border-b border-line">
                  <th className="pb-2 pr-4">Timestamp</th>
                  <th className="pb-2 pr-4">Site</th>
                  <th className="pb-2 pr-4">Source</th>
                  <th className="pb-2 pr-4">Image</th>
                  <th className="pb-2 pr-4">Sensor</th>
                  <th className="pb-2 pr-4">Weather</th>
                  <th className="pb-2 pr-4">Final</th>
                  <th className="pb-2">Level</th>
                </tr>
              </thead>
              <tbody>
                {rows?.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs text-slate-muted">{new Date(r.timestamp).toLocaleString()}</td>
                    <td className="py-2 pr-4 text-stone">{r.site_name}</td>
                    <td className="py-2 pr-4">
                      <span
                        className="font-mono text-[10px] uppercase tracking-wider"
                        style={{ color: r.simulated ? 'var(--color-critical)' : 'var(--color-slate-muted)' }}
                      >
                        {r.simulated ? 'drill' : (r.source ?? 'manual')}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono">{r.image_risk}%</td>
                    <td className="py-2 pr-4 font-mono">{r.sensor_risk}%</td>
                    <td className="py-2 pr-4 font-mono">{r.weather_risk}%</td>
                    <td className="py-2 pr-4 font-mono font-semibold">{r.final_risk}%</td>
                    <td className="py-2">
                      <span
                        className="font-mono text-xs px-2 py-0.5 rounded border"
                        style={{ color: colorForLevel(r.risk_level), borderColor: colorForLevel(r.risk_level) }}
                      >
                        {r.risk_level}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows?.length === 0 && (
              <p className="text-sm text-slate-muted py-6 text-center">No predictions match this filter yet.</p>
            )}
            {rows === null && <p className="text-sm text-slate-muted py-6 text-center">Loading…</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
