import {
  Brain, TrendingUp, AlertTriangle, ListChecks, Activity, Clock, Info,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { PRIORITY_COLOR, TREND_ARROW, TREND_COLOR } from '../lib/risk'

const DRIVER_COLOR = {
  image: 'var(--color-hazard)',
  sensor: 'var(--color-signal)',
  weather: 'var(--color-safe)',
}

function Section({ icon: Icon, title, children, accent = 'var(--color-signal)' }) {
  return (
    <div className="bg-panel border border-line rounded-lg p-5">
      <h3 className="font-display text-xs font-semibold text-stone mb-4 uppercase tracking-wider flex items-center gap-2">
        <Icon size={14} style={{ color: accent }} /> {title}
      </h3>
      {children}
    </div>
  )
}

export default function AIInsightPanel({ insight }) {
  if (!insight) {
    return (
      <div className="bg-panel border border-line rounded-lg p-6 text-sm text-slate-muted">
        Loading risk analysis…
      </div>
    )
  }

  if (!insight.available) {
    return (
      <div className="bg-panel border border-line rounded-lg p-6">
        <h3 className="font-display text-xs font-semibold text-stone mb-2 uppercase tracking-wider flex items-center gap-2">
          <Brain size={14} className="text-signal" /> Risk Analysis
        </h3>
        <p className="text-sm text-slate-muted">{insight.narrative}</p>
      </div>
    )
  }

  const { trend, stability, drivers, forecast, anomalies, recommendations } = insight

  // Stitch the forecast onto the tail of the observed series so the projection
  // continues the same line rather than starting from a disconnected point.
  const forecastData = forecast.map((f) => ({
    label: `+${f.step}`,
    projected: f.projected,
    band: [f.lower, f.upper],
  }))

  return (
    <div className="space-y-5">
      {/* Narrative */}
      <div className="bg-panel border border-signal/30 rounded-lg p-5">
        <h3 className="font-display text-xs font-semibold text-stone mb-3 uppercase tracking-wider flex items-center gap-2">
          <Brain size={14} className="text-signal" /> AI Risk Assessment
          <span className="ml-auto font-mono text-[10px] normal-case tracking-normal text-slate-muted">
            {insight.readings_analysed} readings analysed
          </span>
        </h3>
        <p className="text-sm text-stone leading-relaxed">{insight.narrative}</p>

        <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-line">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-muted">Trend</div>
            <div className="font-mono text-sm flex items-center gap-1.5" style={{ color: TREND_COLOR[trend.direction] }}>
              <span>{TREND_ARROW[trend.direction]}</span> {trend.label}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-muted">Slope</div>
            <div className="font-mono text-sm text-stone">
              {trend.slope_per_reading > 0 ? '+' : ''}{trend.slope_per_reading}/reading
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-muted">Stability</div>
            <div className="font-mono text-sm text-stone">
              {stability.label} <span className="text-slate-muted">σ={stability.volatility}</span>
            </div>
          </div>
          {insight.eta_to_threshold != null && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-muted flex items-center gap-1">
                <Clock size={9} /> To threshold
              </div>
              <div className="font-mono text-sm text-hazard">
                ~{Math.round(insight.eta_to_threshold)} readings
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Driver decomposition */}
        <Section icon={Activity} title="What's Driving the Score" accent="var(--color-hazard)">
          <div className="space-y-3">
            {drivers.map((d) => (
              <div key={d.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-stone">{d.label}</span>
                  <span className="font-mono text-slate-muted">
                    raw {d.raw.toFixed(1)}% × {d.weight} ={' '}
                    <span className="text-stone">{d.contribution.toFixed(1)}</span>
                  </span>
                </div>
                <div className="h-2 bg-panel-raised rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${d.share_pct}%`, background: DRIVER_COLOR[d.key] }}
                  />
                </div>
                <div className="text-[10px] font-mono text-slate-muted mt-0.5">
                  {d.share_pct}% of total score
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Forecast */}
        <Section icon={TrendingUp} title="Projection (next 6 readings)">
          {forecastData.length === 0 ? (
            <p className="text-sm text-slate-muted">Not enough history to project yet.</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={170}>
                <AreaChart data={forecastData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
                  <XAxis dataKey="label" stroke="var(--color-slate-muted)" fontSize={10} />
                  <YAxis stroke="var(--color-slate-muted)" fontSize={10} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: 'var(--color-panel-raised)', border: '1px solid var(--color-line)', fontSize: 12 }}
                    formatter={(value, name) =>
                      name === 'band'
                        ? [`${value[0]}% – ${value[1]}%`, 'Confidence band']
                        : [`${value}%`, 'Projected']
                    }
                  />
                  <Area dataKey="band" stroke="none" fill="var(--color-signal)" fillOpacity={0.15} isAnimationActive={false} />
                  <Area dataKey="projected" stroke="var(--color-signal)" strokeWidth={2} fill="none" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
              <p className="text-[11px] text-slate-muted mt-2 leading-snug flex gap-1.5">
                <Info size={11} className="mt-0.5 shrink-0" />
                Linear extrapolation of the fitted trend. The band widens with √step from the
                window&apos;s own volatility — it is not a physical failure model.
              </p>
            </>
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Anomalies */}
        <Section icon={AlertTriangle} title="Anomaly Detection" accent="var(--color-critical)">
          {anomalies.length === 0 ? (
            <p className="text-sm text-slate-muted">
              All channels within their normal range (|modified z| &lt; 3.5).
            </p>
          ) : (
            <ul className="space-y-2.5">
              {anomalies.map((a) => (
                <li key={a.channel} className="flex items-start gap-3 text-sm">
                  <span
                    className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: a.severity === 'high' ? 'var(--color-critical)' : 'var(--color-hazard)' }}
                  />
                  <span className="flex-1">
                    <span className="text-stone">{a.label}</span>{' '}
                    <span className="text-slate-muted">
                      is {a.direction} baseline —{' '}
                      <span className="font-mono text-stone">{a.value}{a.unit}</span>{' '}
                      vs <span className="font-mono">{a.baseline}{a.unit}</span>
                    </span>
                    <span className="block text-[11px] font-mono text-slate-muted">
                      z = {a.z_score} · {a.severity}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Recommendations */}
        <Section icon={ListChecks} title="Recommended Actions" accent="var(--color-safe)">
          <ul className="space-y-2.5">
            {recommendations.map((r, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span
                  className="text-[9px] uppercase tracking-widest font-mono px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                  style={{
                    color: PRIORITY_COLOR[r.priority],
                    border: `1px solid color-mix(in srgb, ${PRIORITY_COLOR[r.priority]} 40%, transparent)`,
                  }}
                >
                  {r.priority}
                </span>
                <span className="text-stone leading-snug">{r.action}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  )
}
