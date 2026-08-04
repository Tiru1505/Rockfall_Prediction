import { useEffect, useState } from 'react'
import { Trash2, ShieldCheck, Users, Database, BellRing } from 'lucide-react'
import api from '../api/client'
import StatCard from '../components/StatCard'
import Topbar from '../components/Topbar'

export default function AdminPage() {
  const [users, setUsers] = useState(null)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  async function load() {
    try {
      const [usersRes, statsRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/stats'),
      ])
      setUsers(usersRes.data)
      setStats(statsRes.data)
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to load admin data')
    }
  }

  useEffect(() => { load() }, [])

  async function deleteUser(id) {
    if (!confirm('Delete this user?')) return
    await api.delete(`/admin/users/${id}`)
    load()
  }

  return (
    <div className="flex-1">
      <Topbar title="Admin Panel" subtitle="Manage users, review system stats and logs" />

      <div className="p-8 space-y-6">
        {error && <div className="text-sm text-critical bg-critical/10 border border-critical/30 rounded-md px-3 py-2">{error}</div>}

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Total Users" value={stats.total_users} icon={Users} />
            <StatCard label="Total Predictions" value={stats.total_predictions} icon={Database} />
            <StatCard label="Total Alerts" value={stats.total_alerts} icon={BellRing} accent="var(--color-hazard)" />
          </div>
        )}

        <div className="bg-panel border border-line rounded-lg p-6">
          <h2 className="font-display text-sm font-semibold text-stone mb-4 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck size={15} /> Users
          </h2>
          {!users ? (
            <p className="text-sm text-slate-muted">Loading…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-muted border-b border-line">
                  <th className="pb-2">Name</th>
                  <th className="pb-2">Email</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-line last:border-0">
                    <td className="py-2 text-stone">{u.name}</td>
                    <td className="py-2 font-mono text-xs text-slate-muted">{u.email}</td>
                    <td className="py-2">
                      <span className="text-xs px-2 py-0.5 rounded border border-line text-slate-muted uppercase tracking-wide">{u.role}</span>
                    </td>
                    <td className="py-2 text-right">
                      <button onClick={() => deleteUser(u.id)} className="text-slate-muted hover:text-critical transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
