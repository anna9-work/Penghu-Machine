import { useState, type CSSProperties } from "react"

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
    return <InboundPage onBack={() => setPage("home")} onSaved={() => {}} />
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
        <div>
          <div style={storeLabelStyle}>{STORE_NAME}</div>
          <h1 style={titleStyle}>營運控制台</h1>
        </div>

        <div style={dateBlockStyle}>
          <div style={dateTextStyle}>{getTaipeiDisplayDate()}</div>
          <div style={bizDateStyle}>業務日：{getBusinessDateText()}</div>
        </div>
      </section>

      <section style={summaryCardStyle}>
        <div style={summaryGlowStyle} />

        <div style={summaryHeaderStyle}>
          <span style={summaryLabelStyle}>庫存</span>
          <span style={summaryValueStyle}>管理</span>
        </div>

        <div style={metricGridStyle}>
          <div style={metricCellStyle}>
            <span style={metricLabelStyle}>入庫</span>
            <strong style={metricValueStyle}>IN</strong>
          </div>
          <div style={metricDividerStyle} />
          <div style={metricCellStyle}>
            <span style={metricLabelStyle}>出庫</span>
            <strong style={metricValueStyle}>OUT</strong>
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
          code="IN"
          title="入庫"
          subtitle="總倉 / 撤台 / 夾換品"
          accent="#8bdbb5"
          onClick={() => setPage("inbound")}
        />

        <ActionCard
          code="ADJ"
          title="異動單"
          subtitle="補入庫 / 補出庫"
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
          boxShadow: `0 0 30px ${accent}1f`,
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

function getBusinessDateText() {
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
  const hour = Number(
    taipeiParts.find((part) => part.type === "hour")?.value ?? "0",
  )

  const base = new Date(`${year}-${month}-${day}T12:00:00+08:00`)
  if (hour < 5) base.setDate(base.getDate() - 1)

  const businessYear = base.getFullYear()
  const businessMonth = String(base.getMonth() + 1).padStart(2, "0")
  const businessDay = String(base.getDate()).padStart(2, "0")

  return `${businessYear}-${businessMonth}-${businessDay}（05:00切日）`
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  width: "100%",
  maxWidth: "100vw",
  overflowX: "hidden",
  background:
    "radial-gradient(circle at 18% 0%, rgba(56, 189, 248, 0.2), transparent 28%), linear-gradient(180deg, #05070b 0%, #030407 100%)",
  color: "#f8fafc",
  padding: "calc(env(safe-area-inset-top, 0px) + 32px) 18px 28px",
  boxSizing: "border-box",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
}

const heroStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 14,
  alignItems: "end",
  marginBottom: 22,
}

const storeLabelStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 28,
  lineHeight: 1.1,
  fontWeight: 950,
  letterSpacing: 0,
  marginBottom: 8,
}

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#8dd7ff",
  fontSize: 14,
  lineHeight: 1.2,
  fontWeight: 900,
  letterSpacing: 0,
}

const dateBlockStyle: CSSProperties = {
  textAlign: "right",
  minWidth: 138,
}

const dateTextStyle: CSSProperties = {
  color: "#e5e7eb",
  fontSize: 16,
  lineHeight: 1.2,
  fontWeight: 800,
}

const bizDateStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.4,
  fontWeight: 800,
  marginTop: 6,
}

const summaryCardStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  borderRadius: 28,
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
  boxShadow:
    "0 24px 60px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.13)",
  padding: 24,
  marginBottom: 28,
}

const summaryGlowStyle: CSSProperties = {
  position: "absolute",
  top: -80,
  right: -70,
  width: 170,
  height: 170,
  borderRadius: "50%",
  background: "rgba(96, 165, 250, 0.22)",
  filter: "blur(28px)",
  pointerEvents: "none",
}

const summaryHeaderStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "baseline",
  gap: 14,
  marginBottom: 22,
}

const summaryLabelStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 28,
  lineHeight: 1.1,
  fontWeight: 950,
}

const summaryValueStyle: CSSProperties = {
  color: "#60a5fa",
  fontSize: 38,
  lineHeight: 1,
  fontWeight: 950,
  textShadow: "0 0 28px rgba(96, 165, 250, 0.36)",
}

const metricGridStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "1fr 1px 1fr",
  alignItems: "center",
  gap: 18,
}

const metricCellStyle: CSSProperties = {
  display: "grid",
  gap: 10,
}

const metricLabelStyle: CSSProperties = {
  color: "#dbeafe",
  fontSize: 18,
  lineHeight: 1.2,
  fontWeight: 900,
}

const metricValueStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 32,
  lineHeight: 1,
  fontWeight: 950,
}

const metricDividerStyle: CSSProperties = {
  width: 1,
  minHeight: 66,
  background:
    "linear-gradient(180deg, transparent, rgba(148,163,184,0.45), transparent)",
}

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  margin: "24px 0 12px",
}

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 28,
  lineHeight: 1.1,
  fontWeight: 950,
  letterSpacing: 0,
}

const actionListStyle: CSSProperties = {
  display: "grid",
  gap: 14,
}

const actionCardStyle: CSSProperties = {
  width: "100%",
  minHeight: 104,
  display: "grid",
  gridTemplateColumns: "72px minmax(0, 1fr) 34px",
  alignItems: "center",
  gap: 16,
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 24,
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.09), rgba(255,255,255,0.035))",
  color: "#f8fafc",
  padding: "16px 18px",
  textAlign: "left",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)",
}

const iconBoxStyle: CSSProperties = {
  width: 64,
  height: 64,
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 18,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.08)",
}

const iconCodeStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1,
  fontWeight: 950,
  letterSpacing: 0,
}

const actionTextStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 7,
}

const actionTitleStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 23,
  lineHeight: 1.1,
  fontWeight: 950,
}

const actionSubtitleStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 15,
  lineHeight: 1.25,
  fontWeight: 850,
}

const arrowStyle: CSSProperties = {
  justifySelf: "end",
  fontSize: 36,
  lineHeight: 1,
}

export default App