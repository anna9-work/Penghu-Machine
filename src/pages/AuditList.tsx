import { useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

type Props = {
  onBack: () => void
  onOpenAudit: (auditId: number) => void
}

export default function AuditList({ onBack, onOpenAudit }: Props) {
  const [auditId, setAuditId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    loadAudit()
  }, [])

  async function loadAudit() {
    try {
      setLoading(true)
      setError("")

      const { data, error } = await supabase.rpc(
        "machine_create_or_get_today_audit",
        {
          p_group: "catchme_penghu",
        }
      )

      if (error) {
        throw error
      }

      setAuditId(Number(data))
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? "讀取失敗")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={pageStyle}>
      <button onClick={onBack} style={backButtonStyle}>
        ← 返回
      </button>

      <h1 style={{ marginTop: 20 }}>今日盤點</h1>

      {loading && <p style={mutedStyle}>載入中...</p>}

      {!loading && error && <p style={errorStyle}>{error}</p>}

      {!loading && !error && auditId !== null && (
        <>
          <p style={mutedStyle}>今日盤點單 #{auditId}</p>

          <button
            onClick={() => onOpenAudit(auditId)}
            style={primaryButtonStyle}
          >
            開始盤點
          </button>
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

const mutedStyle: React.CSSProperties = {
  color: "#999",
}

const errorStyle: React.CSSProperties = {
  color: "#ff6666",
}

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  height: 56,
  borderRadius: 16,
  border: "none",
  background: "#fff",
  color: "#111",
  fontSize: 18,
  marginTop: 24,
}