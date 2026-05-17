import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { setToken } from "@/lib/auth.js"

export default function Login() {
  const navigate = useNavigate()
  const [jwt, setJwt] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setIsLoading(true)

    try {
      if (!jwt.trim()) {
        setError("Please enter a token")
        setIsLoading(false)
        return
      }

      // Basic JWT format validation (3 parts separated by dots)
      const parts = jwt.trim().split(".")
      if (parts.length !== 3) {
        setError("Invalid token format. JWT should have 3 parts separated by dots.")
        setIsLoading(false)
        return
      }

      // Decode and validate JWT
      try {
        const decoded = JSON.parse(atob(parts[1]))
        if (!decoded.shopId) {
          setError("Invalid token: missing shopId claim")
          setIsLoading(false)
          return
        }
        if (decoded.exp && decoded.exp < Date.now() / 1000) {
          setError("Token has expired")
          setIsLoading(false)
          return
        }
      } catch (e) {
        setError("Failed to parse token")
        setIsLoading(false)
        return
      }

      // Store token and redirect
      setToken(jwt.trim())
      navigate("/")
    } catch (err: any) {
      setError(err.message || "Authentication failed")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-full max-w-md p-8">
        <div className="card">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-2">Merchant Dashboard</h1>
            <p className="text-sm text-gray-600">Enter your authentication token to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label htmlFor="jwt" className="block text-sm font-semibold mb-2">
                Authentication Token
              </label>
              <textarea
                id="jwt"
                value={jwt}
                onChange={(e) => setJwt(e.target.value)}
                placeholder="Paste your JWT token here..."
                className="w-full p-3 border border-gray-300 rounded text-sm font-mono"
                rows={6}
                disabled={isLoading}
              />
              <p className="text-xs text-gray-500 mt-2">
                You should have received this token via email or from your account settings.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full"
            >
              {isLoading ? "Verifying..." : "Sign In"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="font-semibold text-sm mb-3">Need Help?</h3>
            <ul className="text-xs text-gray-600 space-y-2">
              <li>• Check your email for the authentication token</li>
              <li>• Paste the full token (including all dots)</li>
              <li>• Make sure there are no extra spaces</li>
              <li>• Contact support if your token has expired</li>
            </ul>
          </div>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          This is a secure merchant-only dashboard. Do not share your token.
        </p>
      </div>
    </div>
  )
}
