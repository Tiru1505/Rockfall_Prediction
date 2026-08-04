import axios from 'axios'

/**
 * In dev, requests go to `/api` and Vite proxies them to the local backend
 * (see vite.config.js), so no configuration is needed.
 *
 * In production the frontend and backend are on different hosts (Vercel and
 * Render), so there is no proxy. Set `VITE_API_BASE_URL` at build time to the
 * deployed backend, e.g. https://rockfall-api.onrender.com
 *
 * Every route on the backend is mounted under `/api`, so the suffix is not
 * optional — but omitting it is an easy mistake whose only symptom is a bare
 * 404 ("Not Found") on login, which looks like a broken backend rather than a
 * typo'd variable. Normalise it here so both forms work.
 */
function resolveApiBaseUrl() {
  const configured = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '')
  if (!configured) return '/api' // dev: let the Vite proxy handle it
  return configured.endsWith('/api') ? configured : `${configured}/api`
}

export const API_BASE_URL = resolveApiBaseUrl()

const api = axios.create({ baseURL: API_BASE_URL })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rockfall_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// A token that is expired, or belongs to a user that no longer exists, makes
// every authenticated call 401. Without this the polling pages just swallow the
// error and sit blank forever, which reads as "the app is broken" rather than
// "you are signed out". Clear the session and bounce to login instead.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const onLoginScreen = ['/login', '/register'].includes(window.location.pathname)
    if (error?.response?.status === 401 && !onLoginScreen) {
      localStorage.removeItem('rockfall_token')
      localStorage.removeItem('rockfall_user')
      window.location.replace('/login')
    }
    return Promise.reject(error)
  },
)

export default api
