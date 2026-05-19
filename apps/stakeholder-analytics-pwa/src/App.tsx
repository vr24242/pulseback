import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthPage } from './pages/Auth'
import { Dashboard } from './pages/Dashboard'
import { MetricsPage } from './pages/Metrics'
import { CohortPage } from './pages/Cohort'
import { GeographyPage } from './pages/Geography'
import { isTokenValid } from './lib/auth'

const queryClient = new QueryClient()

function PrivateRoute({ children }: { children: React.ReactNode }) {
  return isTokenValid() ? <>{children}</> : <Navigate to="/" replace />
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AuthPage />} />
          <Route
            path="/dashboard"
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/metrics"
            element={
              <PrivateRoute>
                <MetricsPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/cohort"
            element={
              <PrivateRoute>
                <CohortPage />
              </PrivateRoute>
            }
          />
          <Route
            path="/geography"
            element={
              <PrivateRoute>
                <GeographyPage />
              </PrivateRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
