import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mountain, AlertTriangle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('operator')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(name, email, password, role)
      navigate('/')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Registration failed.')
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
          <h1 className="font-display text-xl font-semibold text-stone mb-1">Create account</h1>
          <p className="text-sm text-slate-muted mb-6">Set up access to the monitoring dashboard.</p>

          {error && (
            <div className="flex items-center gap-2 text-sm bg-critical/10 border border-critical/30 text-critical rounded-md px-3 py-2 mb-4">
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-muted">Full name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full bg-panel-raised border border-line rounded-md px-3 py-2 text-sm text-stone focus:outline-none focus:ring-2 focus:ring-signal"
                placeholder="Jordan Lee"
              />
            </div>
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
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full bg-panel-raised border border-line rounded-md px-3 py-2 text-sm text-stone focus:outline-none focus:ring-2 focus:ring-signal"
                placeholder="At least 6 characters"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-slate-muted">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 w-full bg-panel-raised border border-line rounded-md px-3 py-2 text-sm text-stone focus:outline-none focus:ring-2 focus:ring-signal"
              >
                <option value="operator">Operator</option>
                <option value="admin">Admin</option>
                <option value="guest">Guest</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-hazard text-basalt font-medium rounded-md py-2.5 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-sm text-slate-muted text-center mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-signal hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
