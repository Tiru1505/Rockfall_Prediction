import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Sidebar from './Sidebar'

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user } = useAuth()

  if (!user) return <Navigate to="/login" replace />
  if (adminOnly && user.role !== 'admin') return <Navigate to="/" replace />

  return (
    <div className="flex min-h-screen bg-basalt">
      <Sidebar />
      {children}
    </div>
  )
}
