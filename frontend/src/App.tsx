import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'
import AppLayout from './components/AppLayout'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import SurveysPage from './pages/SurveysPage'
import SurveyDetailPage from './pages/SurveyDetailPage'
import SurveyFormPage from './pages/SurveyFormPage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Redirect root to dashboard (ProtectedRoute will redirect to /login if needed) */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Public routes — redirect to /dashboard if already authenticated */}
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
          </Route>

          {/* Protected routes — wrapped in AppLayout which renders Outlet */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/surveys/new" element={<SurveyFormPage />} />
              <Route path="/surveys/:id/edit" element={<SurveyFormPage />} />
              <Route path="/surveys/:id" element={<SurveyDetailPage />} />
              <Route path="/surveys" element={<SurveysPage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
