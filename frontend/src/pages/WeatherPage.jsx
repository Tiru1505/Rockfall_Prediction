import { useEffect, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { CloudRain, Droplets, Wind, Gauge } from 'lucide-react'
import api from '../api/client'
import StatCard from '../components/StatCard'
import Topbar from '../components/Topbar'
import { useSite } from '../context/SiteContext'

export default function WeatherPage() {
  const { site, siteId } = useSite()
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!siteId) return
    setData(null)
    const params = { trend_points: 72, site_id: siteId }
    const fetch = () => api.get('/weather/summary', { params }).then((res) => setData(res.data))
    fetch()
    const id = setInterval(fetch, 30000)
    return () => clearInterval(id)
  }, [siteId])

  if (!data) return <div className="flex-1"><Topbar title="Weather" subtitle="Loading…" /></div>

  const chartData = data.trend.map((p) => ({
    time: new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit' }),
    Rainfall: p.rainfall_mm,
    Humidity: p.humidity_pct,
  }))

  return (
    <div className="flex-1">
      <Topbar
        title="Weather"
        subtitle={`${site?.name ?? 'Site'} — station weather feed (rainfall, humidity, wind, pressure)`}
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Rainfall" value={data.latest.rainfall_mm ?? '—'} unit="mm" icon={CloudRain} accent="var(--color-signal)" />
          <StatCard label="Humidity" value={data.latest.humidity_pct ?? '—'} unit="%" icon={Droplets} accent="var(--color-safe)" />
          <StatCard label="Wind Speed" value={data.latest.wind_speed ?? '—'} unit="mph" icon={Wind} accent="var(--color-hazard)" />
          <StatCard label="Pressure" value={data.latest.pressure ?? '—'} unit="inHg" icon={Gauge} />
        </div>

        <div className="bg-panel border border-line rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-sm font-semibold text-stone uppercase tracking-wider">Weather Risk Index</h2>
            <span className="font-mono text-lg" style={{ color: 'var(--color-hazard)' }}>{data.weather_risk}%</span>
          </div>
          <p className="text-sm text-slate-muted mb-4">Weighted from rainfall (55%), humidity (30%) and wind speed (15%) — the strongest environmental rockfall triggers.</p>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="rain" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-signal)" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="var(--color-signal)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
              <XAxis dataKey="time" stroke="var(--color-slate-muted)" fontSize={11} />
              <YAxis stroke="var(--color-slate-muted)" fontSize={11} />
              <Tooltip contentStyle={{ background: 'var(--color-panel-raised)', border: '1px solid var(--color-line)', fontSize: 12 }} />
              <Area type="monotone" dataKey="Rainfall" stroke="var(--color-signal)" fill="url(#rain)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
