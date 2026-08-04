import { useState } from 'react'
import { Siren, Square, Trash2, Info } from 'lucide-react'
import api from '../api/client'

const ALERT_THRESHOLD = 80

/**
 * Demo control: force a site's risk to a target so the alert path can be shown.
 *
 * The simulated feed tops out around 56% (image risk is pinned at its neutral
 * 30 default with no upload), so the 80% threshold is otherwise unreachable and
 * alerting can't be demonstrated. Everything a drill produces is flagged and
 * badged as simulated, and can be purged afterwards.
 */
export default function DrillPanel({ siteId, siteName, drill, onChanged }) {
  const [target, setTarget] = useState(88)
  const [mode, setMode] = useState('ramp')
  const [steps, setSteps] = useState(4)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [purged, setPurged] = useState(null)

  const running = Boolean(drill)

  async function run(fn) {
    setBusy(true)
    setError(null)
    setPurged(null)
    try {
      await fn()
      await onChanged?.()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Request failed.')
    } finally {
      setBusy(false)
    }
  }

  const start = () => run(() =>
    api.post('/monitor/drill', { site_id: siteId, target_risk: target, mode, steps }))

  const stop = () => run(() => api.delete(`/monitor/drill/${siteId}`))

  const purge = () => run(async () => {
    if (!confirm('Delete every drill-generated reading and alert for all sites?')) return
    const { data } = await api.delete('/monitor/drill-data')
    setPurged(`Removed ${data.predictions_deleted} readings and ${data.alerts_deleted} alerts.`)
  })

  return (
    <div className={`bg-panel border rounded-lg p-5 ${running ? 'border-critical/50' : 'border-line'}`}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="font-display text-xs font-semibold text-stone uppercase tracking-wider flex items-center gap-2">
          <Siren size={14} className={running ? 'text-critical' : 'text-hazard'} />
          Alert Drill
        </h3>
        {running && (
          <span className="text-[10px] uppercase tracking-widest text-critical border border-critical/40 rounded px-1.5 py-0.5">
            Running · step {drill.steps_done}/{drill.total_steps || 1}
          </span>
        )}
      </div>

      <p className="text-[11px] text-slate-muted leading-snug mb-4">
        Drives {siteName} to a target score so the {ALERT_THRESHOLD}% alert can be
        demonstrated. Readings are flagged <span className="text-hazard">DRILL</span> and
        can be cleared afterwards.
      </p>

      {running ? (
        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-2 text-center">
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-slate-muted">Target</dt>
              <dd className="font-mono text-lg text-critical">{drill.target_risk}%</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-slate-muted">Next</dt>
              <dd className="font-mono text-lg text-stone">{drill.next_target}%</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-widest text-slate-muted">Mode</dt>
              <dd className="font-mono text-sm text-stone capitalize pt-1.5">{drill.mode}</dd>
            </div>
          </dl>
          <button
            onClick={stop}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-md border border-critical/50 text-critical hover:bg-critical/10 disabled:opacity-50 transition-colors"
          >
            <Square size={12} /> Stop drill
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-muted mb-1">
              <span>Target risk</span>
              <span
                className="font-mono text-sm"
                style={{ color: target >= ALERT_THRESHOLD ? 'var(--color-critical)' : 'var(--color-hazard)' }}
              >
                {target}%
              </span>
            </span>
            <input
              type="range" min={5} max={99} step={1}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              className="w-full accent-critical"
            />
            <span className="text-[10px] text-slate-muted">
              {target >= ALERT_THRESHOLD
                ? `Above the ${ALERT_THRESHOLD}% threshold — an alert will be raised.`
                : `Below the ${ALERT_THRESHOLD}% threshold — no alert will fire.`}
            </span>
          </label>

          <div className="flex gap-2">
            {['ramp', 'instant'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 text-xs px-3 py-1.5 rounded-md border capitalize transition-colors ${
                  mode === m
                    ? 'border-hazard text-stone bg-panel-raised'
                    : 'border-line text-slate-muted hover:text-stone'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === 'ramp' && (
            <label className="block">
              <span className="flex items-center justify-between text-[11px] uppercase tracking-wider text-slate-muted mb-1">
                <span>Climb over</span>
                <span className="font-mono text-sm text-stone">{steps} readings</span>
              </span>
              <input
                type="range" min={1} max={12} step={1}
                value={steps}
                onChange={(e) => setSteps(Number(e.target.value))}
                className="w-full accent-hazard"
              />
              <span className="text-[10px] text-slate-muted">
                Risk climbs gradually so the trend, forecast and escalation are visible.
              </span>
            </label>
          )}

          <button
            onClick={start}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 text-xs px-3 py-2.5 rounded-md bg-critical text-stone font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Siren size={13} /> {busy ? 'Starting…' : 'Start drill'}
          </button>
        </div>
      )}

      <button
        onClick={purge}
        disabled={busy}
        className="w-full mt-3 flex items-center justify-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md border border-line text-slate-muted hover:text-stone disabled:opacity-50 transition-colors"
      >
        <Trash2 size={11} /> Clear all drill data
      </button>

      {purged && (
        <p className="mt-2 text-[11px] text-safe flex items-start gap-1.5">
          <Info size={11} className="mt-0.5 shrink-0" /> {purged}
        </p>
      )}
      {error && <p className="mt-2 text-[11px] text-critical">{error}</p>}
    </div>
  )
}
