import { useEffect, useState, useRef, useCallback } from 'react'
import {
  Activity, CloudRain, Droplets, Thermometer, BellRing, Play, Pause,
  RefreshCw, Radio, Waves, Gauge as GaugeIcon, Siren,
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import api from '../api/client'
import RiskGauge from '../components/RiskGauge'
import StatCard from '../components/StatCard'
import Topbar from '../components/Topbar'
import AIInsightPanel from '../components/AIInsightPanel'
import DrillPanel from '../components/DrillPanel'
import { useSite } from '../context/SiteContext'
import { useAuth } from '../context/AuthContext'
import { colorForLevel, relativeTime, shortTime, TREND_ARROW, TREND_COLOR } from '../lib/risk'

const POLL_MS = 4000
const ALERT_THRESHOLD = 80

function EngineBar({ status, isAdmin, onControl, busy }) {
  // `null` means we haven't got a reading back yet — that is not the same as
  // the engine being stopped, and showing "stopped/0 cycles" for it is a lie.
  const unknown = !status

  return (
    <div className="bg-panel border border-line rounded-lg px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <span className="flex items-center gap-2 text-sm">
        <span className="relative flex items-center justify-center w-2.5 h-2.5">
          {status?.running && (
            <span className="absolute w-2.5 h-2.5 rounded-full bg-safe pulse-ring" />
          )}
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: status?.running ? 'var(--color-safe)' : 'var(--color-slate-muted)' }}
          />
        </span>
        <span className="text-stone">
          {unknown
            ? 'Contacting monitoring engine…'
            : `Monitoring engine ${status.running ? 'running' : 'stopped'}`}
        </span>
      </span>

      <span className="text-xs text-slate-muted font-mono">
        every {status?.interval_seconds ?? '—'}s
      </span>
      <span className="text-xs text-slate-muted font-mono">
        last tick {unknown ? '—' : relativeTime(status.last_tick)}
      </span>
      <span className="text-xs text-slate-muted font-mono">
        {unknown ? '—' : `${status.tick_count} cycles · ${status.sites_tracked} sites`}
      </span>

      {status?.last_error && (
        <span className="text-xs text-critical font-mono truncate">error: {status.last_error}</span>
      )}

      {isAdmin && (
        <span className="ml-auto flex items-center gap-2">
          <button
            onClick={() => onControl(status?.running ? 'stop' : 'start')}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-line text-slate-muted hover:text-stone hover:border-signal disabled:opacity-50 transition-colors"
          >
            {status?.running ? <><Pause size={12} /> Stop</> : <><Play size={12} /> Start</>}
          </button>
          <button
            onClick={() => onControl('tick')}
            disabled={busy}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-line text-slate-muted hover:text-stone hover:border-signal disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Tick now
          </button>
        </span>
      )}
    </div>
  )
}

