import { Link, useLocation } from 'react-router-dom'
import { ReactNode } from 'react'

interface LayoutProps {
  children: ReactNode
  onLogout: () => void
}

export function Layout({ children, onLogout }: LayoutProps) {
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f9fafb' }}>
      {/* Sidebar */}
      <div style={{ width: '200px', background: 'white', borderRight: '1px solid #e5e7eb', paddingTop: '20px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
        <h2 style={{ padding: '0 16px', fontSize: '14px', fontWeight: '700', marginBottom: '24px', color: '#111827' }}>Pulseback</h2>

        <nav style={{ paddingBottom: '24px' }}>
          {[
            { path: '/dashboard', label: 'Dashboard', icon: '📊' },
            { path: '/metrics', label: 'Metrics', icon: '📈' },
            { path: '/cohort', label: 'Cohort', icon: '👥' },
            { path: '/geography', label: 'Geography', icon: '🗺️' },
          ].map((item) => (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'block',
                padding: '12px 16px',
                fontSize: '14px',
                color: isActive(item.path) ? '#3b82f6' : '#6b7280',
                background: isActive(item.path) ? '#eff6ff' : 'transparent',
                borderLeft: isActive(item.path) ? '3px solid #3b82f6' : 'none',
                paddingLeft: isActive(item.path) ? '13px' : '16px',
                textDecoration: 'none',
                marginBottom: '4px',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ marginRight: '8px' }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div style={{ paddingTop: '24px', borderTop: '1px solid #e5e7eb', padding: '24px 16px' }}>
          <button
            onClick={onLogout}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
            }}
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '16px 32px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            Analytics • Stakeholder Access
          </div>
        </header>
        <main style={{ flex: 1, overflow: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
