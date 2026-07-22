// MachineProfitPage.tsx
import type { CSSProperties } from "react"

type Props = {
  onBack: () => void
  onInnerAdjustClick: () => void
}

type ToolItem = {
  code: string
  title: string
  subtitle: string
  accent: string
  onClick: () => void
}

export default function MachineProfitPage({
  onBack,
  onInnerAdjustClick,
}: Props) {
  const tools: ToolItem[] = [
    {
      code: "ADJ",
      title: "台內校正",
      subtitle: "大盤 / 月盤後調整起始台內數量",
      accent: "#f7c873",
      onClick: onInnerAdjustClick,
    },
  ]

  return (
    <div style={pageStyle}>
      <div style={topBarStyle}>
        <button onClick={onBack} style={backButtonStyle}>
          ‹
        </button>

        <div style={titleBlockStyle}>
          <h1 style={titleStyle}>機台損益</h1>
          <div style={subTitleStyle}>日報 / 校正</div>
        </div>

        <div />
      </div>

      <section style={summaryPanelStyle}>
        <div style={summaryKickerStyle}>機台日結</div>
        <div style={summaryTitleStyle}>台內、台頂與每日損益校正</div>
        <div style={summaryTextStyle}>
          大盤或月盤確認台內數量後，在這裡寫入校正值；重建後會影響後續每日損益計算。
        </div>
      </section>

      <section style={sectionHeaderStyle}>
        <h2 style={sectionTitleStyle}>功能列</h2>
      </section>

      <section style={toolListStyle}>
        {tools.map((tool) => (
          <button key={tool.code} onClick={tool.onClick} style={toolCardStyle}>
            <span
              style={{
                ...toolIconStyle,
                color: tool.accent,
                borderColor: `${tool.accent}55`,
                boxShadow: `0 0 28px ${tool.accent}20`,
              }}
            >
              {tool.code}
            </span>

            <span style={toolTextStyle}>
              <span style={toolTitleStyle}>{tool.title}</span>
              <span style={toolSubtitleStyle}>{tool.subtitle}</span>
            </span>

            <span style={{ ...arrowStyle, color: tool.accent }}>→</span>
          </button>
        ))}
      </section>
    </div>
  )
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  width: "100%",
  maxWidth: "100vw",
  overflowX: "hidden",
  background: "#050913",
  color: "#fff",
  padding: "0 16px 32px",
  boxSizing: "border-box",
  fontFamily: "system-ui, -apple-system, sans-serif",
  WebkitTextSizeAdjust: "100%",
  touchAction: "manipulation",
}

const topBarStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 100,
  background: "#050913",
  paddingTop: "max(12px, env(safe-area-inset-top))",
  paddingBottom: 8,
  display: "grid",
  gridTemplateColumns: "48px minmax(0, 1fr) 48px",
  alignItems: "center",
  borderBottom: "1px solid #111827",
  width: "100%",
  boxSizing: "border-box",
  marginBottom: 12,
}

const backButtonStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#d1d5db",
  fontSize: 32,
  lineHeight: 1,
  padding: 0,
  minHeight: 44,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
}

const titleBlockStyle: CSSProperties = {
  textAlign: "center",
  minWidth: 0,
  overflow: "hidden",
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 850,
  letterSpacing: 0,
  lineHeight: 1.2,
}

const subTitleStyle: CSSProperties = {
  color: "#9ca3af",
  marginTop: 2,
  fontSize: 12,
  lineHeight: 1.2,
}

const summaryPanelStyle: CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: 18,
  background:
    "linear-gradient(145deg, rgba(247, 200, 115, 0.14), rgba(255,255,255,0.04))",
  padding: 16,
  boxSizing: "border-box",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)",
}

const summaryKickerStyle: CSSProperties = {
  color: "#f7c873",
  fontSize: 13,
  fontWeight: 900,
  lineHeight: 1.2,
  marginBottom: 8,
}

const summaryTitleStyle: CSSProperties = {
  color: "#fff",
  fontSize: 21,
  fontWeight: 950,
  lineHeight: 1.2,
}

const summaryTextStyle: CSSProperties = {
  color: "#cbd5e1",
  fontSize: 14,
  fontWeight: 650,
  lineHeight: 1.55,
  marginTop: 8,
}

const sectionHeaderStyle: CSSProperties = {
  margin: "20px 0 12px",
}

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 22,
  lineHeight: 1.1,
  fontWeight: 950,
  letterSpacing: 0,
}

const toolListStyle: CSSProperties = {
  display: "grid",
  gap: 12,
}

const toolCardStyle: CSSProperties = {
  width: "100%",
  minHeight: 92,
  display: "grid",
  gridTemplateColumns: "62px minmax(0, 1fr) 30px",
  alignItems: "center",
  gap: 14,
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 20,
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.09), rgba(255,255,255,0.035))",
  color: "#f8fafc",
  padding: "14px 15px",
  textAlign: "left",
  boxSizing: "border-box",
  cursor: "pointer",
}

const toolIconStyle: CSSProperties = {
  width: 56,
  height: 56,
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.08)",
  fontSize: 13,
  lineHeight: 1,
  fontWeight: 950,
}

const toolTextStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 6,
}

const toolTitleStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 21,
  lineHeight: 1.1,
  fontWeight: 950,
}

const toolSubtitleStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.35,
  fontWeight: 780,
}

const arrowStyle: CSSProperties = {
  justifySelf: "end",
  fontSize: 32,
  lineHeight: 1,
  fontWeight: 900,
}
