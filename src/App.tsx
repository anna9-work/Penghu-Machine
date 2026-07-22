import { useState } from "react"

import ProductManage from "./pages/ProductManage"
import InboundPage from "./pages/InboundPage"
import AdjustmentPage from "./pages/AdjustmentPage"
import LineBotPage from "./pages/LineBotPage"
import { STORE_NAME } from "./lib/supabase"

type Page = "home" | "products" | "inbound" | "adjustment" | "lineBot"

function App() {
  const [page, setPage] = useState<Page>("home")

  if (page === "products") {
    return <ProductManage onBack={() => setPage("home")} />
  }

  if (page === "inbound") {
    return <InboundPage onBack={() => setPage("home")} />
  }

  if (page === "adjustment") {
    return <AdjustmentPage onBack={() => setPage("home")} />
  }

  if (page === "lineBot") {
    return <LineBotPage onBack={() => setPage("home")} />
  }

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={brandBlockStyle}>
          <h1 style={storeTitleStyle}>{STORE_NAME}</h1>
          <div style={controlTitleStyle}>營運控制</div>
        </div>

        <div style={dateBlockStyle}>
          <div style={dateTextStyle}>{getTaipeiDisplayDate()}</div>
          <div style={bizDateStyle}>業務日：{getBusinessDateValue()}（05:00切日）</div>
        </div>
      </section>

      <section style={summaryCardStyle}>
        <div style={summaryGlowStyle} />

        <div style={summaryHeaderStyle}>
          <span style={summaryLabelStyle}>庫存</span>
          <span style={summaryValueStyle}>--</span>
        </div>

        <div style={metricGridStyle}>
          <div style={metricCellStyle}>
            <span style={metricLabelStyle}>入庫</span>
            <strong style={metricValueStyle}>--</strong>
          </div>

          <div style={metricDividerStyle} />

          <div style={metricCellStyle}>
            <span style={metricLabelStyle}>出庫</span>
            <strong style={metricValueStyle}>--</strong>
          </div>
        </div>
      </section>

      <section style={sectionHeaderStyle}>
        <h2 style={sectionTitleStyle}>快捷功能</h2>
      </section>

      <section style={actionListStyle}>
        <ActionCard
          code="PRD"
          title="商品管理"
          subtitle="新增 / 編輯 / 啟用"
          accent="#66a9ff"
          onClick={() => setPage("products")}
        />

        <ActionCard
          code="ADJ"
          title="異動單"
          subtitle="補入庫 / 補出庫 / 箱轉散"
          accent="#74d6ff"
          onClick={() => setPage("adjustment")}
        />

        <ActionCard
          code="BOT"
          title="LINE Bot"
          subtitle="記錄 / 查詢 / 取消"
          accent="#b9a7ff"
          onClick={() => setPage("lineBot")}
        />
      </section>

      <button style={primaryCtaStyle} onClick={() => setPage("inbound")}>
        <span style={ctaIconStyle}>IN</span>
        <span>入庫</span>
      </button>
    </main>
  )
}

function ActionCard({
  code,
  title,
  subtitle,
  accent,
  onClick,
}: {
  code: string
  title: string
  subtitle: string
  accent: string
  onClick: () => void
}) {
  return (
    <button style={actionCardStyle} onClick={onClick}>
      <span
        style={{
          ...iconBoxStyle,
          borderColor: `${accent}55`,
          boxShadow: `0 0 28px ${accent}1f`,
        }}
      >
        <span style={{ ...iconCodeStyle, color: accent }}>{code}</span>
      </span>

      <span style={actionTextStyle}>
        <span style={actionTitleStyle}>{title}</span>
        <span style={actionSubtitleStyle}>{subtitle}</span>
      </span>

      <span style={{ ...arrowStyle, color: accent }}>→</span>
    </button>
  )
}

function getTaipeiDisplayDate() {
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === "year")?.value ?? ""
  const month = parts.find((part) => part.type === "month")?.value ?? ""
  const day = parts.find((part) => part.type === "day")?.value ?? ""
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? ""

  return `${year}/${month}/${day}(${weekday})`
}

function getBusinessDateValue() {
  const now = new Date()
  const taipeiParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now)

  const year = taipeiParts.find((part) => part.type === "year")?.value ?? ""
  const month = taipeiParts.find((part) => part.type === "month")?.value ?? ""
  const day = taipeiParts.find((part) => part.type === "day")?.value ?? ""
  const hour = Number(taipeiParts.find((part) => part.type === "hour")?.value ?? "0")

  const base = new Date(`${year}-${month}-${day}T12:00:00+08:00`)
  if (hour < 5) base.setDate(base.getDate() - 1)

  const businessYear = base.getFullYear()
  const businessMonth = String(base.getMonth() + 1).padStart(2, "0")
  const businessDay = String(base.getDate()).padStart(2, "0")

  return `${businessYear}-${businessMonth}-${businessDay}`
}

