import { useNavigate } from 'react-router-dom'
import { getTokenClaims } from '../lib/auth'
import { Layout } from '../components/Layout'

export function GeographyPage() {
  const navigate = useNavigate()
  const claims = getTokenClaims()

  if (!claims) {
    navigate('/')
    return null
  }

  const stateMetrics = [
    { state: 'Maharashtra', orders: 1240, rtoRate: '3.2%', avgValue: '₹845' },
    { state: 'Karnataka', orders: 892, rtoRate: '4.1%', avgValue: '₹712' },
    { state: 'Tamil Nadu', orders: 756, rtoRate: '3.8%', avgValue: '₹698' },
    { state: 'Delhi', orders: 634, rtoRate: '2.9%', avgValue: '₹923' },
    { state: 'Uttar Pradesh', orders: 578, rtoRate: '5.2%', avgValue: '₹612' },
  ]

  return (
    <Layout onLogout={() => { localStorage.removeItem('stakeholder_token'); navigate('/'); }}>
      <div style={{ padding: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '700', marginBottom: '24px' }}>Geography Analysis</h1>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px', height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            Map visualization placeholder
          </div>

          <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', padding: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '16px' }}>Top States</h3>
            {stateMetrics.slice(0, 3).map((state, idx) => (
              <div key={idx} style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px' }}>{state.state}</div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>{state.orders} orders</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>State</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Orders</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>RTO Rate</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '14px', fontWeight: '600' }}>Avg Order Value</th>
              </tr>
            </thead>
            <tbody>
              {stateMetrics.map((state, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>{state.state}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>{state.orders}</td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: parseFloat(state.rtoRate) > 4 ? '#ef4444' : '#10b981' }}>
                    {state.rtoRate}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#111827' }}>{state.avgValue}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}
