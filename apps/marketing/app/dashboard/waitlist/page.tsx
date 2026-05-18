'use client'

import { useState, useEffect } from 'react'

interface WaitlistStatus {
  rank: number
  referralCode: string
  referralCount: number
  referralLink: string
  status: string
  createdAt: string
}

export default function WaitlistDashboard() {
  const [email, setEmail] = useState('')
  const [searching, setSearching] = useState(false)
  const [status, setStatus] = useState<WaitlistStatus | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setSearching(true)
    setError('')

    try {
      const response = await fetch(`/api/early-access/get-status?email=${encodeURIComponent(email)}`)

      if (!response.ok) {
        throw new Error('Email not found in waitlist')
      }

      const data = await response.json()
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStatus(null)
    } finally {
      setSearching(false)
    }
  }

  const copyToClipboard = () => {
    if (status?.referralLink) {
      navigator.clipboard.writeText(status.referralLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <main style={{ minHeight: '100vh', padding: '40px 20px', background: '#000' }}>
      {/* Navigation */}
      <div style={{ maxWidth: 900, margin: '0 auto', marginBottom: 40 }}>
        <a href="/" style={{ color: '#666', textDecoration: 'none', fontSize: 14 }}>
          ← Back to Home
        </a>
      </div>

      <div style={{ maxWidth: 900, width: '100%', margin: '0 auto' }}>
        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: 40 }}>
          <h1 style={{ fontSize: 40, fontWeight: 800, marginBottom: 12 }}>Your Waitlist Position</h1>
          <p style={{ fontSize: 16, color: '#666', marginBottom: 32 }}>
            Enter your email to check your rank and share your referral link.
          </p>

          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, marginBottom: 40 }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              style={{
                flex: 1,
                padding: '12px 16px',
                border: '1px solid #222',
                borderRadius: 8,
                background: '#0a0a0a',
                color: '#fff',
                fontSize: 14,
              }}
            />
            <button
              type="submit"
              disabled={searching}
              style={{
                padding: '12px 24px',
                background: '#fff',
                color: '#000',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                cursor: searching ? 'not-allowed' : 'pointer',
              }}
            >
              {searching ? 'Searching...' : 'Check Status'}
            </button>
          </form>

          {error && (
            <div style={{ background: '#3a2a2a', border: '1px solid #663333', borderRadius: 8, padding: 16, marginBottom: 20, color: '#ff6b6b' }}>
              {error}
            </div>
          )}

          {status && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              {/* Rank Card */}
              <div style={{ background: '#1a1a1a', border: '1px solid #222', borderRadius: 12, padding: 24 }}>
                <p style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', marginBottom: 8 }}>Your Rank</p>
                <h2 style={{ fontSize: 56, fontWeight: 800, margin: 0, color: '#fff' }}>
                  #{status.rank}
                </h2>
                <p style={{ color: '#666', fontSize: 14, marginTop: 8 }}>
                  in the waitlist
                </p>
              </div>

              {/* Referrals Card */}
              <div style={{ background: '#1a1a1a', border: '1px solid #222', borderRadius: 12, padding: 24 }}>
                <p style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', marginBottom: 8 }}>Referrals</p>
                <h2 style={{ fontSize: 56, fontWeight: 800, margin: 0, color: '#90EE90' }}>
                  {status.referralCount}
                </h2>
                <p style={{ color: '#666', fontSize: 14, marginTop: 8 }}>
                  +{status.referralCount * 10} position boost
                </p>
              </div>
            </div>
          )}

          {status && (
            <div style={{ marginTop: 40, padding: 24, background: '#1a1a1a', border: '1px solid #222', borderRadius: 12 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>Your Referral Link</h3>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <code
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    background: '#0a0a0a',
                    border: '1px solid #222',
                    borderRadius: 8,
                    color: '#90EE90',
                    fontSize: 13,
                    wordBreak: 'break-all',
                  }}
                >
                  {status.referralLink}
                </code>
                <button
                  onClick={copyToClipboard}
                  style={{
                    padding: '12px 24px',
                    background: '#90EE90',
                    color: '#000',
                    border: 'none',
                    borderRadius: 8,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
                Share this link with friends. You'll move up 10 positions per referral!
              </p>
            </div>
          )}

          {status && (
            <div style={{ marginTop: 40, padding: 24, background: '#1a1a2a', border: '1px solid #223344', borderRadius: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>How It Works</h3>
              <ul style={{ color: '#666', lineHeight: 1.8, fontSize: 14, margin: 0, paddingLeft: 20 }}>
                <li>Every referral moves you up 10 spots in the waitlist</li>
                <li>When you reach the top, we'll give you exclusive beta access</li>
                <li>You'll get early pricing and direct access to our team</li>
                <li>We'll also give your referrals priority onboarding</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
