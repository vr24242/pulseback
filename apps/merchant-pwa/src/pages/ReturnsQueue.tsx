import { useState } from "react"
import { useReturnsQueue, useApproveReturn } from "@/hooks/useMerchant.js"
import Sidebar from "@/components/Sidebar.js"

type ActionType = "approve" | "reject" | "request_info"

interface SelectedAction {
  returnId: string
  action: ActionType
}

export default function ReturnsQueue() {
  const { data: returnsQueue, isLoading } = useReturnsQueue()
  const { mutate: approveReturn, isPending } = useApproveReturn()
  const [selectedAction, setSelectedAction] = useState<SelectedAction | null>(null)
  const [reason, setReason] = useState("")

  const handleAction = (returnId: string, action: ActionType) => {
    setSelectedAction({ returnId, action })
    setReason("")
  }

  const handleConfirmAction = () => {
    if (selectedAction) {
      approveReturn(
        {
          returnId: selectedAction.returnId,
          approved: selectedAction.action === "approve",
        },
        {
          onSuccess: () => {
            setSelectedAction(null)
            setReason("")
          },
        }
      )
    }
  }

  const getStatusBadgeColor = (status: string) => {
    if (status === "approved") return "badge-success"
    if (status === "rejected") return "badge-error"
    return "badge-warning"
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
              <h1 className="text-xl font-bold">Pending Returns</h1>
              <p className="text-sm text-gray-600">
                {returnsQueue?.length || 0} return requests awaiting approval
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="card text-center py-8">
              <p>Loading returns queue...</p>
            </div>
          ) : !returnsQueue || returnsQueue.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-2xl mb-2">✓</p>
              <p className="font-semibold">All returns processed</p>
              <p className="text-sm text-gray-600">No pending approvals</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {returnsQueue.map((returnRequest: any) => (
                <div key={returnRequest.id} className="card">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="font-bold">Order {returnRequest.order?.shopifyOrderName}</p>
                      <p className="text-sm text-gray-600">Return ID: {returnRequest.id}</p>
                    </div>
                    <span className={`badge ${getStatusBadgeColor(returnRequest.status)}`}>
                      {returnRequest.status}
                    </span>
                  </div>

                  {returnRequest.order?.customer && (
                    <div className="bg-gray-50 rounded p-3 mb-4">
                      <p className="text-xs text-gray-600 mb-1">Customer</p>
                      <p className="font-semibold">{returnRequest.order.customer.name}</p>
                      <p className="text-sm">{returnRequest.order.customer.phone}</p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-600">Reason</p>
                      <p className="font-semibold text-sm">{returnRequest.reason || "N/A"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Requested</p>
                      <p className="font-semibold text-sm">
                        {formatDate(returnRequest.createdAt)}
                      </p>
                    </div>
                  </div>

                  {returnRequest.items && returnRequest.items.length > 0 && (
                    <div className="bg-gray-50 rounded p-3 mb-4">
                      <p className="text-xs text-gray-600 mb-2 font-semibold">Items</p>
                      <div className="flex flex-col gap-2">
                        {returnRequest.items.map((item: any, idx: number) => (
                          <div key={idx} className="text-sm">
                            <p className="font-semibold">{item.title || "Product"}</p>
                            <p className="text-xs text-gray-600">
                              Qty: {item.quantity} | SKU: {item.sku || "N/A"}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {returnRequest.status === "pending" ? (
                    <>
                      {selectedAction?.returnId === returnRequest.id ? (
                        <div className="bg-blue-50 border border-blue-200 rounded p-4 mb-4">
                          <p className="font-semibold mb-3">
                            {selectedAction && selectedAction.action === "approve" && "Approve Return"}
                            {selectedAction && selectedAction.action === "reject" && "Reject Return"}
                            {selectedAction && selectedAction.action === "request_info" && "Request More Info"}
                          </p>
                          <p className="text-sm mb-4">
                            {selectedAction && selectedAction.action === "approve" &&
                              "This will approve the return and initiate the reverse pickup process."}
                            {selectedAction && selectedAction.action === "reject" &&
                              "This will reject the return request. Customer will be notified."}
                            {selectedAction && selectedAction.action === "request_info" &&
                              "Send a message to customer requesting additional information."}
                          </p>
                          {selectedAction && (selectedAction.action === "reject" ||
                            selectedAction.action === "request_info") && (
                            <textarea
                              className="w-full p-2 border border-gray-300 rounded mb-4 text-sm"
                              placeholder="Enter reason or message..."
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              rows={3}
                              disabled={isPending}
                            />
                          )}
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
                            className="btn btn-success btn-sm flex-1"
                            onClick={() => handleAction(returnRequest.id, "approve")}
                          >
                            Approve
                          </button>
                          <button
                            className="btn btn-warning btn-sm flex-1"
                            onClick={() => handleAction(returnRequest.id, "request_info")}
                          >
                            More Info
                          </button>
                          <button
                            className="btn btn-danger btn-sm flex-1"
                            onClick={() => handleAction(returnRequest.id, "reject")}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-sm text-gray-600 p-3 bg-gray-50 rounded">
                      <p>Status: <span className="font-semibold capitalize">{returnRequest.status}</span></p>
                      {returnRequest.approvedAt && (
                        <p>Approved on: {formatDate(returnRequest.approvedAt)}</p>
                      )}
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
