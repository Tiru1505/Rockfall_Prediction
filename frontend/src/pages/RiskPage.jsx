import { useEffect, useState } from 'react'
import api from '../api/client'
import RiskGauge from '../components/RiskGauge'
import Topbar from '../components/Topbar'
import { useSite } from '../context/SiteContext'

const CATEGORIES = [
  { label: 'Safe', range: '0–20%', color: 'var(--color-safe)' },
  { label: 'Low', range: '20–40%', color: '#7fb896' },
  { label: 'Medium', range: '40–60%', color: 'var(--color-hazard)' },
  { label: 'High', range: '60–80%', color: '#d47a3a' },
  { label: 'Critical', range: '80–100%', color: 'var(--color-critical)' },
]

export default function RiskPage() {
  const { site, siteId, refresh: refreshSites } = useSite()
  const [risk, setRisk] = useState(null)
  const [busy, setBusy] = useState(false)

  async function evaluate() {
    setBusy(true)
    try {
      const { data } = await api.post('/risk/evaluate', null, { params: { site_id: siteId } })
      setRisk(data)
      await refreshSites()
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!siteId) return
    setRisk(null)
    api.get('/risk/current', { params: { site_id: siteId } }).then((res) => setRisk(res.data))
  }, [siteId])

  if (!risk) return <div className="flex-1"><Topbar title="Risk Analysis" subtitle="Loading…" /></div>

  return (
    <div className="flex-1">
      <Topbar
        title="Risk Analysis"
        subtitle={`${site?.name ?? 'Site'} — fused rockfall probability from image, sensor and weather models`}
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="bg-panel border border-line rounded-lg p-6 flex flex-col items-center lg:col-span-1">
            <RiskGauge value={risk.final_risk} />
            <button
              onClick={evaluate}
              disabled={busy}
              className="mt-4 text-xs px-4 py-2 rounded-md border border-line text-slate-muted hover:text-stone hover:border-signal disabled:opacity-50 transition-colors"
            >
              {busy ? 'Evaluating…' : 'Re-evaluate now'}
            </button>
          </div>

          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Image Risk', value: risk.image_risk, color: 'var(--color-hazard)' },
              { label: 'Sensor Risk', value: risk.sensor_risk, color: 'var(--color-signal)' },
              { label: 'Weather Risk', value: risk.weather_risk, color: 'var(--color-safe)' },
            ].map((r) => (
              <div key={r.label} className="bg-panel border border-line rounded-lg p-5 flex flex-col items-center">
                <RiskGauge value={r.value} size={140} />
                <span className="text-xs uppercase tracking-wider text-slate-muted mt-2">{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-panel border border-line rounded-lg p-6">
          <h2 className="font-display text-sm font-semibold text-stone mb-4 uppercase tracking-wider">Risk Categories</h2>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {CATEGORIES.map((c) => (
              <div
                key={c.label}
                className="rounded-md p-3 border"
                style={{
                  borderColor: c.color,
                  backgroundColor: risk.risk_level === c.label ? `${c.color}22` : 'transparent',
                }}
              >
                <div className="font-display text-sm font-semibold" style={{ color: c.color }}>{c.label}</div>
                <div className="text-xs text-slate-muted font-mono">{c.range}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-panel border border-line rounded-lg p-6">
          <h2 className="font-display text-sm font-semibold text-stone mb-4 uppercase tracking-wider">Fusion Formula</h2>
          <p className="text-sm text-slate-muted leading-relaxed font-mono">
            final_risk = 0.40 × image_risk + 0.35 × sensor_risk + 0.25 × weather_risk
          </p>
          <p className="text-sm text-slate-muted mt-2">
            Weights are configurable in <code className="text-stone">backend/app/core/config.py</code> and should be tuned against labeled historical incidents once available.
          </p>
        </div>
      </div>
    </div>
  )
}
