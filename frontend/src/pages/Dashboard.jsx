import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { CloudRain, Droplets, Activity, Thermometer, BellRing, RadioTower, ArrowRight } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import api from '../api/client'
import RiskGauge from '../components/RiskGauge'
import StatCard from '../components/StatCard'
import Topbar from '../components/Topbar'
import { useSite } from '../context/SiteContext'
import { colorForLevel, relativeTime, shortTime, TREND_ARROW, TREND_COLOR } from '../lib/risk'

const ALERT_THRESHOLD = 80

export default function Dashboard() {
  const { site, siteId, refresh: refreshSites } = useSite()

  const [risk, setRisk] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [trend, setTrend] = useState([])
  const [insight, setInsight] = useState(null)
  const [engine, setEngine] = useState(null)
  const [evaluating, setEvaluating] = useState(false)

  const loadAll = useCallback(async () => {
    if (!siteId) return
    const params = { site_id: siteId }
    const [riskRes, alertsRes, historyRes, insightRes, statusRes] = await Promise.all([
      api.get('/risk/current', { params }),
      api.get('/alerts', { params: { ...params, limit: 5 } }),
      api.get('/history', { params: { ...params, limit: 40 } }),
      api.get(`/monitor/insights/${siteId}`),
      api.get('/monitor/status'),
    ])
    setRisk(riskRes.data)
    setAlerts(alertsRes.data)
    setTrend(historyRes.data.slice().reverse())
    setInsight(insightRes.data)
    setEngine(statusRes.data)
  }, [siteId])

  async function runEvaluation() {
    setEvaluating(true)
    try {
      await api.post('/risk/evaluate', null, { params: { site_id: siteId } })
      await loadAll()
      await refreshSites()
    } finally {
      setEvaluating(false)
    }
  }

  useEffect(() => {
    setRisk(null)
    loadAll()
    const id = setInterval(loadAll, 15000)
    return () => clearInterval(id)
  }, [loadAll])

  if (!siteId) {
    return (
      <div className="flex-1">
        <Topbar title="Dashboard" subtitle="No mining site selected" />
        <div className="p-8">
          <Link to="/sites" className="text-sm text-hazard hover:underline">
            Add your first mining site →
          </Link>
        </div>
      </div>
    )
  }

  if (!risk) {
    return (
      <div className="flex-1">
        <Topbar title="Dashboard" subtitle="Loading live monitoring data…" />
      </div>
    )
  }

  const chartData = trend.map((p) => ({
    time: shortTime(p.timestamp),
    'Final Risk': p.final_risk,
    'Sensor Risk': p.sensor_risk,
    'Weather Risk': p.weather_risk,
  }))

  return (
    <div className="flex-1">
      <Topbar
        title="Dashboard"
        subtitle={site ? `${site.name} — fused risk across image, sensor and weather signals` : 'Live fused risk'}
      />

      <div className="p-8 space-y-6">
        {/* Live engine banner */}
        <div className="bg-panel border border-line rounded-lg px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: engine?.running ? 'var(--color-safe)' : 'var(--color-slate-muted)' }}
            />
            <span className="text-stone">
              Live monitoring {engine?.running ? 'active' : 'stopped'}
            </span>
          </span>
          {engine?.running && (
            <span className="text-xs text-slate-muted font-mono">
              auto-evaluating every {engine.interval_seconds}s · last {relativeTime(engine.last_tick)}
            </span>
          )}
          <Link
            to="/live"
            className="ml-auto flex items-center gap-1.5 text-xs text-signal hover:text-stone transition-colors"
          >
            <RadioTower size={13} /> Open Live Monitor <ArrowRight size={12} />
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Risk gauge card */}
          <div className="bg-panel border border-line rounded-lg p-6 flex flex-col items-center justify-center lg:col-span-1">
            <span className="text-xs uppercase tracking-widest text-slate-muted mb-2 text-center">
              {risk.site_name} · Overall Risk
            </span>
            <RiskGauge value={risk.final_risk} />
            <span className="text-[11px] font-mono text-slate-muted mt-2">
              {risk.id === 0 ? 'no readings yet' : `updated ${relativeTime(risk.timestamp)}`}
            </span>
            <button
              onClick={runEvaluation}
              disabled={evaluating}
              className="mt-4 text-xs px-4 py-2 rounded-md border border-line text-slate-muted hover:text-stone hover:border-signal disabled:opacity-50 transition-colors"
            >
              {evaluating ? 'Evaluating…' : 'Run new evaluation'}
            </button>
          </div>

          {/* Stat cards */}
          <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-2 gap-4 content-start">
            <StatCard label="Image Risk" value={risk.image_risk.toFixed(1)} unit="%" icon={Activity} accent="var(--color-hazard)" hint="Slope-image CNN score" />
            <StatCard label="Sensor Risk" value={risk.sensor_risk.toFixed(1)} unit="%" icon={Activity} accent="var(--color-signal)" hint="Vibration · tilt · moisture" />
            <StatCard label="Weather Risk" value={risk.weather_risk.toFixed(1)} unit="%" icon={CloudRain} accent="var(--color-safe)" hint="Rainfall · humidity · wind" />
            <StatCard label="Confidence" value={(risk.confidence * 100).toFixed(0)} unit="%" icon={Droplets} accent="var(--color-stone)" hint="Model prediction confidence" />
            <StatCard label="Rainfall" value={risk.rainfall_mm ?? '—'} unit="mm" icon={CloudRain} />
            <StatCard label="Ground Vibration" value={risk.ground_vibration ?? '—'} unit="Hz" icon={Activity} />
            <StatCard label="Soil Moisture" value={risk.soil_moisture ?? '—'} unit="%" icon={Droplets} />
            <StatCard label="Temperature" value={risk.temperature_c?.toFixed(1) ?? '—'} unit="°C" icon={Thermometer} />
          </div>
        </div>

        {/* AI summary strip */}
        {insight?.available && (
          <div className="bg-panel border border-signal/30 rounded-lg p-5">
            <div className="flex items-start justify-between gap-4 mb-2">
              <h2 className="font-display text-sm font-semibold text-stone uppercase tracking-wider">
                AI Assessment
              </h2>
              <span
                className="font-mono text-xs shrink-0 flex items-center gap-1.5"
                style={{ color: TREND_COLOR[insight.trend.direction] }}
              >
                {TREND_ARROW[insight.trend.direction]} {insight.trend.label}
              </span>
            </div>
            <p className="text-sm text-slate-muted leading-relaxed">{insight.narrative}</p>
            <Link to="/live" className="inline-flex items-center gap-1.5 text-xs text-signal hover:text-stone mt-3 transition-colors">
              Full analysis, drivers and forecast <ArrowRight size={12} />
            </Link>
          </div>
        )}

        {/* Trend chart */}
        <div className="bg-panel border border-line rounded-lg p-6">
          <h2 className="font-display text-sm font-semibold text-stone mb-4 uppercase tracking-wider">
            Risk Trend — {site?.name}
          </h2>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
              <XAxis dataKey="time" stroke="var(--color-slate-muted)" fontSize={11} minTickGap={25} />
              <YAxis stroke="var(--color-slate-muted)" fontSize={11} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: 'var(--color-panel-raised)', border: '1px solid var(--color-line)', fontSize: 12 }} />
              <ReferenceLine y={ALERT_THRESHOLD} stroke="var(--color-critical)" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="Final Risk" stroke="var(--color-hazard)" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Sensor Risk" stroke="var(--color-signal)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="Weather Risk" stroke="var(--color-safe)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Recent alerts */}
        <div className="bg-panel border border-line rounded-lg p-6">
          <h2 className="font-display text-sm font-semibold text-stone mb-4 uppercase tracking-wider flex items-center gap-2">
            <BellRing size={15} className="text-hazard" /> Latest Alerts — {site?.name}
          </h2>
          {alerts.length === 0 ? (
            <p className="text-sm text-slate-muted">
              No alerts raised for this site. Risk has stayed below the {ALERT_THRESHOLD}% threshold.
            </p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-4 text-sm border-b border-line last:border-0 pb-2 last:pb-0">
                  <span className="text-stone">{a.message}</span>
                  <span className="font-mono text-xs shrink-0" style={{ color: colorForLevel(a.risk_level) }}>
                    {new Date(a.timestamp).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
