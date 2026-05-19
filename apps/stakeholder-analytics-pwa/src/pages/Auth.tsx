import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { setToken, decodeToken, isTokenValid } from '../lib/auth'

export function AuthPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [token, setTokenInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Check if token in URL (share link)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const urlToken = params.get('token')
    if (urlToken) {
      const decoded = decodeToken(urlToken)
      if (decoded) {
        setToken(urlToken)
        navigate('/dashboard')
      } else {
        setError('Invalid or expired token')
      }
    } else if (isTokenValid()) {
      navigate('/dashboard')
    }
  }, [navigate, location])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const decoded = decodeToken(token)
      if (!decoded) {
        throw new Error('Invalid token format')
      }
      setToken(token)
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid token')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
      <div style={{ width: '100%', maxWidth: '400px', background: 'white', borderRadius: '8px', padding: '32px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', marginBottom: '8px', textAlign: 'center' }}>Pulseback Analytics</h1>
        <p style={{ color: '#6b7280', textAlign: 'center', marginBottom: '24px' }}>Share link access for stakeholders</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
              Analytics Token
            </label>
            <input
              type="text"
              value={token}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Paste your token here"
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                fontFamily: 'monospace',
              }}
            />
            <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '8px' }}>
              You can also visit a share link directly (includes token in URL)
            </p>
          </div>

          {error && (
            <div style={{ padding: '12px', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '6px', color: '#991b1b', fontSize: '14px', marginBottom: '16px' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !token}
            style={{
              width: '100%',
              padding: '12px',
              background: loading || !token ? '#d1d5db' : '#3b82f6',
              color: 'white',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: loading || !token ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Verifying...' : 'Continue'}
          </button>
        </form>

        <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: '1px solid #e5e7eb', fontSize: '12px', color: '#6b7280', textAlign: 'center' }}>
          <p>Share links expire after 30 days</p>
          <p>Questions? Contact your merchant</p>
        </div>
      </div>
    </div>
  )
}
