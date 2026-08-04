const LEVELS = [
  { max: 20, color: 'var(--color-safe)', label: 'Safe' },
  { max: 40, color: '#7fb896', label: 'Low' },
  { max: 60, color: 'var(--color-hazard)', label: 'Medium' },
  { max: 80, color: '#d47a3a', label: 'High' },
  { max: 101, color: 'var(--color-critical)', label: 'Critical' },
]

function colorFor(value) {
  return LEVELS.find((l) => value < l.max)?.color || 'var(--color-critical)'
}

export default function RiskGauge({ value = 0, size = 220 }) {
  const clamped = Math.max(0, Math.min(100, value))
  const radius = size / 2 - 18
  const circumference = 2 * Math.PI * radius
  const angle = (clamped / 100) * 270 - 135 // -135deg to +135deg sweep
  const color = colorFor(clamped)

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* strata bands - concentric arcs representing rock layers */}
        {LEVELS.map((lvl, i) => {
          const bandRadius = radius - i * 6
          const bandCirc = 2 * Math.PI * bandRadius
          const sweepFraction = 0.75 // 270/360
          return (
            <circle
              key={lvl.label}
              cx={size / 2}
              cy={size / 2}
              r={bandRadius}
              fill="none"
              stroke={lvl.color}
              strokeOpacity={0.18}
              strokeWidth={4}
              strokeDasharray={`${bandCirc * sweepFraction} ${bandCirc}`}
              strokeDashoffset={bandCirc * 0.125}
              transform={`rotate(90 ${size / 2} ${size / 2})`}
              strokeLinecap="round"
            />
          )
        })}

        {/* active progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.75} ${circumference}`}
          strokeDashoffset={circumference * 0.75 * (1 - clamped / 100) + circumference * 0.125}
          transform={`rotate(90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.6s ease' }}
        />

        {/* needle */}
        <g transform={`rotate(${angle} ${size / 2} ${size / 2})`} style={{ transition: 'transform 0.6s ease' }}>
          <line
            x1={size / 2}
            y1={size / 2}
            x2={size / 2}
            y2={size / 2 - radius + 14}
            stroke="var(--color-stone)"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </g>
        <circle cx={size / 2} cy={size / 2} r={5} fill="var(--color-stone)" />
      </svg>

      {clamped >= 80 && (
        <span
          className="absolute rounded-full border-2 pulse-ring"
          style={{ width: size - 30, height: size - 30, borderColor: color }}
        />
      )}

      <div className="absolute flex flex-col items-center">
        <span className="font-mono text-4xl font-semibold" style={{ color }}>
          {clamped.toFixed(0)}
          <span className="text-lg">%</span>
        </span>
        <span className="text-xs tracking-widest uppercase text-slate-muted mt-1">
          {LEVELS.find((l) => clamped < l.max)?.label || 'Critical'}
        </span>
      </div>
    </div>
  )
}
