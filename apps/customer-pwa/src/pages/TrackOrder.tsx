import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useOrder, useCheckReturn } from "@/hooks/useCustomer.js"
import { decodeToken } from "@/lib/auth.js"

export default function TrackOrder() {
  const navigate = useNavigate()
  const { orderName: paramOrderName } = useParams<{ orderName: string }>()
  const [orderName, setOrderName] = useState("")
  const [phone, setPhone] = useState("")
  const [submitted, setSubmitted] = useState(false)

  // When component mounts, check if we have JWT with order info
  useEffect(() => {
    const token = localStorage.getItem("tracking_token")
    if (token && paramOrderName) {
      try {
        const payload = decodeToken(token)
        if (payload?.orderName && payload?.phone) {
          setOrderName(payload.orderName)
          setPhone(payload.phone)
          setSubmitted(true)
        }
      } catch {
        // Ignore decode errors, user will enter manually
      }
    }
  }, [paramOrderName])

  const { data: order, isLoading, error } = useOrder(orderName, phone)
  const { data: returnStatus } = useCheckReturn(orderName)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (orderName && phone) {
      setSubmitted(true)
    }
  }

  const getStatusBadge = (status: string) => {
    const badgeMap: Record<string, string> = {
      pending: "badge-info",
      confirmed: "badge-info",
      dispatched: "badge-warning",
      in_transit: "badge-warning",
      delivered: "badge-success",
      cancelled: "badge-error",
      returned: "badge-success",
    }
    return badgeMap[status] || "badge-info"
  }

  const formatDate = (date: Date | string) => {
    const d = new Date(date)
    return d.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (!submitted) {
    return (
      <div className="flex flex-col items-center justify-center h-screen" style={{ padding: "20px" }}>
        <div className="card" style={{ maxWidth: "500px", width: "100%" }}>
          <h1 className="text-lg font-bold mb-4">Track Your Order</h1>
          <p className="text-sm mb-6">Enter your order number and phone number to track your shipment.</p>

          <form onSubmit={handleSearch} className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-bold block mb-2">Order Number</label>
              <input
                type="text"
                placeholder="e.g., #1234567"
                value={orderName}
                onChange={(e) => setOrderName(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "16px",
                }}
                required
              />
            </div>

            <div>
              <label className="text-sm font-bold block mb-2">Phone Number</label>
              <input
                type="tel"
                placeholder="+91 XXXXX XXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  fontSize: "16px",
                }}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
              Track Order
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="card" style={{ maxWidth: "500px" }}>
          <p className="text-center">Loading order details...</p>
        </div>
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center h-screen" style={{ padding: "20px" }}>
        <div className="card" style={{ maxWidth: "500px", width: "100%" }}>
          <p className="text-center text-red-600 mb-4">
            {error instanceof Error ? error.message : "Order not found"}
          </p>
          <button
            className="btn btn-secondary"
            onClick={() => setSubmitted(false)}
            style={{ width: "100%" }}
          >
            Search Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto" }} data-testid="track-order-page">
      {/* Header */}
      <div className="card mb-4">
        <button
          className="btn btn-secondary"
          onClick={() => setSubmitted(false)}
          style={{ marginBottom: "16px" }}
        >
          ← Back
        </button>

        <h1 className="text-lg font-bold mb-2">Order {order.shopifyOrderName}</h1>
        <p className="text-sm text-gray-600">
          Placed on {formatDate(order.createdAt)}
        </p>
      </div>

      {/* Order Summary */}
      <div className="card mb-4">
        <h2 className="font-bold mb-4">Order Summary</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <p className="text-sm text-gray-600">Status</p>
            <p className={`badge ${getStatusBadge(order.status)}`} data-testid="status-badge">{order.status}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total</p>
            <p className="font-bold">₹{order.totalPrice}</p>
          </div>
        </div>

        {order.customer && (
          <div style={{ marginTop: "16px" }}>
            <p className="text-sm text-gray-600">Customer</p>
            <p className="font-bold">{order.customer.name}</p>
            <p className="text-sm">{order.customer.phone}</p>
          </div>
        )}
      </div>

      {/* Timeline / Shipments */}
      {order.shipments && order.shipments.length > 0 && (
        <div className="card mb-4" data-testid="timeline">
          <h2 className="font-bold mb-4">Shipment Timeline</h2>

          {order.shipments.map((shipment: any) => (
            <div
              key={shipment.id}
              data-testid="timeline-event"
              style={{
                borderLeft: "4px solid #000",
                paddingLeft: "16px",
                marginBottom: "16px",
              }}
            >
              <p className="text-sm text-gray-600">AWB: {shipment.awb}</p>
              <p className="font-bold mb-2">
                {shipment.carrier} — <span className={`badge ${getStatusBadge(shipment.status)}`} data-testid="event-status">{shipment.status}</span>
              </p>
              {shipment.lastScannedAt && (
                <p className="text-sm text-gray-600" data-testid="event-timestamp">
                  Last updated: {formatDate(shipment.lastScannedAt)}
                </p>
              )}
              {shipment.isStuck && (
                <p className="text-sm text-orange-600 font-bold mt-2">
                  ⚠️ Delivery delayed. Our team is working on this.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Returns Section */}
      {returnStatus && (
        <div className="card mb-4" data-testid="return-section">
          <h2 className="font-bold mb-4">Returns</h2>
          {returnStatus.eligible ? (
            <>
              <p className="text-sm mb-4" data-testid="return-eligible">This order is eligible for return. You have 7 days from delivery.</p>
              <button
                className="btn btn-primary"
                onClick={() => navigate("/returns")}
                style={{ width: "100%" }}
              >
                Return Item
              </button>
            </>
          ) : (
            <p className="text-sm text-red-600">
              {"reason" in returnStatus ? (returnStatus as any).reason : "Not eligible for return"}
            </p>
          )}
        </div>
      )}

      {/* Return Requests */}
      {order.returnRequests && order.returnRequests.length > 0 && (
        <div className="card">
          <h2 className="font-bold mb-4">Return Requests</h2>
          {order.returnRequests.map((returnReq: any) => (
            <div key={returnReq.id} className="mb-4">
              <p className="text-sm text-gray-600">Status: {returnReq.status}</p>
              <p className="text-sm text-gray-600">Reason: {returnReq.reason}</p>
              <p className="text-sm text-gray-600">
                Created: {formatDate(returnReq.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
