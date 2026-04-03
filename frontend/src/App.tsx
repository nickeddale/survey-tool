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
import SurveyBuilderPage from './pages/SurveyBuilderPage'
import SurveyPreviewPage from './pages/SurveyPreviewPage'
import SurveyResponsePage from './pages/SurveyResponsePage'
import ResponsesPage from './pages/ResponsesPage'
import ResponseDetailPage from './pages/ResponseDetailPage'
import QuotasPage from './pages/QuotasPage'
import AssessmentsPage from './pages/AssessmentsPage'
import NotFoundPage from './pages/NotFoundPage'

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          {/* Public survey response form — no auth required */}
          <Route path="/s/:survey_id" element={<SurveyResponsePage />} />

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
              <Route path="/surveys/:id/responses/:rid" element={<ResponseDetailPage />} />
              <Route path="/surveys/:id/responses" element={<ResponsesPage />} />
              <Route path="/surveys/:id/quotas" element={<QuotasPage />} />
              <Route path="/surveys/:id/assessments" element={<AssessmentsPage />} />
              <Route path="/surveys/:id" element={<SurveyDetailPage />} />
              <Route path="/surveys" element={<SurveysPage />} />
            </Route>
            {/* Full-screen pages outside AppLayout */}
            <Route path="/surveys/:id/builder" element={<SurveyBuilderPage />} />
            <Route path="/surveys/:id/preview" element={<SurveyPreviewPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
