import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import api from '../api/client'
import { useAuth } from './AuthContext'

const SiteContext = createContext(null)

const STORAGE_KEY = 'rockfall_site_id'

export function SiteProvider({ children }) {
  const { user } = useAuth()
  const [sites, setSites] = useState([])
  const [siteId, setSiteId] = useState(() => localStorage.getItem(STORAGE_KEY) || null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/sites')
      setSites(data)
      setError(null)
      // Fall back to the first site if nothing is selected, or if the stored
      // selection points at a site that has since been deleted/archived.
      setSiteId((current) => {
        if (current && data.some((s) => s.site_id === current)) return current
        return data[0]?.site_id ?? null
      })
      return data
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not load mining sites')
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setLoading(false)
      return
    }
    refresh()
  }, [user, refresh])

  useEffect(() => {
    if (siteId) localStorage.setItem(STORAGE_KEY, siteId)
  }, [siteId])

  const selectSite = useCallback((id) => setSiteId(id), [])

  const createSite = useCallback(async (payload) => {
    const { data } = await api.post('/sites', payload)
    await refresh()
    setSiteId(data.site_id)
    return data
  }, [refresh])

  const updateSite = useCallback(async (id, payload) => {
    const { data } = await api.patch(`/sites/${id}`, payload)
    await refresh()
    return data
  }, [refresh])

  const deleteSite = useCallback(async (id, purge = false) => {
    await api.delete(`/sites/${id}`, { params: { purge } })
    const remaining = await refresh()
    if (id === siteId) setSiteId(remaining[0]?.site_id ?? null)
  }, [refresh, siteId])

  const site = useMemo(
    () => sites.find((s) => s.site_id === siteId) ?? null,
    [sites, siteId],
  )

  const value = useMemo(() => ({
    sites, site, siteId, loading, error,
    refresh, selectSite, createSite, updateSite, deleteSite,
  }), [sites, site, siteId, loading, error, refresh, selectSite, createSite, updateSite, deleteSite])

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>
}

export function useSite() {
  return useContext(SiteContext)
}
