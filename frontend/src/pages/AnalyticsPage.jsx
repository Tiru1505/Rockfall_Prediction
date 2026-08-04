import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts'
import api from '../api/client'
import StatCard from '../components/StatCard'
import Topbar from '../components/Topbar'
import ScopeToggle from '../components/ScopeToggle'
import { useSite } from '../context/SiteContext'
import { LEVEL_COLOR, colorForLevel } from '../lib/risk'
import { BarChart3, BellRing, Percent, Database, Mountain } from 'lucide-react'

const tooltipStyle = {
  background: 'var(--color-panel-raised)',
  border: '1px solid var(--color-line)',
  fontSize: 12,
}

export default function AnalyticsPage() {
  const { siteId, sites, site } = useSite()
  const [summary, setSummary] = useState(null)
  const [scoped, setScoped] = useState(false)

  const load = useCallback(async () => {
    const params = scoped && siteId ? { site_id: siteId } : {}
    const { data } = await api.get('/analytics/summary', { params })
    setSummary(data)
  }, [scoped, siteId])

  useEffect(() => {
    setSummary(null)
    load()
  }, [load])

  if (!summary) return <div className="flex-1"><Topbar title="Analytics" subtitle="Loading…" /></div>

  const distData = Object.entries(summary.risk_distribution).map(([level, count]) => ({ level, count }))
  const dailyData = summary.predictions_last_30_days

  // Cross-site comparison comes straight from the site list, which already
  // carries each site's current risk and 24h average.
  const siteComparison = sites.map((s) => ({
    name: s.name.length > 26 ? `${s.name.slice(0, 24)}…` : s.name,
    site_id: s.site_id,
    current: s.current_risk ?? 0,
    avg24h: s.avg_risk_24h ?? 0,
    level: s.current_level,
  }))

  return (
    <div className="flex-1">
      <Topbar
        title="Analytics"
        subtitle={scoped && site
          ? `Aggregated statistics for ${site.name}`
          : 'Aggregated statistics across every monitored site'}
      />

      <div className="p-8 space-y-6">
        <div className="flex justify-end">
          <ScopeToggle scoped={scoped} onChange={setScoped} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Predictions" value={summary.total_predictions} icon={Database} />
          <StatCard label="Total Alerts" value={summary.total_alerts} icon={BellRing} accent="var(--color-hazard)" />
          <StatCard label="Avg. Final Risk" value={summary.avg_final_risk} unit="%" icon={Percent} accent="var(--color-signal)" />
          <StatCard label="Risk Categories" value={distData.length} icon={BarChart3} />
          <StatCard label="Monitored Sites" value={sites.length} icon={Mountain} accent="var(--color-safe)" />
        </div>

        {/* Cross-site comparison */}
        <div className="bg-panel border border-line rounded-lg p-6">
          <h2 className="font-display text-sm font-semibold text-stone mb-1 uppercase tracking-wider">
            Risk by Site
          </h2>
          <p className="text-xs text-slate-muted mb-4">
            Current fused score against each site&apos;s 24-hour average
          </p>
          {siteComparison.length === 0 ? (
            <p className="text-sm text-slate-muted">No sites configured.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, siteComparison.length * 62)}>
              <BarChart data={siteComparison} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                <XAxis type="number" domain={[0, 100]} stroke="var(--color-slate-muted)" fontSize={11} />
                <YAxis type="category" dataKey="name" width={190} stroke="var(--color-slate-muted)" fontSize={10} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="current" name="Current" radius={[0, 4, 4, 0]}>
                  {siteComparison.map((s) => (
                    <Cell key={s.site_id} fill={colorForLevel(s.level)} />
                  ))}
                </Bar>
                <Bar dataKey="avg24h" name="24h average" fill="var(--color-signal)" fillOpacity={0.5} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-panel border border-line rounded-lg p-6">
            <h2 className="font-display text-sm font-semibold text-stone mb-4 uppercase tracking-wider">Risk Distribution</h2>
            {distData.length === 0 ? (
              <p className="text-sm text-slate-muted">No predictions recorded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={distData} dataKey="count" nameKey="level" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {distData.map((d) => <Cell key={d.level} fill={LEVEL_COLOR[d.level] || '#8b939b'} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-panel border border-line rounded-lg p-6">
            <h2 className="font-display text-sm font-semibold text-stone mb-4 uppercase tracking-wider">Predictions (Last 30 Days)</h2>
            {dailyData.length === 0 ? (
              <p className="text-sm text-slate-muted">No predictions in the last 30 days.</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="date" stroke="var(--color-slate-muted)" fontSize={10} />
                  <YAxis stroke="var(--color-slate-muted)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill="var(--color-hazard)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
