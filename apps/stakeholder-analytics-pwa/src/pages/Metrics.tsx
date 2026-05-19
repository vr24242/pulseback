import { useNavigate } from 'react-router-dom'
import { getTokenClaims } from '../lib/auth'
import { Layout } from '../components/Layout'

export function MetricsPage() {
  const navigate = useNavigate()
  const claims = getTokenClaims()

  if (!claims) {
    navigate('/')
    return null
  }

  return (
    <Layout onLogout={() => { localStorage.removeItem('stakeholder_token'); navigate('/'); }}>
      <div style={{ padding: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '24px' }}>Metrics Deep Dive</h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          {[
            { title: 'Cohort Analysis', desc: 'Customer retention by acquisition month' },
            { title: 'Churn Funnel', desc: 'Segments losing customers' },
            { title: 'Carrier Performance', desc: 'RTO % by carrier by region' },
            { title: 'Payment Breakdown', desc: 'COD vs prepaid conversion' },
            { title: 'Product Performance', desc: 'Units, returns, revenue' },
            { title: 'Geography Analysis', desc: 'Orders and RTO by region' },
          ].map((item, idx) => (
            <div key={idx} style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px', cursor: 'pointer' }} onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)')} onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>{item.title}</h3>
              <p style={{ color: '#6b7280', fontSize: '14px' }}>{item.desc}</p>
              <div style={{ marginTop: '16px', height: '150px', background: '#f3f4f6', borderRadius: '6px' }}></div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  )
}
