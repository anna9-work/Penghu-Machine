type Props = {
  onBack: () => void
}

export default function AuditHistory({ onBack }: Props) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0f0f",
        color: "#fff",
        padding: "44px 16px 24px",
        boxSizing: "border-box",
      }}
    >
      <button
        onClick={onBack}
        style={{
          background: "transparent",
          color: "#fff",
          border: "none",
          fontSize: 18,
          padding: 0,
        }}
      >
        ← 返回
      </button>

      <h1 style={{ marginTop: 20 }}>歷史盤點</h1>

      <p style={{ color: "#999" }}>
        之後會顯示已關帳與歷史盤點單
      </p>
    </div>
  )
}