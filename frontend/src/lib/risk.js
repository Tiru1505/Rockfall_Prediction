/** Shared risk-level palette and formatting, so every view agrees on colour. */

export const LEVEL_COLOR = {
  Safe: 'var(--color-safe)',
  Low: '#7fb896',
  Medium: 'var(--color-hazard)',
  High: '#d47a3a',
  Critical: 'var(--color-critical)',
}

const THRESHOLDS = [
  { max: 20, level: 'Safe' },
  { max: 40, level: 'Low' },
  { max: 60, level: 'Medium' },
  { max: 80, level: 'High' },
  { max: Infinity, level: 'Critical' },
]

export function levelFor(value) {
  return THRESHOLDS.find((t) => (value ?? 0) < t.max).level
}

export function colorFor(value) {
  return LEVEL_COLOR[levelFor(value)]
}

export function colorForLevel(level) {
  return LEVEL_COLOR[level] || 'var(--color-slate-muted)'
}

export const PRIORITY_COLOR = {
  critical: 'var(--color-critical)',
  high: '#d47a3a',
  medium: 'var(--color-hazard)',
  low: 'var(--color-safe)',
}

/** '2026-08-04T06:12:33' -> '06:12' */
export function shortTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function relativeTime(ts) {
  if (!ts) return 'never'
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export const TREND_ARROW = {
  rising_fast: '▲▲',
  rising: '▲',
  stable: '▬',
  falling: '▼',
  falling_fast: '▼▼',
}

export const TREND_COLOR = {
  rising_fast: 'var(--color-critical)',
  rising: 'var(--color-hazard)',
  stable: 'var(--color-slate-muted)',
  falling: 'var(--color-safe)',
  falling_fast: 'var(--color-safe)',
}
