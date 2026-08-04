import { useState, useCallback, useRef } from 'react'
import { UploadCloud, Image as ImageIcon, Loader2 } from 'lucide-react'
import api from '../api/client'
import Topbar from '../components/Topbar'

const LEVEL_COLOR = {
  'Stable': 'var(--color-safe)',
  'Moderate Risk': 'var(--color-hazard)',
  'High Risk': '#d47a3a',
  'Dangerous': 'var(--color-critical)',
}

export default function ImagePrediction() {
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  async function runPrediction(file) {
    setLoading(true)
    setResult(null)
    setPreview(URL.createObjectURL(file))
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await api.post('/predict/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(data)
    } catch (err) {
      setResult({ error: err?.response?.data?.detail || 'Prediction failed' })
    } finally {
      setLoading(false)
    }
  }

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) runPrediction(file)
  }, [])

  return (
    <div className="flex-1">
      <Topbar title="Image Prediction" subtitle="Upload a slope image for a rockfall-risk prediction" />

      <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`bg-panel border-2 border-dashed rounded-lg p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-colors min-h-[320px] ${
            dragging ? 'border-signal bg-panel-raised' : 'border-line'
          }`}
        >
          {preview ? (
            <img src={preview} alt="preview" className="max-h-64 rounded-md object-cover mb-4" />
          ) : (
            <UploadCloud size={36} className="text-slate-muted mb-3" />
          )}
          <p className="text-sm text-stone font-medium">Drag & drop a slope image here</p>
          <p className="text-xs text-slate-muted mt-1">or click to browse · JPG, PNG</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && runPrediction(e.target.files[0])}
          />
        </div>

        <div className="bg-panel border border-line rounded-lg p-6">
          <h2 className="font-display text-sm font-semibold text-stone mb-4 uppercase tracking-wider flex items-center gap-2">
            <ImageIcon size={15} /> Prediction Result
          </h2>

          {loading && (
            <div className="flex items-center gap-2 text-slate-muted text-sm">
              <Loader2 size={16} className="animate-spin" /> Analyzing image…
            </div>
          )}

          {!loading && !result && (
            <p className="text-sm text-slate-muted">Upload an image to see the predicted risk class, confidence score, and explainability notes.</p>
          )}

          {result?.error && <p className="text-sm text-critical">{result.error}</p>}

          {!loading && result && !result.error && (
            <div className="space-y-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-slate-muted">Predicted Class</span>
                <div
                  className="font-display text-2xl font-semibold mt-1"
                  style={{ color: LEVEL_COLOR[result.predicted_class] || 'var(--color-stone)' }}
                >
                  {result.predicted_class}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs uppercase tracking-wider text-slate-muted">Image Risk</span>
                  <div className="font-mono text-lg text-stone">{result.image_risk}%</div>
                </div>
                <div>
                  <span className="text-xs uppercase tracking-wider text-slate-muted">Confidence</span>
                  <div className="font-mono text-lg text-stone">{(result.confidence * 100).toFixed(0)}%</div>
                </div>
              </div>

              <div className="w-full bg-panel-raised rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${result.image_risk}%`, backgroundColor: LEVEL_COLOR[result.predicted_class] }}
                />
              </div>

              <div className="border-t border-line pt-4">
                <span className="text-xs uppercase tracking-wider text-slate-muted">Grad-CAM / Explainability</span>
                <p className="text-sm text-slate-muted mt-1 leading-relaxed">{result.gradcam_note}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
