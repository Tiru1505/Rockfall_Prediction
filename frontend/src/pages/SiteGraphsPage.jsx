import { useEffect, useState, useCallback } from 'react'
import {
  LineChart, Line, ComposedChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'
import { TrendingUp, Activity, CloudRain, PieChart as PieIcon, BellRing, Layers } from 'lucide-react'
import api from '../api/client'
import Topbar from '../components/Topbar'
import StatCard from '../components/StatCard'
import { useSite } from '../context/SiteContext'
import { colorForLevel, shortTime, LEVEL_COLOR } from '../lib/risk'

const RANGES = [
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: '30d', hours: 720 },
]

const ALERT_THRESHOLD = 80

const tooltipStyle = {
  background: 'var(--color-panel-raised)',
  border: '1px solid var(--color-line)',
  fontSize: 12,
}

function Panel({ icon: Icon, title, accent = 'var(--color-signal)', children, subtitle }) {
  return (
    <div className="bg-panel border border-line rounded-lg p-6">
      <div className="mb-4">
        <h2 className="font-display text-sm font-semibold text-stone uppercase tracking-wider flex items-center gap-2">
          <Icon size={15} style={{ color: accent }} /> {title}
        </h2>
        {subtitle && <p className="text-xs text-slate-muted mt-1">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Empty({ children }) {
  return <p className="text-sm text-slate-muted py-8 text-center">{children}</p>
}

export default function SiteGraphsPage() {
  const { site, siteId, sites, selectSite } = useSite()
  const [hours, setHours] = useState(24)
  const [charts, setCharts] = useState(null)
  const [compare, setCompare] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!siteId) return
    setLoading(true)
    try {
      const [chartsRes, compareRes] = await Promise.all([
        api.get(`/sites/${siteId}/charts`, { params: { hours, points: 500 } }),
        api.get(`/sites/${siteId}/compare`, { params: { hours } }),
      ])
      setCharts(chartsRes.data)
      setCompare(compareRes.data)
    } finally {
      setLoading(false)
    }
  }, [siteId, hours])

  useEffect(() => {
    load()
    const id = setInterval(load, 20000)
    return () => clearInterval(id)
  }, [load])

  if (!siteId) {
    return (
      <div className="flex-1">
        <Topbar title="Site Graphs" subtitle="No site selected" />
        <div className="p-8"><p className="text-sm text-slate-muted">Add a mining site first.</p></div>
      </div>
    )
  }

  const risk = (charts?.risk_series ?? []).map((p) => ({ ...p, time: shortTime(p.t) }))
  const sensor = (charts?.sensor_series ?? []).map((p) => ({ ...p, time: shortTime(p.t) }))
  const weather = (charts?.weather_series ?? []).map((p) => ({ ...p, time: shortTime(p.t) }))
  const dist = charts?.level_distribution ?? []
  const alerts = (charts?.alerts_per_hour ?? []).map((a) => ({ ...a, hour: a.hour.slice(5) }))
  const stats = charts?.stats

  return (
    <div className="flex-1">
      <Topbar
        title="Site Graphs"
        subtitle={site ? `${site.name} — ${site.location || site.site_id}` : 'Per-site charts'}
      />

      <div className="p-8 space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 bg-panel border border-line rounded-md p-1">
            {RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setHours(r.hours)}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  hours === r.hours
                    ? 'bg-panel-raised text-stone'
                    : 'text-slate-muted hover:text-stone'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <select
            value={siteId}
            onChange={(e) => selectSite(e.target.value)}
            className="bg-panel border border-line rounded-md px-3 py-2 text-sm text-stone focus:outline-none focus:border-signal"
            aria-label="Select site"
          >
            {sites.map((s) => (
              <option key={s.site_id} value={s.site_id}>{s.name}</option>
            ))}
          </select>

          <span className="text-xs text-slate-muted font-mono ml-auto">
            {loading ? 'refreshing…' : `${charts?.point_count ?? 0} readings in window`}
          </span>
        </div>

        {/* Window stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Average Risk" value={stats.avg_risk} unit="%" icon={TrendingUp} accent="var(--color-signal)" />
            <StatCard label="Peak Risk" value={stats.peak_risk} unit="%" icon={TrendingUp} accent="var(--color-critical)" />
            <StatCard label="Lowest Risk" value={stats.min_risk} unit="%" icon={TrendingUp} accent="var(--color-safe)" />
            <StatCard label="Alerts in Window" value={stats.alert_count} icon={BellRing} accent="var(--color-hazard)" />
          </div>
        )}

        {/* Fused risk + components */}
        <Panel
          icon={TrendingUp}
          title="Risk Over Time"
          accent="var(--color-hazard)"
          subtitle="Fused score with each contributing signal"
        >
          {risk.length === 0 ? <Empty>No readings for this site in the selected window.</Empty> : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={risk}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                <XAxis dataKey="time" stroke="var(--color-slate-muted)" fontSize={10} minTickGap={30} />
                <YAxis stroke="var(--color-slate-muted)" fontSize={11} domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={ALERT_THRESHOLD} stroke="var(--color-critical)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="final" name="Fused" stroke="var(--color-hazard)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="sensor" name="Sensor" stroke="var(--color-signal)" strokeWidth={1.2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="weather" name="Weather" stroke="var(--color-safe)" strokeWidth={1.2} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="image" name="Imagery" stroke="#a98b6f" strokeWidth={1.2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Sensor channels */}
          <Panel icon={Activity} title="Geotechnical Sensors" accent="var(--color-signal)"
            subtitle="Ground vibration, slope tilt and soil moisture">
            {sensor.length === 0 ? <Empty>No sensor readings in this window.</Empty> : (
              <ResponsiveContainer width="100%" height={250}>
                {/* ComposedChart, not AreaChart — this panel mixes an Area
                    (vibration) with two Lines (tilt, moisture). */}
                <ComposedChart data={sensor}>
                  <defs>
                    <linearGradient id="vibFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-hazard)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-hazard)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="time" stroke="var(--color-slate-muted)" fontSize={10} minTickGap={30} />
                  <YAxis stroke="var(--color-slate-muted)" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="vibration" name="Vibration (Hz)" stroke="var(--color-hazard)" fill="url(#vibFill)" strokeWidth={1.8} isAnimationActive={false} />
                  <Line type="monotone" dataKey="tilt" name="Tilt (°)" stroke="var(--color-signal)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="moisture" name="Moisture (%)" stroke="var(--color-safe)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Weather channels */}
          <Panel icon={CloudRain} title="Weather Conditions" accent="var(--color-safe)"
            subtitle="Rainfall, humidity and temperature at this site">
            {weather.length === 0 ? <Empty>No weather readings in this window.</Empty> : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={weather}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="time" stroke="var(--color-slate-muted)" fontSize={10} minTickGap={30} />
                  <YAxis yAxisId="left" stroke="var(--color-slate-muted)" fontSize={11} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--color-slate-muted)" fontSize={11} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="humidity" name="Humidity (%)" stroke="var(--color-signal)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line yAxisId="left" type="monotone" dataKey="temperature" name="Temp (°C)" stroke="var(--color-hazard)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  <Line yAxisId="right" type="monotone" dataKey="rainfall" name="Rainfall (mm)" stroke="var(--color-safe)" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Level distribution */}
          <Panel icon={PieIcon} title="Risk Level Distribution" accent="var(--color-hazard)"
            subtitle="How this site's readings split across categories">
            {dist.length === 0 ? <Empty>No readings to categorise.</Empty> : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={dist} dataKey="count" nameKey="level" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {dist.map((d) => <Cell key={d.level} fill={LEVEL_COLOR[d.level] || '#8b939b'} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Panel>

          {/* Driver radar */}
          <Panel icon={Layers} title="Current Risk Signature" accent="var(--color-signal)"
            subtitle="Normalised 0–100 across every monitored channel, right now">
            {!charts?.driver_radar ? <Empty>No current reading.</Empty> : (
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={charts.driver_radar}>
                  <PolarGrid stroke="var(--color-line)" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: 'var(--color-slate-muted)', fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fill: 'var(--color-slate-muted)', fontSize: 9 }} />
                  <Radar
                    name={site?.name ?? 'Site'}
                    dataKey="value"
                    stroke={colorForLevel(site?.current_level)}
                    fill={colorForLevel(site?.current_level)}
                    fillOpacity={0.3}
                    isAnimationActive={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </Panel>
        </div>

        {/* Alerts over time */}
        <Panel icon={BellRing} title="Alerts Per Hour" accent="var(--color-critical)"
          subtitle="Threshold breaches recorded at this site">
          {alerts.length === 0 ? <Empty>No alerts raised in this window.</Empty> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={alerts}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                <XAxis dataKey="hour" stroke="var(--color-slate-muted)" fontSize={10} minTickGap={20} />
                <YAxis stroke="var(--color-slate-muted)" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" name="Alerts" fill="var(--color-critical)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* Cross-site comparison */}
        <Panel icon={Layers} title="Site Comparison" accent="var(--color-hazard)"
          subtitle="Average and peak risk across every site over the same window">
          {compare.length === 0 ? <Empty>No comparable sites.</Empty> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={compare} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                <XAxis type="number" domain={[0, 100]} stroke="var(--color-slate-muted)" fontSize={11} />
                <YAxis
                  type="category" dataKey="name" width={180}
                  stroke="var(--color-slate-muted)" fontSize={10}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="avg_risk" name="Average" radius={[0, 4, 4, 0]}>
                  {compare.map((c) => (
                    <Cell
                      key={c.site_id}
                      fill={c.is_selected ? 'var(--color-hazard)' : 'var(--color-signal)'}
                      fillOpacity={c.is_selected ? 1 : 0.5}
                    />
                  ))}
                </Bar>
                <Bar dataKey="peak_risk" name="Peak" fill="var(--color-critical)" fillOpacity={0.55} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>
    </div>
  )
}
