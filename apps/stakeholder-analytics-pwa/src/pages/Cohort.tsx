import { useNavigate } from 'react-router-dom'
import { getTokenClaims } from '../lib/auth'
import { Layout } from '../components/Layout'

export function CohortPage() {
  const navigate = useNavigate()
  const claims = getTokenClaims()

  if (!claims) {
    navigate('/')
    return null
  }

  const cohorts = [
    { month: 'January 2026', customers: 124, retention30: '42%', retention90: '18%' },
    { month: 'February 2026', customers: 156, retention30: '48%', retention90: '22%' },
    { month: 'March 2026', customers: 142, retention30: '45%', retention90: '20%' },
    { month: 'April 2026', customers: 187, retention30: '51%', retention90: null },
    { month: 'May 2026', customers: 203, retention30: null, retention90: null },
  ]

  return (
    <Layout onLogout={() => { localStorage.removeItem('stakeholder_token'); navigate('/'); }}>
      <div style={{ padding: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '24px' }}>Cohort Retention</h1>

        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Cohort</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>New Customers</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Day 30 Retention</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Day 90 Retention</th>
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>{cohort.month}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>{cohort.customers}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: cohort.retention30 ? '#10b981' : '#9ca3af' }}>
                    {cohort.retention30 || '—'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: cohort.retention90 ? '#10b981' : '#9ca3af' }}>
                    {cohort.retention90 || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: '24px', padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px' }}>
          <p style={{ fontSize: '14px', color: '#166534' }}>
            💡 <strong>Insight:</strong> April cohort shows 51% retention at day 30, the highest in our data. Consider what changed in your acquisition or product in April.
          </p>
        </div>
      </div>
    </Layout>
  )
}