const pageStyle: React.CSSProperties = {
  minHeight: "100dvh",
  width: "100%",
  maxWidth: "100vw",
  overflowX: "hidden",
  background:
    "radial-gradient(circle at 18% 0%, rgba(56, 189, 248, 0.18), transparent 28%), linear-gradient(180deg, #05070b 0%, #030407 100%)",
  color: "#f8fafc",
  padding:
    "calc(env(safe-area-inset-top, 0px) + 18px) 18px calc(env(safe-area-inset-bottom, 0px) + 116px)",
  boxSizing: "border-box",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
}

const heroStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
  alignItems: "end",
  marginBottom: 12,
}

const brandBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
}

const storeTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 23,
  lineHeight: 1.1,
  fontWeight: 950,
  letterSpacing: 0,
}

const controlTitleStyle: React.CSSProperties = {
  color: "#60a5fa",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: 0,
}

const dateBlockStyle: React.CSSProperties = {
  textAlign: "right",
  minWidth: 138,
}

const dateTextStyle: React.CSSProperties = {
  color: "#e5e7eb",
  fontSize: 16,
  lineHeight: 1.2,
  fontWeight: 800,
}

const bizDateStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.4,
  fontWeight: 800,
  marginTop: 6,
}

const summaryCardStyle: React.CSSProperties = {
  position: "relative",
  overflow: "hidden",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: 22,
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.035))",
  boxShadow:
    "0 18px 44px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.11)",
  padding: "15px 18px",
  marginBottom: 22,
}

const summaryGlowStyle: React.CSSProperties = {
  position: "absolute",
  top: -84,
  right: -78,
  width: 150,
  height: 150,
  borderRadius: "50%",
  background: "rgba(96, 165, 250, 0.2)",
  filter: "blur(28px)",
  pointerEvents: "none",
}

const summaryHeaderStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "baseline",
  gap: 12,
  marginBottom: 12,
}

const summaryLabelStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 20,
  lineHeight: 1.1,
  fontWeight: 950,
}

const summaryValueStyle: React.CSSProperties = {
  color: "#60a5fa",
  fontSize: 24,
  lineHeight: 1,
  fontWeight: 950,
  textShadow: "0 0 24px rgba(96, 165, 250, 0.34)",
}

const metricGridStyle: React.CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "1fr 1px 1fr",
  alignItems: "center",
  gap: 14,
}

const metricCellStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
}

const metricLabelStyle: React.CSSProperties = {
  color: "#dbeafe",
  fontSize: 13,
  lineHeight: 1.2,
  fontWeight: 900,
}

const metricValueStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 20,
  lineHeight: 1,
  fontWeight: 950,
}

const metricDividerStyle: React.CSSProperties = {
  width: 1,
  minHeight: 36,
  background:
    "linear-gradient(180deg, transparent, rgba(148,163,184,0.42), transparent)",
}

const sectionHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  margin: "18px 0 12px",
}

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 26,
  lineHeight: 1.1,
  fontWeight: 950,
  letterSpacing: 0,
}

const actionListStyle: React.CSSProperties = {
  display: "grid",
  gap: 13,
}

const actionCardStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 94,
  display: "grid",
  gridTemplateColumns: "64px minmax(0, 1fr) 32px",
  alignItems: "center",
  gap: 15,
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 22,
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.09), rgba(255,255,255,0.035))",
  color: "#f8fafc",
  padding: "14px 16px",
  textAlign: "left",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)",
}

const iconBoxStyle: React.CSSProperties = {
  width: 58,
  height: 58,
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.08)",
}

const iconCodeStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1,
  fontWeight: 950,
  letterSpacing: 0,
}

const actionTextStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 6,
}

const actionTitleStyle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 22,
  lineHeight: 1.1,
  fontWeight: 950,
}

const actionSubtitleStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 14,
  lineHeight: 1.25,
  fontWeight: 850,
}

const arrowStyle: React.CSSProperties = {
  justifySelf: "end",
  fontSize: 34,
  lineHeight: 1,
  fontWeight: 900,
}

const primaryCtaStyle: React.CSSProperties = {
  position: "fixed",
  left: 18,
  right: 18,
  bottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)",
  zIndex: 20,
  minHeight: 68,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 14,
  border: "none",
  borderRadius: 28,
  background: "linear-gradient(135deg, #69aafc, #4f8eee)",
  color: "#ffffff",
  fontSize: 23,
  fontWeight: 950,
  boxShadow: "0 18px 48px rgba(59,130,246,0.42)",
}

const ctaIconStyle: React.CSSProperties = {
  width: 48,
  height: 48,
  display: "grid",
  placeItems: "center",
  borderRadius: 18,
  background: "rgba(255,255,255,0.16)",
  color: "#dbeafe",
  fontSize: 13,
  lineHeight: 1,
  fontWeight: 950,
}

export default App