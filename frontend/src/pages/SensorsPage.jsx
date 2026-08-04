import { useEffect, useState } from 'react'
import { Activity, Waves, Droplets, Gauge as GaugeIcon } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import api from '../api/client'
import StatCard from '../components/StatCard'
import Topbar from '../components/Topbar'
import { useSite } from '../context/SiteContext'

export default function SensorsPage() {
  const { site, siteId } = useSite()
  const [reading, setReading] = useState(null)
  const [quakes, setQuakes] = useState([])
  const [history, setHistory] = useState([])

  useEffect(() => {
    if (!siteId) return
    // Each site has its own drifting sensor state, so switching sites must
    // start a fresh trace rather than appending to the previous site's.
    setReading(null)
    setHistory([])

    async function poll() {
      const { data } = await api.get('/sensors/live', { params: { site_id: siteId } })
      setReading(data)
      setHistory((h) => [...h.slice(-29), { time: new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), Vibration: data.ground_vibration, Tilt: data.tilt_deg }])
    }
    poll()
    api.get('/earthquakes/recent?limit=6').then((res) => setQuakes(res.data))
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [siteId])

  if (!reading) return <div className="flex-1"><Topbar title="Sensors" subtitle="Loading…" /></div>

  return (
    <div className="flex-1">
      <Topbar
        title="Sensor Monitoring"
        subtitle={`${site?.name ?? 'Site'} — simulated IoT feed (vibration, tilt, soil moisture) seasoned with real seismic data`}
      />

      <div className="p-8 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Ground Vibration" value={reading.ground_vibration} unit="Hz" icon={Activity} accent="var(--color-hazard)" />
          <StatCard label="Tilt" value={reading.tilt_deg} unit="°" icon={GaugeIcon} accent="var(--color-signal)" />
          <StatCard label="Soil Moisture" value={reading.soil_moisture} unit="%" icon={Droplets} accent="var(--color-safe)" />
          <StatCard label="Seismic Index" value={reading.seismic_activity} unit="%" icon={Waves} hint="From real earthquake catalog" />
        </div>

        <div className="bg-panel border border-line rounded-lg p-6">
          <h2 className="font-display text-sm font-semibold text-stone mb-4 uppercase tracking-wider">Live Vibration &amp; Tilt</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
              <XAxis dataKey="time" stroke="var(--color-slate-muted)" fontSize={10} />
              <YAxis stroke="var(--color-slate-muted)" fontSize={11} />
              <Tooltip contentStyle={{ background: 'var(--color-panel-raised)', border: '1px solid var(--color-line)', fontSize: 12 }} />
              <Line type="monotone" dataKey="Vibration" stroke="var(--color-hazard)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Tilt" stroke="var(--color-signal)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-panel border border-line rounded-lg p-6">
          <h2 className="font-display text-sm font-semibold text-stone mb-4 uppercase tracking-wider">Recent Seismic Events</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-slate-muted border-b border-line">
                <th className="pb-2">Time</th>
                <th className="pb-2">Place</th>
                <th className="pb-2">Magnitude</th>
                <th className="pb-2">Depth (km)</th>
              </tr>
            </thead>
            <tbody>
              {quakes.map((q, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="py-2 font-mono text-xs text-slate-muted">{new Date(q.time).toLocaleString()}</td>
                  <td className="py-2 text-stone">{q.place}</td>
                  <td className="py-2 font-mono" style={{ color: q.magnitude >= 6 ? 'var(--color-critical)' : 'var(--color-hazard)' }}>{q.magnitude}</td>
                  <td className="py-2 font-mono text-slate-muted">{q.depth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
