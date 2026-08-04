import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mountain, AlertTriangle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-basalt contour-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <Mountain size={26} className="text-hazard" />
          <span className="font-display text-lg font-semibold text-stone">
            STRATA<span className="text-hazard">WATCH</span>
          </span>
        </div>

        <div className="bg-panel border border-line rounded-lg p-7">
          <h1 className="font-display text-xl font-semibold text-stone mb-1">Sign in</h1>
          <p className="text-sm text-slate-muted mb-6">Monitor slope risk across your sites.</p>

          {error && (
            <div className="flex items-center gap-2 text-sm bg-critical/10 border border-critical/30 text-critical rounded-md px-3 py-2 mb-4">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-muted">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full bg-panel-raised border border-line rounded-md px-3 py-2 text-sm text-stone focus:outline-none focus:ring-2 focus:ring-signal"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-muted">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full bg-panel-raised border border-line rounded-md px-3 py-2 text-sm text-stone focus:outline-none focus:ring-2 focus:ring-signal"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-hazard text-basalt font-medium rounded-md py-2.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-sm text-slate-muted text-center mt-6">
            No account?{' '}
            <Link to="/register" className="text-signal hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
