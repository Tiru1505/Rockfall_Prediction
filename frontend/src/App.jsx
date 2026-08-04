import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { SiteProvider } from './context/SiteContext'
import ProtectedRoute from './components/ProtectedRoute'

import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import LiveMonitorPage from './pages/LiveMonitorPage'
import SitesPage from './pages/SitesPage'
import SiteGraphsPage from './pages/SiteGraphsPage'
import ImagePrediction from './pages/ImagePrediction'
import WeatherPage from './pages/WeatherPage'
import SensorsPage from './pages/SensorsPage'
import RiskPage from './pages/RiskPage'
import AlertsPage from './pages/AlertsPage'
import HistoryPage from './pages/HistoryPage'
import AnalyticsPage from './pages/AnalyticsPage'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SiteProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/live" element={<ProtectedRoute><LiveMonitorPage /></ProtectedRoute>} />
              <Route path="/sites" element={<ProtectedRoute><SitesPage /></ProtectedRoute>} />
              <Route path="/site-graphs" element={<ProtectedRoute><SiteGraphsPage /></ProtectedRoute>} />
              <Route path="/image-prediction" element={<ProtectedRoute><ImagePrediction /></ProtectedRoute>} />
              <Route path="/weather" element={<ProtectedRoute><WeatherPage /></ProtectedRoute>} />
              <Route path="/sensors" element={<ProtectedRoute><SensorsPage /></ProtectedRoute>} />
              <Route path="/risk" element={<ProtectedRoute><RiskPage /></ProtectedRoute>} />
              <Route path="/alerts" element={<ProtectedRoute><AlertsPage /></ProtectedRoute>} />
              <Route path="/history" element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
              <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
            </Routes>
          </BrowserRouter>
        </SiteProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