function NetworkStrip({ overview, activeId, onSelect }) {
  if (!overview?.sites?.length) return null

  return (
    <div className="bg-panel border border-line rounded-lg p-5">
      <h2 className="font-display text-xs font-semibold text-stone mb-1 uppercase tracking-wider">
        Network Overview
      </h2>
      <p className="text-sm text-slate-muted mb-4">{overview.headline}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {overview.sites.map((s) => {
          const color = colorForLevel(s.risk_level)
          const active = s.site_id === activeId
          return (
            <button
              key={s.site_id}
              onClick={() => onSelect(s.site_id)}
              className={`text-left rounded-md border p-3 transition-colors ${
                active ? 'border-hazard bg-panel-raised' : 'border-line hover:border-slate-muted/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-stone truncate">{s.site_name}</span>
                <span className="font-mono text-sm shrink-0" style={{ color }}>
                  {s.final_risk.toFixed(0)}%
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] mt-1">
                <span style={{ color: TREND_COLOR[s.trend.direction] }}>
                  {TREND_ARROW[s.trend.direction]} {s.trend.label}
                </span>
                <span className="text-slate-muted font-mono">
                  {s.top_driver ? s.top_driver.label.split(' ')[0] : '—'}
                  {s.anomaly_count > 0 && (
                    <span className="text-critical ml-2">{s.anomaly_count}⚠</span>
                  )}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function LiveMonitorPage() {
  const { site, siteId, selectSite, refresh: refreshSites } = useSite()
  const { user } = useAuth()

  const [live, setLive] = useState(null)
  const [insight, setInsight] = useState(null)
  const [overview, setOverview] = useState(null)
  const [engineStatus, setEngineStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [stream, setStream] = useState([])
  const lastStampRef = useRef(null)
  const seededRef = useRef(false)

  const isAdmin = user?.role === 'admin'

  const poll = useCallback(async () => {
    if (!siteId) return
    try {
      const [liveRes, insightRes, overviewRes] = await Promise.all([
        api.get(`/monitor/live/${siteId}`),
        api.get(`/monitor/insights/${siteId}`),
        api.get('/monitor/insights'),
      ])
      setLive(liveRes.data)
      setInsight(insightRes.data)
      setOverview(overviewRes.data)
      setEngineStatus(liveRes.data.engine)

      // Seed the stream from the server's sparkline on first load, then append
      // only genuinely new ticks so the chart advances instead of resetting.
      // Refs (not stream.length) gate this, so `poll` stays stable and the
      // polling interval isn't torn down and rebuilt on every append.
      const snap = liveRes.data.live
      if (!seededRef.current && snap?.sparkline?.length) {
        seededRef.current = true
        setStream(snap.sparkline.map((p) => ({ time: shortTime(p.t), risk: p.risk })))
        lastStampRef.current = snap.timestamp
      } else if (snap?.timestamp && snap.timestamp !== lastStampRef.current) {
        lastStampRef.current = snap.timestamp
        setStream((s) => [...s.slice(-59), {
          time: shortTime(snap.timestamp),
          risk: snap.final_risk,
        }])
      }
    } catch {
      // A failure here is usually site-specific (e.g. the selected site was
      // deleted in another tab, so /monitor/live/{id} 404s). Fall back to the
      // engine's own status so the header still reports the truth about it
      // rather than implying the engine is down.
      try {
        const { data } = await api.get('/monitor/status')
        setEngineStatus(data)
      } catch {
        setEngineStatus(null)
      }
    }
  }, [siteId])

  // Reset the rolling stream whenever the operator switches site.
  useEffect(() => {
    setStream([])
    setLive(null)
    setInsight(null)
    lastStampRef.current = null
    seededRef.current = false
  }, [siteId])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll])

  async function control(action) {
    setBusy(true)
    try {
      const { data } = await api.post('/monitor/control', { action })
      setEngineStatus(data)
      await poll()
      await refreshSites()
    } finally {
      setBusy(false)
    }
  }

  if (!siteId) {
    return (
      <div className="flex-1">
        <Topbar title="Live Monitor" subtitle="No site selected" />
        <div className="p-8">
          <p className="text-sm text-slate-muted">
            Add a mining site to start live monitoring.
          </p>
        </div>
      </div>
    )
  }

  const snap = live?.live
  const awaiting = snap?.awaiting_first_reading || snap?.final_risk == null
  const drill = live?.drill ?? null

  return (
    <div className="flex-1">
      <Topbar
        title="Live Monitor"
        subtitle={site ? `${site.name} — continuous AI risk monitoring` : 'Live risk monitoring'}
      />

      <div className="p-8 space-y-6">
        <EngineBar status={engineStatus} isAdmin={isAdmin} onControl={control} busy={busy} />

        {awaiting ? (
          <div className="bg-panel border border-line rounded-lg p-10 text-center">
            <Radio size={28} className="text-slate-muted mx-auto mb-3" />
            <p className="text-sm text-slate-muted">
              Waiting for the first reading on this site
              {!engineStatus
                ? '.'
                : engineStatus.running
                  ? ` — the engine ticks every ${engineStatus.interval_seconds}s.`
                  : '. The monitoring engine is stopped.'}
            </p>
          </div>
        ) : (
          <>
            {snap.simulated && (
              <div className="flex items-center gap-2.5 text-sm bg-critical/10 border border-critical/40 rounded-lg px-5 py-3">
                <Siren size={16} className="text-critical shrink-0" />
                <span className="text-stone">
                  <span className="font-semibold text-critical">DRILL IN PROGRESS</span>
                  {' — '}this reading is simulated, not a real measurement. Any alert
                  raised now is flagged and can be cleared afterwards.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className={`bg-panel border rounded-lg p-6 flex flex-col items-center justify-center ${snap.simulated ? 'border-critical/50' : 'border-line'}`}>
                <span className="text-xs uppercase tracking-widest text-slate-muted mb-2 text-center">
                  {snap.site_name}
                </span>
                <RiskGauge value={snap.final_risk} />
                <span className="text-[11px] font-mono text-slate-muted mt-3">
                  updated {relativeTime(snap.timestamp)}
                </span>
                {snap.simulated && (
                  <span className="mt-1 text-[10px] uppercase tracking-widest text-critical">
                    simulated reading
                  </span>
                )}
              </div>

              <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4 content-start">
                <StatCard label="Image Risk" value={snap.image_risk?.toFixed(1) ?? '—'} unit="%" icon={Activity} accent="var(--color-hazard)" />
                <StatCard label="Sensor Risk" value={snap.sensor_risk?.toFixed(1) ?? '—'} unit="%" icon={Waves} accent="var(--color-signal)" />
                <StatCard label="Weather Risk" value={snap.weather_risk?.toFixed(1) ?? '—'} unit="%" icon={CloudRain} accent="var(--color-safe)" />
                <StatCard label="Confidence" value={((snap.confidence ?? 0) * 100).toFixed(0)} unit="%" icon={GaugeIcon} />
                <StatCard label="Ground Vibration" value={snap.ground_vibration ?? '—'} unit="Hz" icon={Activity} />
                <StatCard label="Tilt" value={snap.tilt_deg ?? '—'} unit="°" icon={GaugeIcon} />
                <StatCard label="Soil Moisture" value={snap.soil_moisture ?? '—'} unit="%" icon={Droplets} />
                <StatCard label="Temperature" value={snap.temperature_c?.toFixed(1) ?? '—'} unit="°C" icon={Thermometer} />
              </div>
            </div>

            {/* Live streaming risk */}
            <div className="bg-panel border border-line rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-sm font-semibold text-stone uppercase tracking-wider">
                  Live Risk Stream
                </h2>
                <span className="text-[11px] font-mono text-slate-muted">
                  {stream.length} points · polling {POLL_MS / 1000}s
                </span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={stream}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="time" stroke="var(--color-slate-muted)" fontSize={10} minTickGap={24} />
                  <YAxis stroke="var(--color-slate-muted)" fontSize={11} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: 'var(--color-panel-raised)', border: '1px solid var(--color-line)', fontSize: 12 }}
                    formatter={(v) => [`${v}%`, 'Fused risk']}
                  />
                  <ReferenceLine
                    y={ALERT_THRESHOLD}
                    stroke="var(--color-critical)"
                    strokeDasharray="4 4"
                    label={{ value: 'Alert threshold', fill: 'var(--color-critical)', fontSize: 10, position: 'insideTopRight' }}
                  />
                  <Line
                    type="monotone" dataKey="risk"
                    stroke={colorForLevel(snap.risk_level)}
                    strokeWidth={2} dot={false} isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {isAdmin ? (
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6 items-start">
                <div className="min-w-0"><AIInsightPanel insight={insight} /></div>
                <DrillPanel
                  siteId={siteId}
                  siteName={site?.name ?? 'this site'}
                  drill={drill}
                  onChanged={poll}
                />
              </div>
            ) : (
              <AIInsightPanel insight={insight} />
            )}

            <NetworkStrip overview={overview} activeId={siteId} onSelect={selectSite} />

            {/* Site alert feed */}
            <div className="bg-panel border border-line rounded-lg p-6">
              <h2 className="font-display text-sm font-semibold text-stone mb-4 uppercase tracking-wider flex items-center gap-2">
                <BellRing size={15} className="text-hazard" /> Alerts — {site?.name}
              </h2>
              {!live?.alerts?.length ? (
                <p className="text-sm text-slate-muted">
                  No alerts raised for this site. Risk has stayed below the {ALERT_THRESHOLD}% threshold.
                </p>
              ) : (
                <ul className="space-y-2">
                  {live.alerts.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-4 text-sm border-b border-line last:border-0 pb-2 last:pb-0">
                      <span className="text-stone flex items-center gap-2">
                        {a.simulated && (
                          <span className="text-[9px] uppercase tracking-widest font-mono text-critical border border-critical/40 rounded px-1 py-0.5 shrink-0">
                            drill
                          </span>
                        )}
                        {a.message}
                      </span>
                      <span className="font-mono text-xs shrink-0" style={{ color: colorForLevel(a.risk_level) }}>
                        {new Date(a.timestamp).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
