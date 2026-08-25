// Home.tsx
import { useEffect, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabase"

const GROUP_CODE = "catchme_penghu"

type Props = {
  onAuditClick: () => void
  onHistoryClick: () => void
  onMachineClick: () => void
  onMachineProfitClick: () => void
  onProductClick: () => void
  onInboundClick: () => void
  onAdjustmentClick: () => void
  onLineBotClick: () => void
  onInventoryAuditClick: () => void
}

type ActionCard = {
  code: string
  title: string
  subtitle: string
  accent: string
  onClick: () => void
}

type DailySheetRow = Record<string, unknown>

type DashboardSummary = {
  inventoryAmount: number
  inboundAmount: number
  outboundAmount: number
  loading: boolean
  error: string
}

type SummaryTotals = Pick<
  DashboardSummary,
  "inventoryAmount" | "inboundAmount" | "outboundAmount"
>

export default function Home({
  onInventoryAuditClick,
  onProductClick,
  onInboundClick,
  onAdjustmentClick,
  onLineBotClick,
}: Props) {
  const todayText = getTaipeiDisplayDate()
  const businessDate = getBusinessDateValue()
  const isDesktop = useIsDesktop()
  const [summary, setSummary] = useState<DashboardSummary>({
    inventoryAmount: 0,
    inboundAmount: 0,
    outboundAmount: 0,
    loading: true,
    error: "",
  })

  useEffect(() => {
    loadDashboardSummary(businessDate)
  }, [businessDate])

  async function loadDashboardSummary(bizDate: string) {
    try {
      setSummary((current) => ({ ...current, loading: true, error: "" }))

      const { data, error } = await supabase.rpc("daily_sheet_rows_full", {
        p_group: GROUP_CODE,
        p_biz_date: bizDate,
      })

      if (error) throw error

      const rows = (data ?? []) as DailySheetRow[]
      const totals = rows.reduce<SummaryTotals>(
        (acc, row) => {
          acc.inventoryAmount += readNumber(
            row,
            "庫存金額",
            "end_amount",
            "stock_amount"
          )
          acc.inboundAmount += readNumber(row, "入庫金額", "in_amount")
          acc.outboundAmount += readNumber(row, "出庫金額", "out_amount")
          return acc
        },
        {
          inventoryAmount: 0,
          inboundAmount: 0,
          outboundAmount: 0,
        }
      )

      setSummary({
        ...totals,
        loading: false,
        error: "",
      })
    } catch (err) {
      console.error(err)
      setSummary({
        inventoryAmount: 0,
        inboundAmount: 0,
        outboundAmount: 0,
        loading: false,
        error: "首頁數據讀取失敗",
      })
    }
  }

  const actionCards: ActionCard[] = [
    {
      code: "PRD",
      title: "商品管理",
      subtitle: "新增 / 編輯 / 啟用",
      accent: "#66a9ff",
      onClick: onProductClick,
    },
    {
      code: "ADJ",
      title: "異動單",
      subtitle: "補入庫 / 補出庫 / 箱轉散",
      accent: "#74d6ff",
      onClick: onAdjustmentClick,
    },
    {
      code: "BOT",
      title: "LINE Bot",
      subtitle: "記錄 / 查詢 / 取消",
      accent: "#b9a7ff",
      onClick: onLineBotClick,
    },
    {
      code: "AUD",
      title: "庫存盤點",
      subtitle: "建立 / 盤點 / 審核",
      accent: "#34d399",
      onClick: onInventoryAuditClick,
    },
  ]

  return (
    <main style={getPageStyle(isDesktop)}>
      <section style={heroStyle}>
        <div style={brandBlockStyle}>
          <h1 style={storeTitleStyle}>澎湖店</h1>
          <div style={controlTitleStyle}>營運控制</div>
        </div>

        <div style={dateBlockStyle}>
          <div style={dateTextStyle}>{todayText}</div>
          <div style={bizDateStyle}>業務日：{businessDate}（05:00切日）</div>
        </div>
      </section>

      <section style={summaryCardStyle}>
        <div style={summaryGlowStyle} />
        <div style={summaryHeaderStyle}>
          <span style={summaryLabelStyle}>庫存</span>
          <span style={summaryValueStyle}>
            {summary.loading ? "--" : formatMoney(summary.inventoryAmount)}
          </span>
        </div>

        <div style={metricGridStyle}>
          <div style={metricCellStyle}>
            <span style={metricLabelStyle}>入庫</span>
            <strong style={metricValueStyle}>
              {summary.loading ? "--" : formatMoney(summary.inboundAmount)}
            </strong>
          </div>
          <div style={metricDividerStyle} />
          <div style={metricCellStyle}>
            <span style={metricLabelStyle}>出庫</span>
            <strong style={metricValueStyle}>
              {summary.loading ? "--" : formatMoney(summary.outboundAmount)}
            </strong>
          </div>
        </div>

        {summary.error && <div style={summaryErrorStyle}>{summary.error}</div>}
      </section>

      <section style={sectionHeaderStyle}>
        <h2 style={sectionTitleStyle}>快捷功能</h2>
      </section>

      <section style={getActionListStyle(isDesktop)}>
        {actionCards.map((card) => (
          <button
            key={card.code}
            style={getActionCardStyle(isDesktop)}
            onClick={card.onClick}
          >
            <span
              style={{
                ...getIconBoxStyle(isDesktop),
                borderColor: `${card.accent}55`,
                boxShadow: isDesktop ? "none" : `0 0 28px ${card.accent}1f`,
              }}
            >
              <span style={{ ...getIconCodeStyle(isDesktop), color: card.accent }}>
                {card.code}
              </span>
            </span>

            <span style={actionTextStyle}>
              <span style={getActionTitleStyle(isDesktop)}>{card.title}</span>
              <span style={getActionSubtitleStyle(isDesktop)}>
                {card.subtitle}
              </span>
            </span>

            <span style={{ ...getArrowStyle(isDesktop), color: card.accent }}>
              →
            </span>
          </button>
        ))}
      </section>

      <button style={getPrimaryCtaStyle(isDesktop)} onClick={onInboundClick}>
        <span style={getCtaIconStyle(isDesktop)}>IN</span>
        <span>入庫</span>
      </button>
    </main>
  )
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia("(min-width: 900px)").matches
  })

  useEffect(() => {
    const media = window.matchMedia("(min-width: 900px)")
    const handleChange = () => setIsDesktop(media.matches)

    handleChange()
    media.addEventListener("change", handleChange)
    return () => media.removeEventListener("change", handleChange)
  }, [])

  return isDesktop
}

