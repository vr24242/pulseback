import { useNavigate } from "react-router-dom"
import { useNDRQueue, useReturnsQueue, useOrders } from "@/hooks/useMerchant.js"
import Sidebar from "@/components/Sidebar.js"

export default function Dashboard() {
  const navigate = useNavigate()
  const { data: ndrQueue, isLoading: ndrLoading } = useNDRQueue()
  const { data: returnsQueue, isLoading: returnsLoading } = useReturnsQueue()
  const { data: orders, isLoading: ordersLoading } = useOrders()

  const ndrCount = ndrQueue?.length || 0
  const returnsCount = returnsQueue?.length || 0
  const totalOrders = orders?.length || 0

  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        <div className="container">
          {/* Header */}
          <div className="mb-4">
            <h1 className="text-xl font-bold">Merchant Dashboard</h1>
            <p className="text-sm text-gray-600">Overview of your store's operations</p>
          </div>

          {/* Metrics Grid */}
          <div className="flex flex-wrap gap-4 mb-4">
            {/* NDR Alert */}
            <div
              className="card"
              style={{
                flex: "1 1 calc(33.333% - 11px)",
                minWidth: "200px",
                borderLeft: "4px solid #ef4444",
              }}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600 mb-2">Stuck Shipments (NDR)</p>
                  <p className="text-2xl font-bold">{ndrLoading ? "..." : ndrCount}</p>
                  <p className="text-xs text-gray-500 mt-2">Require attention</p>
                </div>
                <div
                  style={{
                    fontSize: "40px",
                    opacity: 0.2,
                  }}
                >
                  ⚠️
                </div>
              </div>
              <button
                className="btn btn-primary btn-sm mt-4"
                onClick={() => navigate("/ndr")}
                style={{ width: "100%" }}
              >
                View Queue
              </button>
            </div>

            {/* Returns Alert */}
            <div
              className="card"
              style={{
                flex: "1 1 calc(33.333% - 11px)",
                minWidth: "200px",
                borderLeft: "4px solid #f59e0b",
              }}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600 mb-2">Pending Returns</p>
                  <p className="text-2xl font-bold">{returnsLoading ? "..." : returnsCount}</p>
                  <p className="text-xs text-gray-500 mt-2">Awaiting approval</p>
                </div>
                <div
                  style={{
                    fontSize: "40px",
                    opacity: 0.2,
                  }}
                >
                  📦
                </div>
              </div>
              <button
                className="btn btn-primary btn-sm mt-4"
                onClick={() => navigate("/returns")}
                style={{ width: "100%" }}
              >
                Review Returns
              </button>
            </div>

            {/* Orders Processed */}
            <div
              className="card"
              style={{
                flex: "1 1 calc(33.333% - 11px)",
                minWidth: "200px",
                borderLeft: "4px solid #10b981",
              }}
            >
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-600 mb-2">Total Orders</p>
                  <p className="text-2xl font-bold">{ordersLoading ? "..." : totalOrders}</p>
                  <p className="text-xs text-gray-500 mt-2">Last 100 orders</p>
                </div>
                <div
                  style={{
                    fontSize: "40px",
                    opacity: 0.2,
                  }}
                >
                  ✓
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card mb-4">
            <h2 className="font-bold mb-4">Quick Actions</h2>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-primary"
                onClick={() => navigate("/ndr")}
              >
                Resolve NDR ({ndrCount})
              </button>
              <button
                className="btn btn-primary"
                onClick={() => navigate("/returns")}
              >
                Approve Returns ({returnsCount})
              </button>
              <button className="btn btn-secondary">View Analytics</button>
              <button className="btn btn-secondary">Settings</button>
            </div>
          </div>

          {/* Info */}
          <div className="card">
            <h2 className="font-bold mb-4">How It Works</h2>
            <div className="flex flex-col gap-4">
              <div>
                <p className="font-semibold text-sm mb-1">🚨 Stuck Shipments (NDR)</p>
                <p className="text-sm text-gray-600">
                  Orders stuck in transit for 3+ days. Approve reattempt, address update, or initiate RTO.
                </p>
              </div>
              <div>
                <p className="font-semibold text-sm mb-1">🔄 Pending Returns</p>
                <p className="text-sm text-gray-600">
                  Customer return requests awaiting your approval. Approve, reject, or request more info.
                </p>
              </div>
              <div>
                <p className="font-semibold text-sm mb-1">📊 Metrics</p>
                <p className="text-sm text-gray-600">
                  Real-time view of your store's health. Updates every 30-60 seconds.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
