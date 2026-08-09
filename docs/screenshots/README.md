# Screenshots

The main README references these exact filenames. Save your captures here with
these names and they render automatically — no README editing needed.

| Filename | Screen |
|---|---|
| `dashboard.png` | Dashboard — gauge, stat cards, live monitoring banner |
| `live-monitor.png` | Live Monitor — engine bar, gauge, live risk stream |
| `drill-escalation.png` | Live Monitor **during a drill** — red DRILL banner, risk elevated |
| `risk-analysis.png` | Risk Analysis — fused gauge plus the three component gauges |
| `mining-sites.png` | Mining Sites — the site cards grid |
| `analytics.png` | Analytics — totals and risk-by-site chart |
| `login.png` | Sign-in screen |

## Capturing more

**Windows:** `Win + Shift + S` → drag the region → paste into Paint → save as PNG.

**Full-page capture** (better for long pages like Site Graphs):
F12 → `Ctrl + Shift + P` → type "screenshot" → *Capture full size screenshot*.

## Tips

- Use **dark mode** (the default) — it's the designed look and reads well on
  GitHub, which most people browse in dark theme.
- Around **1400–1600px wide** is ideal. Wider captures get scaled down and the
  text becomes hard to read.
- For the drill shot, press **Tick now** until the gauge is red and Critical
  before capturing — that frame shows the banner, the crossed threshold and the
  escalated recommendations together.
- Keep each file under ~500 KB. Compress at https://tinypng.com if needed.

## Still worth adding

Two screens aren't captured yet:

- `site-graphs.png` — the Site Graphs page, best as a full-page capture so the
  risk chart, sensor channels and cross-site comparison are all visible
- `alerts.png` — the Alerts page with the red **DRILL** badges visible

Add them here and drop the matching `![...](docs/screenshots/<name>.png)` line
into the Screenshots section of the main README.

## Optional: a GIF

A short recording of a drill escalating Low → Critical is more convincing than a
still. Record with ScreenToGif (free, Windows), save as `drill.gif` here, and
reference it in place of the drill still. Keep it under ~10 MB.