function readNumber(row: DailySheetRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.-]/g, ""))
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return 0
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
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
  const hour = Number(
    taipeiParts.find((part) => part.type === "hour")?.value ?? "0"
  )

  const base = new Date(`${year}-${month}-${day}T12:00:00+08:00`)
  if (hour < 5) base.setDate(base.getDate() - 1)

  const businessYear = base.getFullYear()
  const businessMonth = String(base.getMonth() + 1).padStart(2, "0")
  const businessDay = String(base.getDate()).padStart(2, "0")

  return `${businessYear}-${businessMonth}-${businessDay}`
}

function getPageStyle(isDesktop: boolean): CSSProperties {
  return {
    ...pageStyle,
    ...(isDesktop
      ? {
          maxWidth: 980,
          margin: "0 auto",
          padding:
            "calc(env(safe-area-inset-top, 0px) + 28px) 28px calc(env(safe-area-inset-bottom, 0px) + 122px)",
        }
      : null),
  }
}

const pageStyle: CSSProperties = {
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

const heroStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
  alignItems: "end",
  marginBottom: 12,
}

const brandBlockStyle: CSSProperties = {
  display: "grid",
  gap: 4,
}

const storeTitleStyle: CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 23,
  lineHeight: 1.1,
  fontWeight: 950,
  letterSpacing: 0,
}

const controlTitleStyle: CSSProperties = {
  color: "#60a5fa",
  fontSize: 13,
  fontWeight: 800,
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
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: 22,
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.035))",
  boxShadow:
    "0 18px 44px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.11)",
  padding: "15px 18px",
  marginBottom: 22,
}

const summaryGlowStyle: CSSProperties = {
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

const summaryHeaderStyle: CSSProperties = {
  position: "relative",
  display: "flex",
  alignItems: "baseline",
  gap: 12,
  marginBottom: 12,
}

const summaryLabelStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 20,
  lineHeight: 1.1,
  fontWeight: 950,
}

const summaryValueStyle: CSSProperties = {
  color: "#60a5fa",
  fontSize: 24,
  lineHeight: 1,
  fontWeight: 950,
  textShadow: "0 0 24px rgba(96, 165, 250, 0.34)",
}

const metricGridStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "1fr 1px 1fr",
  alignItems: "center",
  gap: 14,
}

