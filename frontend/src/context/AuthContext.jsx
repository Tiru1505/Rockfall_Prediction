import { createContext, useContext, useState, useCallback } from 'react'
import api from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('rockfall_user')
    return saved ? JSON.parse(saved) : null
  })

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    localStorage.setItem('rockfall_token', data.access_token)
    localStorage.setItem('rockfall_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }, [])

  const register = useCallback(async (name, email, password, role) => {
    const { data } = await api.post('/auth/register', { name, email, password, role })
    localStorage.setItem('rockfall_token', data.access_token)
    localStorage.setItem('rockfall_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('rockfall_token')
    localStorage.removeItem('rockfall_user')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
