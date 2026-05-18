import { useState, useEffect } from "react"
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { isTokenValid } from "@/lib/auth.js"
import { createTRPCClient } from "@/lib/trpc-client.js"
import { trpc } from "@/lib/trpc.js"

import Auth from "@/pages/Auth.js"
import TrackOrder from "@/pages/TrackOrder.js"
import ReturnFlow from "@/pages/ReturnFlow.js"
import ReorderPage from "@/pages/Reorder.js"

const queryClient = new QueryClient()
const trpcClient = createTRPCClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    // Check if user has valid JWT token
    const valid = isTokenValid()
    setIsAuthenticated(valid)
  }, [])

  if (isAuthenticated === null) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/auth" replace />
}

export default function App() {
  return (
    <Router>
      <QueryClientProvider client={queryClient}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <Routes>
            {/* Public routes */}
            <Route path="/auth" element={<Auth />} />

            {/* Protected routes */}
            <Route
              path="/track/:orderName"
              element={
                <ProtectedRoute>
                  <TrackOrder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/returns"
              element={
                <ProtectedRoute>
                  <ReturnFlow />
                </ProtectedRoute>
              }
            />
            <Route
              path="/reorder"
              element={
                <ProtectedRoute>
                  <ReorderPage />
                </ProtectedRoute>
              }
            />

            {/* Default redirect - preserve JWT in query params */}
            <Route path="/" element={<Auth />} />
          </Routes>
        </trpc.Provider>
      </QueryClientProvider>
    </Router>
  )
}
