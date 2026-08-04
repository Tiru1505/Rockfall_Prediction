export default function StatCard({ label, value, unit, icon: Icon, accent = 'var(--color-signal)', hint }) {
  return (
    <div className="bg-panel border border-line rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-slate-muted">{label}</span>
        {Icon && <Icon size={16} style={{ color: accent }} />}
      </div>
      <div className="font-mono text-2xl font-medium text-stone">
        {value}
        {unit && <span className="text-sm text-slate-muted ml-1">{unit}</span>}
      </div>
      {hint && <span className="text-xs text-slate-muted">{hint}</span>}
    </div>
  )
}
