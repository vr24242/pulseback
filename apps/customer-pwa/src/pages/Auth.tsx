import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { setToken, decodeToken, isTokenValid } from "@/lib/auth.js"

export default function Auth() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Extract JWT from URL query params
    let jwt = searchParams.get("jwt")

    // If no JWT in params, check localStorage for existing token
    if (!jwt) {
      const existingToken = localStorage.getItem("auth_token")
      if (existingToken && isTokenValid()) {
        // Already authenticated, redirect to tracking page
        const payload = decodeToken(existingToken)
        if (payload?.orderName) {
          navigate(`/track/${encodeURIComponent(payload.orderName)}`)
          return
        }
      }
      // No JWT found, show error
      setError("No authentication token provided. Please check your checkout link.")
      setIsLoading(false)
      return
    }

    try {
      // Decode to validate
      const payload = decodeToken(jwt)
      if (!payload) {
        setError("Invalid authentication token. Please try again.")
        setIsLoading(false)
        return
      }

      // Check if expired (if exp is present)
      if (payload.exp) {
        const now = Math.floor(Date.now() / 1000)
        if (payload.exp <= now) {
          setError("Authentication token has expired. Please complete checkout again.")
          setIsLoading(false)
          return
        }
      }

      // Store token in both keys for backward compatibility
      setToken(jwt)
      localStorage.setItem("tracking_token", jwt)

      // Redirect to track page with order name
      // If orderName is in payload, use it; otherwise redirect to home
      if (payload.orderName) {
        navigate(`/track/${encodeURIComponent(payload.orderName)}`, { replace: true })
      } else {
        navigate("/", { replace: true })
      }
    } catch (err) {
      setError("An error occurred during authentication. Please try again.")
      setIsLoading(false)
    }
  }, [searchParams, navigate])

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <div className="card" style={{ maxWidth: "400px" }}>
        {isLoading ? (
          <>
            <h1 className="text-lg font-bold text-center mb-4">Authenticating...</h1>
            <p className="text-center text-sm">
              We're setting up your account. This will only take a moment.
            </p>
            <div
              className="mt-4"
              style={{
                height: "4px",
                background: "#e5e7eb",
                borderRadius: "2px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  background: "#000000",
                  animation: "shimmer 2s infinite",
                }}
              />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold text-center mb-4">Authentication Error</h1>
            <p className="text-center text-sm text-red-600 mb-4">{error}</p>
            <button
              className="btn btn-primary"
              onClick={() => window.history.back()}
              style={{ width: "100%" }}
            >
              Go Back
            </button>
          </>
        )}
      </div>

      <style>{`
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
    </div>
  )
}
