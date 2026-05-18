'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function EarlyAccessPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const referralCode = searchParams.get('ref')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [userData, setUserData] = useState({ email: '', referralCode: '', rank: 0 })

  const [formData, setFormData] = useState({
    email: '',
    companyName: '',
    productCategory: '',
    shopifyStore: '',
    expectedOrders: '',
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/early-access/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          expectedOrders: parseInt(formData.expectedOrders),
          referralCode: referralCode || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to sign up')
      }

      const data = await response.json()
      setUserData({
        email: formData.email,
        referralCode: data.referralCode,
        rank: data.rank,
      })
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', padding: '40px 20px' }}>
        <div style={{ maxWidth: 600, width: '100%', margin: '0 auto' }}>
          <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: 40 }}>
            <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 20 }}>🎉 You're In!</h1>
            <p style={{ fontSize: 18, color: '#999', marginBottom: 32 }}>
              You're #{userData.rank} in the waitlist. Check your email for your referral link.
            </p>

            <div style={{ background: '#1a1a1a', border: '1px solid #222', borderRadius: 12, padding: 20, marginBottom: 32 }}>
              <p style={{ fontSize: 12, color: '#666', textTransform: 'uppercase', marginBottom: 8 }}>Your Referral Link</p>
              <code style={{ fontSize: 14, color: '#fff', wordBreak: 'break-all' }}>
                https://pulseos.com/early-access?ref={userData.referralCode}
              </code>
            </div>

            <p style={{ color: '#666', marginBottom: 32 }}>
              Share this link with friends. You'll move up 10 spots per referral!
            </p>

            <a
              href="/dashboard/waitlist"
              style={{
                display: 'inline-block',
                background: '#fff',
                color: '#000',
                padding: '12px 24px',
                borderRadius: 8,
                textDecoration: 'none',
                fontWeight: 600,
              }}
            >
              View Your Waitlist Position →
            </a>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', padding: '40px 20px', background: '#000' }}>
      <div style={{ maxWidth: 600, width: '100%', margin: '0 auto' }}>
        {/* Back to home */}
        <a href="/" style={{ color: '#666', textDecoration: 'none', marginBottom: 32, display: 'inline-block' }}>
          ← Back
        </a>

        <div style={{ background: '#111', border: '1px solid #222', borderRadius: 16, padding: 40 }}>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 12 }}>Join 500+ Early Adopters</h1>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 32 }}>
            Get exclusive beta access to D2C OS. Be the first to automate your entire business.
          </p>

          {error && (
            <div style={{ background: '#3a2a2a', border: '1px solid #663333', borderRadius: 8, padding: 12, marginBottom: 20, color: '#ff6b6b' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#999' }}>
                Email *
              </label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleChange}
                placeholder="you@company.com"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #222',
                  borderRadius: 8,
                  background: '#0a0a0a',
                  color: '#fff',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#999' }}>
                Company Name *
              </label>
              <input
                type="text"
                name="companyName"
                required
                value={formData.companyName}
                onChange={handleChange}
                placeholder="Your D2C Brand"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #222',
                  borderRadius: 8,
                  background: '#0a0a0a',
                  color: '#fff',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#999' }}>
                Product Category *
              </label>
              <select
                name="productCategory"
                required
                value={formData.productCategory}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #222',
                  borderRadius: 8,
                  background: '#0a0a0a',
                  color: '#fff',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Select category...</option>
                <option value="fashion">Fashion & Apparel</option>
                <option value="food">Food & Beverage</option>
                <option value="beauty">Beauty & Personal Care</option>
                <option value="electronics">Electronics & Gadgets</option>
                <option value="home">Home & Living</option>
                <option value="sports">Sports & Fitness</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#999' }}>
                Shopify Store URL *
              </label>
              <input
                type="url"
                name="shopifyStore"
                required
                value={formData.shopifyStore}
                onChange={handleChange}
                placeholder="https://yourstore.myshopify.com"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #222',
                  borderRadius: 8,
                  background: '#0a0a0a',
                  color: '#fff',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#999' }}>
                Expected Monthly Orders *
              </label>
              <select
                name="expectedOrders"
                required
                value={formData.expectedOrders}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #222',
                  borderRadius: 8,
                  background: '#0a0a0a',
                  color: '#fff',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Select range...</option>
                <option value="10">1-10</option>
                <option value="50">11-50</option>
                <option value="100">51-100</option>
                <option value="500">101-500</option>
                <option value="1000">500+</option>
              </select>
            </div>

            {referralCode && (
              <div style={{ background: '#1a2a1a', border: '1px solid #333366', borderRadius: 8, padding: 12 }}>
                <p style={{ fontSize: 12, color: '#6b9' }}>✓ Referred by a friend — you'll get priority onboarding!</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px',
                background: loading ? '#666' : '#fff',
                color: '#000',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 14,
              }}
            >
              {loading ? 'Joining...' : 'Join Early Access'}
            </button>
          </form>

          <p style={{ fontSize: 12, color: '#666', marginTop: 20, textAlign: 'center' }}>
            We'll never spam you. Just beta updates & early access.
          </p>
        </div>
      </div>
    </main>
  )
}
