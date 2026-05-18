import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useCheckReturn, useStartReturn, useRecentOrders } from "@/hooks/useCustomer.js"

type Step = "select_order" | "select_items" | "confirm" | "success"

export default function ReturnFlow() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>("select_order")
  const [orderName, setOrderName] = useState("")
  const [phone, setPhone] = useState("")
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const [reason, setReason] = useState("")

  const { data: orders } = useRecentOrders(phone, 10)
  const { data: returnStatus } = useCheckReturn(orderName)
  const { mutate: startReturn, isPending, isSuccess, data: returnResult } = useStartReturn()

  const handleSelectOrder = () => {
    if (orderName && phone) {
      setStep("select_items")
    }
  }

  const handleSelectItems = () => {
    if (selectedItems.length > 0 && reason) {
      setStep("confirm")
    }
  }

  const handleConfirmReturn = () => {
    startReturn({
      orderName,
      items: selectedItems,
      reason,
    })
  }

  if (isSuccess && returnResult) {
    return (
      <div className="flex flex-col items-center justify-center h-screen" style={{ padding: "20px" }} data-testid="return-success">
        <div className="card" style={{ maxWidth: "500px", width: "100%" }}>
          <h1 className="text-lg font-bold mb-4 text-green-600">✓ Return Initiated</h1>
          <p className="text-sm mb-4">
            Your return request (ID: {returnResult.returnId}) has been submitted.
          </p>
          <p className="text-sm mb-6 text-gray-600">{returnResult.message}</p>

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              className="btn btn-secondary"
              onClick={() => navigate("/track/" + orderName)}
              style={{ flex: 1 }}
            >
              Track Order
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setStep("select_order")
                setOrderName("")
                setSelectedItems([])
                setReason("")
              }}
              style={{ flex: 1 }}
            >
              Return Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: "20px", maxWidth: "600px", margin: "0 auto", minHeight: "100vh" }}>
      <button className="btn btn-secondary mb-4" onClick={() => navigate("/track/latest")}>
        ← Back
      </button>

      {step === "select_order" && (
        <div className="card" data-testid="return-modal">
          <h1 className="text-lg font-bold mb-4">Select Order to Return</h1>

          <div className="flex flex-col gap-4">
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
                }}
              />
            </div>

            {orders && orders.length > 0 && (
              <div>
                <label className="text-sm font-bold block mb-2">Order</label>
                <select
                  value={orderName}
                  onChange={(e) => setOrderName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                  }}
                >
                  <option value="">Select an order...</option>
                  {orders.map((order: any) => (
                    <option key={order.name} value={order.name}>
                      {order.name} - ₹{order.total} ({order.status})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {returnStatus && returnStatus.eligible && (
              <p className="text-sm text-green-600 text-center" data-testid="return-eligible">✓ This order is eligible for return</p>
            )}

            {returnStatus && !returnStatus.eligible && "reason" in returnStatus && (
              <p className="text-sm text-red-600 text-center">{(returnStatus as any).reason}</p>
            )}

            <button
              className="btn btn-primary"
              onClick={handleSelectOrder}
              disabled={!orderName || !phone}
              style={{ opacity: !orderName || !phone ? 0.5 : 1 }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === "select_items" && (
        <div className="card" data-testid="return-modal">
          <h1 className="text-lg font-bold mb-4">Select Items to Return</h1>

          <div className="flex flex-col gap-4">
            {[1, 2, 3].map((i) => (
              <label key={i} style={{ display: "flex", gap: "8px", padding: "12px" }}>
                <input
                  type="checkbox"
                  value={`item_${i}`}
                  data-testid="item-checkbox"
                  checked={selectedItems.includes(`item_${i}`)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedItems([...selectedItems, e.target.value])
                    } else {
                      setSelectedItems(selectedItems.filter((x) => x !== e.target.value))
                    }
                  }}
                />
                <span>Item {i}</span>
              </label>
            ))}
          </div>

          <div style={{ marginTop: "24px" }}>
            <label className="text-sm font-bold block mb-2">Reason for Return</label>
            <div className="flex flex-col gap-2 mb-4">
              {["damaged", "wrong_item", "not_as_described"].map((opt) => (
                <label key={opt} style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="radio"
                    name="reason"
                    value={opt}
                    data-testid={opt === "wrong_item" ? "return-reason-wrong-item" : "return-reason-option"}
                    checked={reason === opt}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <span>{opt.replace("_", " ").toUpperCase()}</span>
                </label>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please tell us why you want to return this item..."
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                minHeight: "100px",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
            <button
              className="btn btn-secondary"
              onClick={() => setStep("select_order")}
              style={{ flex: 1 }}
            >
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSelectItems}
              disabled={selectedItems.length === 0 || !reason}
              style={{ flex: 1, opacity: selectedItems.length === 0 || !reason ? 0.5 : 1 }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === "confirm" && (
        <div className="card" data-testid="return-confirm">
          <h1 className="text-lg font-bold mb-4">Confirm Return</h1>

          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-2">Order Number</p>
            <p className="font-bold mb-6">{orderName}</p>

            <p className="text-sm text-gray-600 mb-2">Items to Return</p>
            <ul className="mb-6">
              {selectedItems.map((item: string) => (
                <li key={item} className="text-sm mb-1">
                  ✓ {item}
                </li>
              ))}
            </ul>

            <p className="text-sm text-gray-600 mb-2">Reason</p>
            <p className="text-sm mb-4">{reason}</p>

            <p className="text-sm text-gray-600 mb-2">Pickup Address</p>
            <div data-testid="pickup-address" className="mb-4">
              <p className="text-sm">Home</p>
            </div>

            <p className="text-sm text-gray-600 mb-2">Pickup Window</p>
            <div data-testid="pickup-window" className="mb-4">
              <p className="text-sm">Next 3 business days</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button
              className="btn btn-secondary"
              onClick={() => setStep("select_items")}
              style={{ flex: 1 }}
            >
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={handleConfirmReturn}
              disabled={isPending}
              style={{ flex: 1, opacity: isPending ? 0.5 : 1 }}
            >
              {isPending ? "Processing..." : "Submit Return"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
