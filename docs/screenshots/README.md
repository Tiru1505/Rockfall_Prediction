# Screenshot shot list

Save captures here with these **exact filenames** — the main README already
references them, so they appear automatically once the files exist.

| Filename | Page | What to capture |
|---|---|---|
| `dashboard.png` | `/` | Risk gauge, the four stat cards, AI assessment strip and trend chart all visible |
| `live-monitor.png` | `/live` | Top half — engine bar showing "running", the gauge and the Live Risk Stream chart |
| `ai-insight.png` | `/live` | Scrolled to the AI Risk Assessment panel — narrative, drivers, forecast, recommendations |
| `drill-critical.png` | `/live` | **During a drill at Critical** — red banner, gauge above 80%, escalated recommendations |
| `mining-sites.png` | `/sites` | The site cards grid, showing several sites with different risk values |
| `site-graphs.png` | `/site-graphs` | Risk-over-time chart plus a couple of the panels below it |
| `alerts.png` | `/alerts` | Alert list with the red **DRILL** badges visible |

## How to capture

**Windows:** `Win + Shift + S` → drag the region → paste into Paint → save as PNG.
Or `Win + PrtScn` for the full screen (saves to `Pictures/Screenshots`).

**Browser full-page capture** (better for long pages like Site Graphs):
F12 → `Ctrl + Shift + P` → type "screenshot" → *Capture full size screenshot*.

## Tips for good screenshots

- **Use dark mode** (the default) — it's the designed look and reads better on
  GitHub, which most people browse in dark theme.
- **Maximise the browser** and use around 1400–1600px wide. Very wide captures
  get scaled down and the text becomes unreadable.
- **Get the drill shot at its peak.** Start a drill, press **Tick now** until the
  gauge is red and Critical, *then* capture. That single image shows the alert
  banner, the crossed threshold on the chart, and the CRITICAL recommendation —
  the most compelling frame in the whole app.
- **Crop out browser chrome** (tabs, address bar, bookmarks) unless you
  specifically want to show the live URL.
- **Keep files under ~500 KB each.** PNG is fine at this size; if a file is
  several MB, compress it at https://tinypng.com so the repo stays light.

## Optional: a GIF instead

A short screen recording of the drill escalating from Low to Critical is more
convincing than a still. Record with ScreenToGif (free, Windows), save as
`drill.gif` here, and swap the drill line in the main README to:

```markdown
![Drill escalation](docs/screenshots/drill.gif)
```

Keep it under ~10 MB and around 10–15 seconds.
