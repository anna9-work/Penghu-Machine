//MachineAuditDetail.tsx
import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

type Props = {
  auditId: number | null
  machineNo: string
  onBack: () => void
}

type AuditItem = {
  product_sku: string
  product_name: string
  units_per_box: number
  outside_box: number
  outside_piece: number
  comment?: string
}

type MachineRow = {
  machine_no: string
  enabled: boolean
  items: AuditItem[]
}

export default function MachineAuditDetail({
  auditId,
  machineNo,
  onBack,
}: Props) {
  const [items, setItems] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    loadMachineItems()
  }, [auditId, machineNo])

  async function loadMachineItems() {
    if (!auditId || !machineNo) return

    try {
      setLoading(true)
      setError("")

      const { data, error } = await supabase.rpc("machine_audit_form_v1", {
        p_group: "catchme_penghu",
        p_audit_id: auditId,
      })

      if (error) {
        throw error
      }

      const rows = (data ?? []) as MachineRow[]
      const machine = rows.find((row) => row.machine_no === machineNo)

      setItems(machine?.items ?? [])
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? "讀取機台商品失敗")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={pageStyle}>
      <button onClick={onBack} style={backButtonStyle}>
        ← 返回
      </button>

      <h1 style={{ marginTop: 20 }}>機台 {machineNo}</h1>

      <p style={infoStyle}>盤點單 #{auditId ?? "-"}</p>

      {loading && <p style={infoStyle}>載入商品中...</p>}

      {!loading && error && <p style={errorStyle}>{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p style={infoStyle}>這台目前沒有商品</p>
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div style={listStyle}>
            {items.map((item) => (
              <div key={item.product_sku} style={cardStyle}>
                <div style={nameStyle}>{item.product_name}</div>

                <div style={skuStyle}>{item.product_sku}</div>

                <div style={boxStyle}>箱入數：{item.units_per_box}</div>

                <label style={labelStyle}>盤點箱數</label>

                <input
                  type="number"
                  inputMode="numeric"
                  defaultValue={item.outside_box || ""}
                  style={inputStyle}
                />

                <label style={labelStyle}>盤點散數</label>

                <input
                  type="number"
                  inputMode="numeric"
                  defaultValue={item.outside_piece || ""}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>

          <button style={saveButtonStyle}>儲存</button>
        </>
      )}
    </div>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0f0f0f",
  color: "#fff",
  padding: "44px 16px 24px",
  boxSizing: "border-box",
}

const backButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: "#fff",
  border: "none",
  fontSize: 18,
  padding: 0,
}

const infoStyle: React.CSSProperties = {
  color: "#999",
}

const errorStyle: React.CSSProperties = {
  color: "#ff6666",
}

const listStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
  marginTop: 20,
}

const cardStyle: React.CSSProperties = {
  border: "1px solid #333",
  borderRadius: 16,
  background: "#1a1a1a",
  padding: 16,
}

const nameStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
}

const skuStyle: React.CSSProperties = {
  color: "#aaa",
  fontSize: 13,
  marginTop: 6,
}

const boxStyle: React.CSSProperties = {
  color: "#ddd",
  fontSize: 14,
  marginTop: 10,
}

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "#bbb",
  fontSize: 14,
  marginTop: 14,
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 12,
  border: "1px solid #444",
  background: "#0f0f0f",
  color: "#fff",
  fontSize: 18,
  padding: "0 12px",
  boxSizing: "border-box",
  marginTop: 6,
}

const saveButtonStyle: React.CSSProperties = {
  width: "100%",
  height: 54,
  borderRadius: 16,
  border: "none",
  background: "#fff",
  color: "#111",
  fontSize: 18,
  marginTop: 20,
}