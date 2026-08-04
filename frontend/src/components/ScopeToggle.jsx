import { useSite } from '../context/SiteContext'

/**
 * "This site / All sites" switch used by the pages that can show either.
 * `scoped` true means: filter to the currently selected site.
 */
export default function ScopeToggle({ scoped, onChange }) {
  const { site } = useSite()

  return (
    <div className="flex items-center gap-1 bg-panel-raised border border-line rounded-md p-1">
      <button
        onClick={() => onChange(true)}
        className={`text-xs px-3 py-1.5 rounded transition-colors max-w-[180px] truncate ${
          scoped ? 'bg-panel text-stone' : 'text-slate-muted hover:text-stone'
        }`}
        title={site?.name}
      >
        {site?.name ?? 'This site'}
      </button>
      <button
        onClick={() => onChange(false)}
        className={`text-xs px-3 py-1.5 rounded transition-colors ${
          scoped ? 'text-slate-muted hover:text-stone' : 'bg-panel text-stone'
        }`}
      >
        All sites
      </button>
    </div>
  )
}
