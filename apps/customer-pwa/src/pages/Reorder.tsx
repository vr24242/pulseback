import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useRecentOrders } from "@/hooks/useCustomer.js"

export default function ReorderPage() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState("")
  const [submitted, setSubmitted] = useState(false)

  const { data: orders, isLoading } = useRecentOrders(phone, 20)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (phone) {
      setSubmitted(true)
    }
  }

  const formatDate = (date: Date | string) => {
    const d = new Date(date)
    return d.toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const handleReorder = (orderName: string) => {
    // In a real app, this would redirect to checkout with pre-filled items
    alert(`Reordering from ${orderName}. Redirect to checkout in production.`)
  }

  if (!submitted) {
    return (
      <div className="flex flex-col items-center justify-center h-screen" style={{ padding: "20px" }}>
        <div className="card" style={{ maxWidth: "500px", width: "100%" }}>
          <h1 className="text-lg font-bold mb-4">Reorder from Your History</h1>
          <p className="text-sm mb-6">Enter your phone number to see your past orders and reorder.</p>

          <form onSubmit={handleSearch} className="flex flex-col gap-4">
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
              View Orders
            </button>
          </form>

          <button
            className="btn btn-secondary"
            onClick={() => navigate("/track/latest")}
            style={{ width: "100%", marginTop: "12px" }}
          >
            Back to Home
          </button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <div className="card" style={{ maxWidth: "600px" }}>
          <p className="text-center">Loading your order history...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto", minHeight: "100vh" }}>
      <button className="btn btn-secondary mb-4" onClick={() => setSubmitted(false)}>
        ← Back
      </button>

      <h1 className="text-lg font-bold mb-4">Your Order History</h1>

      {orders && orders.length > 0 ? (
        <div className="flex flex-col gap-4">
          {orders.map((order: any) => (
            <div key={order.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div>
                  <p className="text-sm text-gray-600">Order Number</p>
                  <p className="font-bold mb-4">{order.name}</p>

                  <p className="text-sm text-gray-600">Total</p>
                  <p className="font-bold mb-4">₹{order.total}</p>

                  <p className="text-sm text-gray-600">Ordered on</p>
                  <p className="text-sm">{formatDate(order.createdAt)}</p>
                </div>

                <div style={{ textAlign: "right" }}>
                  <span className="badge badge-info">{order.status}</span>
                </div>
              </div>

              <button
                className="btn btn-primary"
                onClick={() => handleReorder(order.name)}
                style={{ width: "100%", marginTop: "16px" }}
              >
                Reorder
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center">
          <p className="text-sm text-gray-600 mb-4">No orders found for this phone number.</p>
          <button
            className="btn btn-secondary"
            onClick={() => setSubmitted(false)}
            style={{ width: "100%" }}
          >
            Try Another Number
          </button>
        </div>
      )}
    </div>
  )
}
