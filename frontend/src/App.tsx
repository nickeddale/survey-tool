import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'
import { useAuthStore } from './store/authStore'

function App() {
  const initialize = useAuthStore((state) => state.initialize)
  const isLoading = useAuthStore((state) => state.isLoading)

  useEffect(() => {
    initialize()
  }, [initialize])

  if (isLoading) {
    return null
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
