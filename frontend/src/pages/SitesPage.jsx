import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, MapPin, Mountain, Radio, RadioTower, Trash2, Pencil, X,
  BarChart3, Check, AlertTriangle,
} from 'lucide-react'
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts'
import { useSite } from '../context/SiteContext'
import { useAuth } from '../context/AuthContext'
import Topbar from '../components/Topbar'
import { colorForLevel, relativeTime } from '../lib/risk'

const MINE_TYPES = ['Open-Pit', 'Underground', 'Quarry', 'Strip']

const EMPTY_FORM = {
  name: '',
  location: '',
  latitude: '',
  longitude: '',
  mine_type: 'Open-Pit',
  rock_type: '',
  bench_height_m: 15,
  slope_angle_deg: 45,
  hazard_factor: 1.0,
  monitoring_enabled: true,
  notes: '',
}

/** '' -> null, '12.5' -> 12.5 — the API rejects '' for optional numbers. */
function num(value) {
  if (value === '' || value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

function Field({ label, hint, children }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wider text-slate-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-slate-muted leading-snug">{hint}</span>}
    </label>
  )
}

const inputClass =
  'bg-panel-raised border border-line rounded-md px-3 py-2 text-sm text-stone ' +
  'focus:outline-none focus:border-signal transition-colors'

function SiteForm({ initial, onSubmit, onCancel, submitLabel }) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        name: form.name.trim(),
        location: form.location.trim(),
        latitude: num(form.latitude),
        longitude: num(form.longitude),
        mine_type: form.mine_type,
        rock_type: form.rock_type.trim() || 'Unspecified',
        bench_height_m: num(form.bench_height_m),
        slope_angle_deg: num(form.slope_angle_deg),
        hazard_factor: num(form.hazard_factor),
        monitoring_enabled: form.monitoring_enabled,
        notes: form.notes.trim() || null,
      })
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(
        Array.isArray(detail)
          ? detail.map((d) => `${d.loc?.slice(-1)[0]}: ${d.msg}`).join(' · ')
          : detail || 'Could not save the site.',
      )
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Site name *">
          <input
            className={inputClass} required minLength={2}
            value={form.name} onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Bailadila Iron Ore — Bench 5"
          />
        </Field>

        <Field label="Location">
          <input
            className={inputClass}
            value={form.location} onChange={(e) => set('location', e.target.value)}
            placeholder="District, State"
          />
        </Field>

        <Field label="Latitude" hint="Decimal degrees, −90 to 90">
          <input
            className={inputClass} type="number" step="any" min={-90} max={90}
            value={form.latitude} onChange={(e) => set('latitude', e.target.value)}
            placeholder="18.6667"
          />
        </Field>

        <Field label="Longitude" hint="Decimal degrees, −180 to 180">
          <input
            className={inputClass} type="number" step="any" min={-180} max={180}
            value={form.longitude} onChange={(e) => set('longitude', e.target.value)}
            placeholder="81.2167"
          />
        </Field>

        <Field label="Mine type">
          <select
            className={inputClass}
            value={form.mine_type} onChange={(e) => set('mine_type', e.target.value)}
          >
            {MINE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>

        <Field label="Rock type">
          <input
            className={inputClass}
            value={form.rock_type} onChange={(e) => set('rock_type', e.target.value)}
            placeholder="e.g. Sandstone / Shale interbeds"
          />
        </Field>

        {/* step="any" deliberately: with a fractional `min`, HTML5 anchors the
            step grid at that min (0.1, 0.6, 1.1 …), which makes ordinary whole
            numbers like 15 invalid and blocks submit with no visible reason.
            Range enforcement lives on the server schema. */}
        <Field label="Bench height (m)" hint="Taller benches carry more stored energy">
          <input
            className={inputClass} type="number" step="any" min={0.1} max={200}
            value={form.bench_height_m} onChange={(e) => set('bench_height_m', e.target.value)}
          />
        </Field>

        <Field label="Slope angle (°)" hint="Steeper faces read higher tilt and vibration">
          <input
            className={inputClass} type="number" step="any" min={0} max={90}
            value={form.slope_angle_deg} onChange={(e) => set('slope_angle_deg', e.target.value)}
          />
        </Field>
      </div>

      <Field
        label={`Hazard factor — ${Number(form.hazard_factor).toFixed(2)}×`}
        hint="Baseline hazard multiplier for this rock mass: 0.5 = competent massive rock, 1.0 = typical, 1.5+ = heavily fractured or weathered. Scales this site's simulated sensor baseline."
      >
        <input
          type="range" min={0.5} max={2.0} step={0.01}
          value={form.hazard_factor}
          onChange={(e) => set('hazard_factor', e.target.value)}
          className="accent-hazard"
        />
      </Field>

      <Field label="Notes">
        <textarea
          className={inputClass} rows={2}
          value={form.notes} onChange={(e) => set('notes', e.target.value)}
          placeholder="Operational context, known instabilities, inspection history…"
        />
      </Field>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox" className="accent-hazard w-4 h-4"
          checked={form.monitoring_enabled}
          onChange={(e) => set('monitoring_enabled', e.target.checked)}
        />
        <span className="text-sm text-stone">Include in live monitoring</span>
        <span className="text-xs text-slate-muted">
          — the engine will auto-evaluate this site every cycle
        </span>
      </label>

      {error && (
        <div className="flex items-start gap-2 text-sm text-critical bg-critical/10 border border-critical/30 rounded-md px-3 py-2">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="submit" disabled={busy}
          className="px-4 py-2 rounded-md bg-hazard text-basalt text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {busy ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button" onClick={onCancel}
          className="px-4 py-2 rounded-md border border-line text-sm text-slate-muted hover:text-stone transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

function SiteCard({ site, isActive, onSelect, onEdit, onDelete, canDelete }) {
  const navigate = useNavigate()
  const color = colorForLevel(site.current_level)
  const spark = site.sparkline.map((p, i) => ({ i, risk: p.risk }))

  return (
    <div
      className={`bg-panel border rounded-lg p-5 flex flex-col gap-4 transition-colors ${
        isActive ? 'border-hazard' : 'border-line hover:border-slate-muted/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Mountain size={15} className="text-hazard shrink-0" />
            <h3 className="font-display text-sm font-semibold text-stone truncate">{site.name}</h3>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-muted mt-1">
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{site.location || '—'}</span>
          </div>
        </div>

        {isActive && (
          <span className="text-[10px] uppercase tracking-widest text-hazard border border-hazard/40 rounded px-1.5 py-0.5 shrink-0">
            Viewing
          </span>
        )}
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="font-mono text-3xl font-semibold" style={{ color }}>
            {site.current_risk != null ? site.current_risk.toFixed(1) : '—'}
            <span className="text-base">%</span>
          </div>
          <div className="text-[11px] uppercase tracking-wider" style={{ color }}>
            {site.current_level || 'No readings'}
          </div>
        </div>

        <div className="w-28 h-12">
          {spark.length > 1 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={spark}>
                <YAxis hide domain={['dataMin - 3', 'dataMax + 3']} />
                <Line type="monotone" dataKey="risk" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs border-t border-line pt-3">
        <div className="flex justify-between">
          <dt className="text-slate-muted">Type</dt>
          <dd className="text-stone">{site.mine_type}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-muted">Slope</dt>
          <dd className="font-mono text-stone">{site.slope_angle_deg}°</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-muted">Rock</dt>
          <dd className="text-stone truncate ml-2" title={site.rock_type}>{site.rock_type}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-muted">Hazard</dt>
          <dd className="font-mono text-stone">{site.hazard_factor?.toFixed(2)}×</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-muted">Readings</dt>
          <dd className="font-mono text-stone">{site.total_predictions}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-muted">Open alerts</dt>
          <dd className="font-mono" style={{ color: site.open_alerts > 0 ? 'var(--color-critical)' : 'var(--color-stone)' }}>
            {site.open_alerts}
          </dd>
        </div>
      </dl>

      <div className="flex items-center justify-between text-[11px] text-slate-muted border-t border-line pt-3">
        <span className="flex items-center gap-1.5">
          {site.monitoring_enabled ? (
            <><RadioTower size={12} className="text-safe" /> Monitoring</>
          ) : (
            <><Radio size={12} /> Paused</>
          )}
        </span>
        <span className="font-mono">{relativeTime(site.last_evaluated)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onSelect(site.site_id)}
          disabled={isActive}
          className="flex-1 min-w-[90px] flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-md border border-line text-slate-muted hover:text-stone hover:border-signal disabled:opacity-40 disabled:hover:border-line transition-colors"
        >
          {isActive ? <><Check size={13} /> Selected</> : 'Switch to site'}
        </button>
        <button
          onClick={() => { onSelect(site.site_id); navigate('/site-graphs') }}
          className="flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-md border border-line text-slate-muted hover:text-stone hover:border-signal transition-colors"
          title="Open this site's graphs"
        >
          <BarChart3 size={13} /> Graphs
        </button>
        <button
          onClick={() => onEdit(site)}
          className="p-2 rounded-md border border-line text-slate-muted hover:text-stone transition-colors"
          aria-label={`Edit ${site.name}`}
        >
          <Pencil size={13} />
        </button>
        {canDelete && (
          <button
            onClick={() => onDelete(site)}
            className="p-2 rounded-md border border-line text-slate-muted hover:text-critical hover:border-critical/50 transition-colors"
            aria-label={`Archive ${site.name}`}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function SitesPage() {
  const { sites, siteId, selectSite, createSite, updateSite, deleteSite, loading, error } = useSite()
  const { user } = useAuth()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  const isAdmin = user?.role === 'admin'

  return (
    <div className="flex-1">
      <Topbar
        title="Mining Sites"
        subtitle="Switch between monitored sites, or add a new one to the network"
      />

      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-muted">
            {loading ? 'Loading sites…' : `${sites.length} site${sites.length === 1 ? '' : 's'} in the monitored network`}
          </p>
          {!adding && !editing && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-hazard text-basalt text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <Plus size={15} /> Add Mining Site
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-critical bg-critical/10 border border-critical/30 rounded-md px-4 py-3">
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        {adding && (
          <div className="bg-panel border border-hazard/40 rounded-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-sm font-semibold text-stone uppercase tracking-wider">
                New Mining Site
              </h2>
              <button onClick={() => setAdding(false)} className="text-slate-muted hover:text-stone" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <SiteForm
              submitLabel="Create site"
              onCancel={() => setAdding(false)}
              onSubmit={async (payload) => { await createSite(payload); setAdding(false) }}
            />
          </div>
        )}

        {editing && (
          <div className="bg-panel border border-signal/40 rounded-lg p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-sm font-semibold text-stone uppercase tracking-wider">
                Edit — {editing.name}
              </h2>
              <button onClick={() => setEditing(null)} className="text-slate-muted hover:text-stone" aria-label="Close">
                <X size={16} />
              </button>
            </div>
            <SiteForm
              initial={{
                name: editing.name,
                location: editing.location ?? '',
                latitude: editing.latitude ?? '',
                longitude: editing.longitude ?? '',
                mine_type: editing.mine_type,
                rock_type: editing.rock_type ?? '',
                bench_height_m: editing.bench_height_m ?? 15,
                slope_angle_deg: editing.slope_angle_deg ?? 45,
                hazard_factor: editing.hazard_factor ?? 1,
                monitoring_enabled: Boolean(editing.monitoring_enabled),
                notes: editing.notes ?? '',
              }}
              submitLabel="Save changes"
              onCancel={() => setEditing(null)}
              onSubmit={async (payload) => { await updateSite(editing.site_id, payload); setEditing(null) }}
            />
          </div>
        )}

        {confirmDelete && (
          <div className="bg-panel border border-critical/40 rounded-lg p-6 space-y-4">
            <h2 className="font-display text-sm font-semibold text-critical uppercase tracking-wider">
              Archive {confirmDelete.name}?
            </h2>
            <p className="text-sm text-slate-muted leading-relaxed">
              Archiving stops monitoring and hides the site from the switcher, but keeps its{' '}
              <span className="font-mono text-stone">{confirmDelete.total_predictions}</span> stored
              readings and its alert history intact. Permanent deletion with history purge is
              available from the API (<code className="text-stone">?purge=true</code>) — it is not
              exposed here because it cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => { await deleteSite(confirmDelete.site_id, false); setConfirmDelete(null) }}
                className="px-4 py-2 rounded-md bg-critical text-stone text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Archive site
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-md border border-line text-sm text-slate-muted hover:text-stone transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!loading && sites.length === 0 && !adding && (
          <div className="bg-panel border border-line rounded-lg p-12 text-center">
            <Mountain size={32} className="text-slate-muted mx-auto mb-3" />
            <h2 className="font-display text-stone mb-1">No mining sites yet</h2>
            <p className="text-sm text-slate-muted mb-5">
              Add your first site to start monitoring rockfall risk.
            </p>
            <button
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-hazard text-basalt text-sm font-medium"
            >
              <Plus size={15} /> Add Mining Site
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {sites.map((s) => (
            <SiteCard
              key={s.site_id}
              site={s}
              isActive={s.site_id === siteId}
              onSelect={selectSite}
              onEdit={setEditing}
              onDelete={setConfirmDelete}
              canDelete={isAdmin}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
