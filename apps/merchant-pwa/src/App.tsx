import { useState, useEffect } from "react"
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { isTokenValid } from "@/lib/auth.js"
import { createTRPCClient } from "@/lib/trpc-client.js"
import { trpc } from "@/lib/trpc.js"

import Dashboard from "@/pages/Dashboard.js"
import NDRQueue from "@/pages/NDRQueue.js"
import ReturnsQueue from "@/pages/ReturnsQueue.js"
import Login from "@/pages/Login.js"

const queryClient = new QueryClient()
const trpcClient = createTRPCClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    const valid = isTokenValid()
    setIsAuthenticated(valid)
  }, [])

  if (isAuthenticated === null) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Router>
      <QueryClientProvider client={queryClient}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ndr"
              element={
                <ProtectedRoute>
                  <NDRQueue />
                </ProtectedRoute>
              }
            />
            <Route
              path="/returns"
              element={
                <ProtectedRoute>
                  <ReturnsQueue />
                </ProtectedRoute>
              }
            />

            {/* Default redirect */}
            <Route path="/*" element={<Navigate to="/" replace />} />
          </Routes>
        </trpc.Provider>
      </QueryClientProvider>
    </Router>
  )
}
