import { useNavigate, useLocation } from "react-router-dom"
import { getShopId } from "@/lib/auth.js"

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const shopId = getShopId()

  const isActive = (path: string) => {
    return location.pathname === path ? "active" : ""
  }

  const handleLogout = () => {
    localStorage.removeItem("jwt_token")
    navigate("/login")
  }

  return (
    <div className="sidebar">
      <div className="mb-8">
        <h2 className="text-lg font-bold">Dashboard</h2>
        <p className="text-xs text-gray-600">Shop: {shopId?.substring(0, 8)}...</p>
      </div>

      <nav className="flex flex-col gap-2 mb-8">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault()
            navigate("/")
          }}
          className={`nav-link ${isActive("/")}`}
        >
          📊 Overview
        </a>
        <a
          href="/ndr"
          onClick={(e) => {
            e.preventDefault()
            navigate("/ndr")
          }}
          className={`nav-link ${isActive("/ndr")}`}
        >
          🚨 Stuck Shipments (NDR)
        </a>
        <a
          href="/returns"
          onClick={(e) => {
            e.preventDefault()
            navigate("/returns")
          }}
          className={`nav-link ${isActive("/returns")}`}
        >
          📦 Pending Returns
        </a>
      </nav>

      <div className="border-t border-gray-200 pt-4">
        <button
          onClick={handleLogout}
          className="w-full text-left px-4 py-2 rounded text-sm text-gray-600 hover:bg-red-50 hover:text-red-700 transition-colors"
        >
          🚪 Logout
        </button>
      </div>

      <div className="mt-8 pt-4 border-t border-gray-200 text-xs text-gray-500">
        <p>Pulseback Merchant Dashboard</p>
        <p className="mt-1">v1.0.0</p>
      </div>
    </div>
  )
}
