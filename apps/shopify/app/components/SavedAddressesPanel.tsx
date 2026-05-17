import { useState } from "react"
import type { SavedAddressData } from "../hooks/useSavedAddresses"

interface SavedAddressesPanelProps {
  addresses: SavedAddressData[]
  selectedAddressId?: string
  onSelectAddress: (address: SavedAddressData) => void
  onDeleteAddress: (id: string) => Promise<boolean>
  onSetDefault: (id: string) => Promise<boolean>
  onAddNew: () => void
  loading?: boolean
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 16,
  marginBottom: 12,
  cursor: "pointer",
  transition: "all 0.2s",
}

const selectedStyle: React.CSSProperties = {
  ...cardStyle,
  borderColor: "#3b82f6",
  backgroundColor: "#eff6ff",
  borderWidth: 2,
}

const labelBadgeStyle: React.CSSProperties = {
  display: "inline-block",
  backgroundColor: "#dbeafe",
  color: "#0c4a6e",
  padding: "4px 8px",
  borderRadius: 4,
  fontSize: 12,
  fontWeight: 600,
  marginRight: 8,
}

const defaultBadgeStyle: React.CSSProperties = {
  ...labelBadgeStyle,
  backgroundColor: "#dcfce7",
  color: "#166534",
}

const actionButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#ef4444",
  cursor: "pointer",
  fontSize: 13,
  padding: "4px 0",
  marginRight: 16,
}

const setDefaultButtonStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "#0c4a6e",
  cursor: "pointer",
  fontSize: 13,
  padding: "4px 0",
}

export function SavedAddressesPanel({
  addresses,
  selectedAddressId,
  onSelectAddress,
  onDeleteAddress,
  onSetDefault,
  onAddNew,
  loading = false,
}: SavedAddressesPanelProps) {
  const [deleting, setDeleting] = useState<string | null>(null)
  const [setting, setSetting] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remove this address?")) return
    setDeleting(id)
    const success = await onDeleteAddress(id)
    if (success) {
      setDeleting(null)
    }
  }

  const handleSetDefault = async (id: string) => {
    setSetting(id)
    const success = await onSetDefault(id)
    if (success) {
      setSetting(null)
    }
  }

  if (addresses.length === 0) {
    return null
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: "#111827" }}>
        📍 Saved Addresses
      </h3>

      {addresses.map(address => (
        <div
          key={address.id}
          style={selectedAddressId === address.id ? selectedStyle : cardStyle}
          onClick={() => !loading && onSelectAddress(address)}
          onMouseEnter={e => {
            if (selectedAddressId !== address.id) {
              (e.currentTarget as HTMLElement).style.borderColor = "#d1d5db"
              (e.currentTarget as HTMLElement).style.backgroundColor = "#f9fafb"
            }
          }}
          onMouseLeave={e => {
            if (selectedAddressId !== address.id) {
              (e.currentTarget as HTMLElement).style.borderColor = "#e5e7eb"
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"
            }
          }}
        >
          {/* Header: Name + Badge + Radio */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{address.name}</div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                {address.label && <span style={labelBadgeStyle}>{address.label}</span>}
                {address.isDefault && <span style={defaultBadgeStyle}>Default</span>}
              </div>
            </div>
            <input
              type="radio"
              name="address"
              checked={selectedAddressId === address.id}
              onChange={() => onSelectAddress(address)}
              style={{ marginLeft: 16, width: 20, height: 20, cursor: "pointer" }}
            />
          </div>

          {/* Address Details */}
          <div style={{ fontSize: 13, color: "#374151", marginBottom: 12 }}>
            <div>{address.address1}</div>
            {address.address2 && <div>{address.address2}</div>}
            <div>
              {address.city}, {address.state} {address.pincode}
            </div>
            {address.phone && <div>📱 {address.phone}</div>}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", fontSize: 12 }}>
            <button
              style={actionButtonStyle}
              onClick={e => {
                e.stopPropagation()
                handleDelete(address.id)
              }}
              disabled={deleting === address.id}
            >
              {deleting === address.id ? "Removing..." : "Remove"}
            </button>
            {!address.isDefault && (
              <button
                style={setDefaultButtonStyle}
                onClick={e => {
                  e.stopPropagation()
                  handleSetDefault(address.id)
                }}
                disabled={setting === address.id}
              >
                {setting === address.id ? "Setting..." : "Set as default"}
              </button>
            )}
          </div>
        </div>
      ))}

      <button
        onClick={onAddNew}
        style={{
          width: "100%",
          padding: 12,
          border: "2px dashed #d1d5db",
          borderRadius: 8,
          backgroundColor: "#f9fafb",
          color: "#0c4a6e",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          marginTop: 8,
        }}
      >
        + Add New Address
      </button>
    </div>
  )
}