const metricCellStyle: CSSProperties = {
  display: "grid",
  gap: 6,
}

const metricLabelStyle: CSSProperties = {
  color: "#dbeafe",
  fontSize: 13,
  lineHeight: 1.2,
  fontWeight: 900,
}

const metricValueStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 20,
  lineHeight: 1,
  fontWeight: 950,
}

const metricDividerStyle: CSSProperties = {
  width: 1,
  minHeight: 36,
  background:
    "linear-gradient(180deg, transparent, rgba(148,163,184,0.42), transparent)",
}

const summaryErrorStyle: CSSProperties = {
  position: "relative",
  color: "#fca5a5",
  fontSize: 12,
  fontWeight: 800,
  marginTop: 10,
}

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  margin: "18px 0 12px",
}

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 26,
  lineHeight: 1.1,
  fontWeight: 950,
  letterSpacing: 0,
}

function getActionListStyle(isDesktop: boolean): CSSProperties {
  if (!isDesktop) return actionListStyle

  return {
    display: "grid",
    gap: 8,
    border: "1px solid rgba(148,163,184,0.18)",
    borderRadius: 16,
    overflow: "hidden",
    background: "rgba(255,255,255,0.035)",
  }
}

const actionListStyle: CSSProperties = {
  display: "grid",
  gap: 13,
}

function getActionCardStyle(isDesktop: boolean): CSSProperties {
  if (!isDesktop) return actionCardStyle

  return {
    width: "100%",
    minHeight: 62,
    display: "grid",
    gridTemplateColumns: "48px minmax(0, 1fr) 32px",
    alignItems: "center",
    gap: 12,
    border: "none",
    borderBottom: "1px solid rgba(148,163,184,0.14)",
    borderRadius: 0,
    background: "rgba(255,255,255,0.02)",
    color: "#f8fafc",
    padding: "10px 14px",
    textAlign: "left",
    boxShadow: "none",
    cursor: "pointer",
  }
}

const actionCardStyle: CSSProperties = {
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

function getIconBoxStyle(isDesktop: boolean): CSSProperties {
  if (!isDesktop) return iconBoxStyle

  return {
    width: 40,
    height: 40,
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 10,
    display: "grid",
    placeItems: "center",
    background: "rgba(255,255,255,0.055)",
  }
}

const iconBoxStyle: CSSProperties = {
  width: 58,
  height: 58,
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 16,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,255,255,0.08)",
}

function getIconCodeStyle(isDesktop: boolean): CSSProperties {
  if (!isDesktop) return iconCodeStyle

  return {
    fontSize: 11,
    lineHeight: 1,
    fontWeight: 950,
    letterSpacing: 0,
  }
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
  gap: 6,
}

function getActionTitleStyle(isDesktop: boolean): CSSProperties {
  if (!isDesktop) return actionTitleStyle

  return {
    color: "#f8fafc",
    fontSize: 17,
    lineHeight: 1.15,
    fontWeight: 950,
  }
}

const actionTitleStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 22,
  lineHeight: 1.1,
  fontWeight: 950,
}

function getActionSubtitleStyle(isDesktop: boolean): CSSProperties {
  if (!isDesktop) return actionSubtitleStyle

  return {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 1.25,
    fontWeight: 850,
  }
}

const actionSubtitleStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 14,
  lineHeight: 1.25,
  fontWeight: 850,
}

function getArrowStyle(isDesktop: boolean): CSSProperties {
  if (!isDesktop) return arrowStyle

  return {
    justifySelf: "end",
    fontSize: 24,
    lineHeight: 1,
    fontWeight: 900,
  }
}

const arrowStyle: CSSProperties = {
  justifySelf: "end",
  fontSize: 34,
  lineHeight: 1,
  fontWeight: 900,
}

function getPrimaryCtaStyle(isDesktop: boolean): CSSProperties {
  if (!isDesktop) return primaryCtaStyle

  return {
    ...primaryCtaStyle,
    left: "50%",
    right: "auto",
    width: "min(924px, calc(100vw - 56px))",
    transform: "translateX(-50%)",
  }
}

const primaryCtaStyle: CSSProperties = {
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

function getCtaIconStyle(isDesktop: boolean): CSSProperties {
  if (!isDesktop) return ctaIconStyle

  return {
    ...ctaIconStyle,
    width: 42,
    height: 42,
    borderRadius: 15,
  }
}

const ctaIconStyle: CSSProperties = {
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
