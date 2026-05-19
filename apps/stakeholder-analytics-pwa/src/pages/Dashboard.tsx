import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTokenClaims, clearToken } from '../lib/auth'
import { Layout } from '../components/Layout'

interface KPI {
  label: string
  value: string | number
  trend?: string
  icon: string
}

export function Dashboard() {
  const navigate = useNavigate()
  const claims = getTokenClaims()
  const [kpis, setKpis] = useState<KPI[]>([])

  useEffect(() => {
    if (!claims) {
      navigate('/')
      return
    }

    // Mock data - will be replaced with tRPC queries
    setKpis([
      { label: 'GMV (30d)', value: '₹2,45,000', trend: '+12% vs last month', icon: '📊' },
      { label: 'Orders', value: '342', trend: '+8% vs last month', icon: '📦' },
      { label: 'RTO Rate', value: '4.2%', trend: '-0.3% vs last month', icon: '⚠️' },
      { label: 'Return Rate', value: '2.8%', trend: '+0.1% vs last month', icon: '↩️' },
      { label: 'Avg Order Value', value: '₹716', trend: '+2% vs last month', icon: '💰' },
      { label: 'Customer Retention', value: '42%', trend: '+3% vs last month', icon: '👥' },
    ])
  }, [claims, navigate])

  const handleLogout = () => {
    clearToken()
    navigate('/')
  }

  return (
    <Layout onLogout={handleLogout}>
      <div style={{ padding: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>Analytics Dashboard</h1>
        <p style={{ color: '#6b7280', marginBottom: '32px' }}>
          Business metrics for {claims?.shopId || 'your store'}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {kpis.map((kpi, idx) => (
            <div key={idx} style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <label style={{ fontSize: '14px', color: '#6b7280', fontWeight: '500' }}>{kpi.label}</label>
                <span style={{ fontSize: '20px' }}>{kpi.icon}</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '700', marginBottom: '8px' }}>{kpi.value}</div>
              {kpi.trend && <p style={{ fontSize: '13px', color: '#10b981' }}>{kpi.trend}</p>}
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Revenue Trend</h3>
            <div style={{ height: '200px', background: '#f3f4f6', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
              Chart placeholder
            </div>
          </div>

          <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>RTO Rate Trend</h3>
            <div style={{ height: '200px', background: '#f3f4f6', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
              Chart placeholder
            </div>
          </div>
        </div>

        <div style={{ marginTop: '32px', padding: '20px', background: '#fef3c7', borderRadius: '8px', border: '1px solid #fcd34d' }}>
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>📊 AI Insights</h3>
          <p style={{ color: '#92400e', fontSize: '14px', lineHeight: '1.6' }}>
            Your store's RTO rate decreased 0.3% this month, primarily in urban pincodes. The highest return rate is from 1-2 week repeat customers. Consider targeting day 3-5 with a special offer to improve retention.
          </p>
        </div>
      </div>
    </Layout>
  )
}
