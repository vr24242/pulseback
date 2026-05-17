import { useState } from "react"
import { useNDRQueue, useApproveNDR } from "@/hooks/useMerchant.js"
import Sidebar from "@/components/Sidebar.js"

type ActionType = "reattempt" | "rto" | "update_address"

interface SelectedAction {
  shipmentId: string
  action: ActionType
}

export default function NDRQueue() {
  const { data: ndrQueue, isLoading } = useNDRQueue()
  const { mutate: approveNDR, isPending } = useApproveNDR()
  const [selectedAction, setSelectedAction] = useState<SelectedAction | null>(null)

  const handleAction = (shipmentId: string, action: ActionType) => {
    setSelectedAction({ shipmentId, action })
  }

  const handleConfirmAction = () => {
    if (selectedAction) {
      approveNDR({
        shipmentId: selectedAction.shipmentId,
        action: selectedAction.action,
      })
      setSelectedAction(null)
    }
  }

  const getActionBadgeColor = (failedAttempts: number) => {
    if (failedAttempts >= 3) return "badge-error"
    if (failedAttempts >= 2) return "badge-warning"
    return "badge-info"
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

  return (
    <div className="layout">
      <Sidebar />
      <div className="main-content">
        <div className="container">
          {/* Header */}
          <div className="mb-4 flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold">Non-Delivery Returns (NDR)</h1>
              <p className="text-sm text-gray-600">
                {ndrQueue?.length || 0} stuck shipments requiring action
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="card text-center py-8">
              <p>Loading NDR queue...</p>
            </div>
          ) : !ndrQueue || ndrQueue.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-2xl mb-2">✓</p>
              <p className="font-semibold">No stuck shipments</p>
              <p className="text-sm text-gray-600">All orders are on track!</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {ndrQueue.map((shipment: any) => (
                <div key={shipment.id} className="card">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="font-bold">Order {shipment.order?.shopifyOrderName}</p>
                      <p className="text-sm text-gray-600">AWB: {shipment.awb}</p>
                    </div>
                    <span className={`badge ${getActionBadgeColor(shipment.failedAttempts)}`}>
                      {shipment.failedAttempts} attempts
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-600">Carrier</p>
                      <p className="font-semibold">{shipment.carrier}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Last Update</p>
                      <p className="font-semibold text-sm">{formatDate(shipment.lastScannedAt)}</p>
                    </div>
                  </div>

                  {shipment.order?.customer && (
                    <div className="bg-gray-50 rounded p-3 mb-4">
                      <p className="text-xs text-gray-600 mb-1">Customer</p>
                      <p className="font-semibold">{shipment.order.customer.name}</p>
                      <p className="text-sm">{shipment.order.customer.phone}</p>
                    </div>
                  )}

                  {selectedAction?.shipmentId === shipment.id ? (
                    <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-4">
                      <p className="font-semibold mb-3">Confirm Action</p>
                      <p className="text-sm mb-4">
                        {selectedAction && selectedAction.action === "reattempt" &&
                          "This will notify the courier to attempt delivery again."}
                        {selectedAction && selectedAction.action === "rto" &&
                          "This will initiate a return-to-origin process."}
                        {selectedAction && selectedAction.action === "update_address" &&
                          "This will prompt the customer to provide updated address."}
                      </p>
                      <div className="flex gap-2">
                        <button
                          className="btn btn-success btn-sm flex-1"
                          onClick={handleConfirmAction}
                          disabled={isPending}
                        >
                          {isPending ? "Processing..." : "Confirm"}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm flex-1"
                          onClick={() => setSelectedAction(null)}
                          disabled={isPending}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn btn-primary btn-sm flex-1"
                        onClick={() => handleAction(shipment.id, "reattempt")}
                      >
                        Retry Delivery
                      </button>
                      <button
                        className="btn btn-warning btn-sm flex-1"
                        onClick={() => handleAction(shipment.id, "update_address")}
                      >
                        Update Address
                      </button>
                      <button
                        className="btn btn-danger btn-sm flex-1"
                        onClick={() => handleAction(shipment.id, "rto")}
                      >
                        Initiate RTO
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
