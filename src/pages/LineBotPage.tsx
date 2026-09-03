import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabase"
import {
  getWarehouseName,
  loadAllWarehouseKinds,
  type WarehouseKind,
} from "../lib/warehouses"

type Props = {
  onBack: () => void
}

type LedgerRow = {
  id: number
  group_code: string
  warehouse_code: string
  product_sku: string
  in_box: number
  in_piece: number
  out_box: number
  out_piece: number
  unit_cost_piece: number | null
  in_amount: number | null
  out_amount: number | null
  source: string
  created_at: string
  void_of_id: number | null
  voided_by_id: number | null
}

type ProductInfo = {
  product_sku: string
  product_name: string | null
  units_per_box: number | null
}

type MovementProbe = {
  id: number
  product_sku: string
  warehouse_code: string
  created_at: string
}

type ProductMap = Record<string, ProductInfo>
type FollowingMap = Record<number, boolean>

const GROUP_CODE = "catchme_penghu"
const VOIDABLE_SOURCES = ["app_inbound", "APP_INBOUND", "line_outbound", "LINE_OUTBOUND"]

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return false
    return window.matchMedia("(min-width: 900px)").matches
  })

  useEffect(() => {
    if (typeof window === "undefined") return

    const query = window.matchMedia("(min-width: 900px)")
    const update = () => setIsDesktop(query.matches)

    update()
    query.addEventListener("change", update)

    return () => query.removeEventListener("change", update)
  }, [])

  return isDesktop
}

export default function LineBotPage({ onBack }: Props) {
  const isDesktop = useIsDesktop()
  const [businessDate, setBusinessDate] = useState(() => getBusinessDateText())
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [products, setProducts] = useState<ProductMap>({})
  const [warehouseKinds, setWarehouseKinds] = useState<WarehouseKind[]>([])
  const [followingMap, setFollowingMap] = useState<FollowingMap>({})
  const [loading, setLoading] = useState(false)
  const [voidingId, setVoidingId] = useState<number | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    void loadWarehouseKinds()
    void loadRecords()
  }, [])

  const todayBusinessDate = getBusinessDateText()

  const filteredRows = useMemo(() => {
    return rows
  }, [rows])

  const summary = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        if (row.voided_by_id) {
          acc.voided += 1
        } else if (getDirection(row) === "in") {
          acc.inbound += 1
        } else {
          acc.outbound += 1
        }
        return acc
      },
      { inbound: 0, outbound: 0, voided: 0 }
    )
  }, [filteredRows])

  async function loadRecords(nextBusinessDate = businessDate) {
    try {
      setLoading(true)
      setError("")
      setMessage("")

      const { start, end } = getBusinessDateRange(nextBusinessDate)
      const { data, error: ledgerError } = await supabase
        .from("inventory_ledger")
        .select(
          "id,group_code,warehouse_code,product_sku,in_box,in_piece,out_box,out_piece,unit_cost_piece,in_amount,out_amount,source,created_at,void_of_id,voided_by_id"
        )
        .eq("group_code", GROUP_CODE)
        .in("source", VOIDABLE_SOURCES)
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: false })
        .limit(160)

      if (ledgerError) throw ledgerError

      const nextRows = (data ?? []) as LedgerRow[]
      setRows(nextRows)
      await loadProducts(nextRows)
      await loadFollowingMovementMap(nextRows)
    } catch (err) {
      console.error(err)
      setRows([])
      setProducts({})
      setFollowingMap({})
      setError(err instanceof Error ? err.message : "讀取交易紀錄失敗")
    } finally {
      setLoading(false)
    }
  }

  async function loadWarehouseKinds() {
    const rows = await loadAllWarehouseKinds(supabase)
    setWarehouseKinds(rows)
  }

  function handleBusinessDateChange(value: string) {
    setBusinessDate(value)
  }

  async function loadProducts(nextRows: LedgerRow[]) {
    const skus = Array.from(new Set(nextRows.map((row) => row.product_sku))).filter(Boolean)

    if (skus.length === 0) {
      setProducts({})
      return
    }

    const { data, error: productError } = await supabase
      .from("products")
      .select("product_sku,product_name,units_per_box")
      .in("product_sku", skus)

    if (productError) throw productError

    const nextProducts = ((data ?? []) as ProductInfo[]).reduce<ProductMap>(
      (acc, row) => {
        acc[row.product_sku] = row
        return acc
      },
      {}
    )

    setProducts(nextProducts)
  }

  async function loadFollowingMovementMap(nextRows: LedgerRow[]) {
    if (nextRows.length === 0) {
      setFollowingMap({})
      return
    }

    const skus = Array.from(new Set(nextRows.map((row) => row.product_sku))).filter(Boolean)
    const warehouses = Array.from(
      new Set(nextRows.map((row) => row.warehouse_code))
    ).filter(Boolean)
    const earliestCreatedAt = nextRows.reduce((earliest, row) => {
      return row.created_at < earliest ? row.created_at : earliest
    }, nextRows[0].created_at)

    const { data, error: movementError } = await supabase
      .from("inventory_ledger")
      .select("id,product_sku,warehouse_code,created_at")
      .eq("group_code", GROUP_CODE)
      .in("product_sku", skus)
      .in("warehouse_code", warehouses)
      .gte("created_at", earliestCreatedAt)
      .order("created_at", { ascending: true })
      .limit(1200)

    if (movementError) throw movementError

    const movements = (data ?? []) as MovementProbe[]
    const nextMap = nextRows.reduce<FollowingMap>((acc, row) => {
      acc[row.id] = movements.some((movement) => {
        if (movement.product_sku !== row.product_sku) return false
        if (movement.warehouse_code !== row.warehouse_code) return false
        return (
          movement.created_at > row.created_at ||
          (movement.created_at === row.created_at && movement.id > row.id)
        )
      })
      return acc
    }, {})

    setFollowingMap(nextMap)
  }

  function getVoidState(row: LedgerRow) {
    if (row.voided_by_id) return { canVoid: false, label: "已作廢", tone: "muted" }
    if (!VOIDABLE_SOURCES.includes(row.source)) {
      return { canVoid: false, label: "不可作廢", tone: "muted" }
    }
    if (getLedgerBusinessDate(row.created_at) !== todayBusinessDate) {
      return { canVoid: false, label: "非今日", tone: "muted" }
    }
    if (followingMap[row.id]) return { canVoid: false, label: "有後續", tone: "muted" }
    return { canVoid: true, label: "作廢", tone: "danger" }
  }

  async function voidTransaction(row: LedgerRow) {
    const state = getVoidState(row)
    if (!state.canVoid) return

    const directionLabel = getDirection(row) === "in" ? "入庫" : "出庫"
    const ok = window.confirm(
      `確定作廢 #${row.id} ${row.product_sku} 的${directionLabel}紀錄？\n系統會建立 tx_void 回沖庫存。`
    )
    if (!ok) return

    try {
      setVoidingId(row.id)
      setError("")
      setMessage("")

      const { error: voidError } = await supabase.rpc("rpc_tx_void", {
        p_group: GROUP_CODE,
        p_ledger_id: row.id,
        p_actor: "app_transaction_page",
      })

      if (voidError) throw voidError

      setMessage(`已作廢交易 #${row.id}`)
      await loadRecords()
    } catch (err) {
      console.error(err)
      setError(formatVoidError(err))
    } finally {
      setVoidingId(null)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={{ ...contentStyle, ...(isDesktop ? desktopContentStyle : {}) }}>
        <header style={topBarStyle}>
          <button onClick={onBack} style={topIconButtonStyle} aria-label="返回">
            ←
          </button>
          <h1 style={pageTitleStyle}>交易紀錄</h1>
          <button
            onClick={() => void loadRecords()}
            style={topIconButtonStyle}
            aria-label="重新整理"
            disabled={loading}
          >
            ↻
          </button>
        </header>

        {message && <div style={messageStyle}>{message}</div>}
        {error && <div style={errorStyle}>{error}</div>}

        <section style={filterPanelStyle}>
          <input
            aria-label="日期"
            value={businessDate}
            onChange={(event) => handleBusinessDateChange(event.target.value)}
            type="date"
            style={{ ...inputStyle, ...dateInputStyle }}
          />

          <button
            onClick={() => void loadRecords(businessDate)}
            style={searchButtonStyle}
            aria-label="查詢"
            disabled={loading}
          >
            🔍
          </button>

          {loading && <div style={loadingHintStyle}>查詢中...</div>}
        </section>

        <div style={summaryRowStyle}>
          <span>入庫 {summary.inbound}</span>
          <span>出庫 {summary.outbound}</span>
          <span>已作廢 {summary.voided}</span>
          <span>{filteredRows.length} 筆</span>
        </div>

        {loading && <div style={emptyStyle}>讀取交易紀錄中...</div>}

        {!loading && filteredRows.length === 0 && (
          <div style={emptyStyle}>目前沒有符合條件的交易紀錄</div>
        )}

        {!loading && filteredRows.length > 0 && (
          <section style={{ ...recordListStyle, ...(isDesktop ? desktopRecordListStyle : {}) }}>
            {isDesktop && (
              <div style={desktopListHeaderStyle}>
                <span>類型</span>
                <span>時間</span>
                <span>倉庫</span>
                <span>SKU</span>
                <span>品名</span>
                <span>箱</span>
                <span>散</span>
                <span>金額</span>
                <span>操作</span>
              </div>
            )}

            {filteredRows.map((row) => {
              const product = products[row.product_sku]
              const direction = getDirection(row)
              const qtyBox = direction === "in" ? row.in_box : row.out_box
              const qtyPiece = direction === "in" ? row.in_piece : row.out_piece
              const amount = getDisplayAmount(row, product)
              const voidState = getVoidState(row)

              return (
                <article
                  key={row.id}
                  style={{ ...recordCardStyle, ...(isDesktop ? desktopRecordCardStyle : {}) }}
                >
                  {isDesktop ? (
                    <>
                      <span
                        style={direction === "in" ? inboundMarkStyle : outboundMarkStyle}
                      >
                        {direction === "in" ? "入" : "出"}
                      </span>
                      <span style={topMetaStyle}>
                        {formatTaipeiShort(row.created_at)}
                      </span>
                      <span style={topMetaStyle}>
                        {getWarehouseName(row.warehouse_code, warehouseKinds)}
                      </span>
                      <span style={desktopSkuStyle}>{row.product_sku}</span>
                      <span style={desktopNameStyle}>
                        {product?.product_name || "未命名商品"}
                      </span>
                      <span style={desktopQtyValueStyle}>{formatQty(qtyBox)}</span>
                      <span style={desktopQtyValueStyle}>{formatQty(qtyPiece)}</span>
                      <span style={amountStyle}>$ {formatMoney(amount)}</span>
                      {voidState.canVoid ? (
                        <button
                          disabled={voidingId === row.id}
                          onClick={() => void voidTransaction(row)}
                          style={voidButtonStyle}
                        >
                          {voidingId === row.id ? "處理中" : "作廢"}
                        </button>
                      ) : (
                        <span style={disabledVoidStyle}>{voidState.label}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={cardTopStyle}>
                        <span
                          style={direction === "in" ? inboundMarkStyle : outboundMarkStyle}
                        >
                          {direction === "in" ? "入" : "出"}
                        </span>

                        <span style={topMetaStyle}>
                          {formatTaipeiShort(row.created_at)}
                        </span>
                        <span style={topMetaStyle}>
                          {getWarehouseName(row.warehouse_code, warehouseKinds)}
                        </span>
                        <span style={amountStyle}>$ {formatMoney(amount)}</span>

                        {voidState.canVoid ? (
                          <button
                            disabled={voidingId === row.id}
                            onClick={() => void voidTransaction(row)}
                            style={voidButtonStyle}
                          >
                            {voidingId === row.id ? "處理中" : "作廢"}
                          </button>
                        ) : (
                          <span style={disabledVoidStyle}>{voidState.label}</span>
                        )}
                      </div>

                      <div style={skuStyle}>{row.product_sku}</div>
                      <div style={nameStyle}>
                        {product?.product_name || "未命名商品"}
                      </div>

                      <div style={cardBottomStyle}>
                        <div style={qtyBoxStyle}>
                          <span style={qtyLabelStyle}>箱</span>
                          <strong style={qtyValueStyle}>{formatQty(qtyBox)}</strong>
                        </div>
                        <div style={qtyBoxStyle}>
                          <span style={qtyLabelStyle}>散</span>
                          <strong style={qtyValueStyle}>{formatQty(qtyPiece)}</strong>
                        </div>
                        <div style={idStyle}>#{row.id}</div>
                      </div>

                      {row.voided_by_id && (
                        <div style={voidInfoStyle}>作廢回沖紀錄：#{row.voided_by_id}</div>
                      )}

                      {!row.voided_by_id && !voidState.canVoid && (
                        <div style={voidInfoStyle}>{getDisabledReason(voidState.label)}</div>
                      )}
                    </>
                  )}
                </article>
              )
            })}
          </section>
        )}
      </div>
    </div>
  )
}

function getDirection(row: LedgerRow) {
  const hasIn = Number(row.in_box ?? 0) > 0 || Number(row.in_piece ?? 0) > 0
  return hasIn ? "in" : "out"
}

function getDisplayAmount(row: LedgerRow, product?: ProductInfo) {
  const direction = getDirection(row)
  const storedAmount = direction === "in" ? row.in_amount : row.out_amount

  if (storedAmount !== null && storedAmount !== undefined && Number(storedAmount) > 0) {
    return Number(storedAmount)
  }

  const unitsPerBox = Number(product?.units_per_box ?? 1) || 1
  const boxQty = direction === "in" ? Number(row.in_box ?? 0) : Number(row.out_box ?? 0)
  const pieceQty = direction === "in" ? Number(row.in_piece ?? 0) : Number(row.out_piece ?? 0)
  const unitCost = Number(row.unit_cost_piece ?? 0)

  return ((boxQty * unitsPerBox) + pieceQty) * unitCost
}

function getDisabledReason(label: string) {
  if (label === "非今日") return "只允許作廢今日業務日的交易"
  if (label === "有後續") return "同商品同倉庫後面已有異動，不能直接作廢"
  if (label === "已作廢") return "此交易已經作廢過"
  return "此交易不可作廢"
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
  const hour = Number(taipeiParts.find((part) => part.type === "hour")?.value ?? "0")

  const base = new Date(`${year}-${month}-${day}T12:00:00+08:00`)
  if (hour < 5) base.setDate(base.getDate() - 1)

  return formatDateInput(base)
}

function getBusinessDateRange(dateText: string) {
  const start = `${dateText}T05:00:00+08:00`
  const endDate = new Date(`${dateText}T12:00:00+08:00`)
  endDate.setDate(endDate.getDate() + 1)

  return {
    start,
    end: `${formatDateInput(endDate)}T05:00:00+08:00`,
  }
}

function getLedgerBusinessDate(createdAt: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(createdAt))

  const year = parts.find((part) => part.type === "year")?.value ?? ""
  const month = parts.find((part) => part.type === "month")?.value ?? ""
  const day = parts.find((part) => part.type === "day")?.value ?? ""
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0")

  const base = new Date(`${year}-${month}-${day}T12:00:00+08:00`)
  if (hour < 5) base.setDate(base.getDate() - 1)

  return formatDateInput(base)
}

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatTaipeiShort(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function formatQty(value: number | null | undefined) {
  const numberValue = Number(value ?? 0)
  return Number.isInteger(numberValue) ? String(numberValue) : String(numberValue)
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "-"
  return Number(value).toLocaleString("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}


function formatVoidError(err: unknown) {
  const message = err instanceof Error ? err.message : "作廢失敗"

  if (message.includes("TX_NOT_FOUND")) return "找不到這筆交易"
  if (message.includes("TX_IS_VOID_ALREADY")) return "作廢紀錄本身不能再作廢"
  if (message.includes("TX_ALREADY_VOIDED")) return "這筆交易已經作廢過"
  if (message.includes("TX_SOURCE_NOT_ALLOWED")) return "這筆不是可作廢的入庫或 LINE 出庫"
  if (message.includes("TX_NOT_TODAY_BIZDAY")) return "只能作廢今日業務日的交易"
  if (message.includes("TX_HAS_AFTER_MOVEMENTS")) {
    return "同商品同倉庫後面已有其他異動，不能直接作廢這筆"
  }
  if (message.includes("INSUFFICIENT_BOX_FOR_VOID")) return "庫存箱數不足，不能作廢"
  if (message.includes("INSUFFICIENT_PIECE_FOR_VOID")) return "庫存散數不足，不能作廢"

  return message
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "#0f0f0f",
  color: "#fff",
  padding: "calc(env(safe-area-inset-top, 0px) + 12px) 14px 22px",
  boxSizing: "border-box",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const contentStyle: CSSProperties = {
  width: "100%",
  maxWidth: 620,
  margin: "0 auto",
}

const desktopContentStyle: CSSProperties = {
  maxWidth: 1120,
}

const topBarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "52px minmax(0, 1fr) 52px",
  alignItems: "center",
  gap: 12,
  marginBottom: 14,
}

const topIconButtonStyle: CSSProperties = {
  width: 52,
  height: 44,
  border: "none",
  borderRadius: 0,
  background: "transparent",
  color: "#fff",
  fontSize: 40,
  lineHeight: 1,
}

const pageTitleStyle: CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 26,
  fontWeight: 900,
  textAlign: "center",
}

const filterPanelStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 48px",
  gap: 10,
  padding: "0 0 8px",
  marginBottom: 8,
}

const inputStyle: CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 12,
  border: "1px solid #3c3c3c",
  background: "#242424",
  color: "#fff",
  fontSize: 14,
  padding: "0 10px",
  boxSizing: "border-box",
}

const dateInputStyle: CSSProperties = {
  textAlign: "center",
  fontWeight: 800,
}

const searchButtonStyle: CSSProperties = {
  width: 48,
  height: 44,
  border: "none",
  borderRadius: 12,
  background: "#fff",
  color: "#111",
  fontSize: 18,
  display: "grid",
  placeItems: "center",
}

const loadingHintStyle: CSSProperties = {
  gridColumn: "1 / -1",
  width: "100%",
  color: "#9dccff",
  fontSize: 12,
  fontWeight: 800,
  textAlign: "center",
}

const summaryRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 7,
  color: "#aaa",
  fontSize: 12,
  fontWeight: 800,
  margin: "0 2px 10px",
}

const recordListStyle: CSSProperties = {
  display: "grid",
  gap: 7,
}

const desktopRecordListStyle: CSSProperties = {
  gap: 0,
  border: "1px solid #333",
  borderRadius: 16,
  overflow: "hidden",
  background: "#151515",
}

const desktopListHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "54px 112px 82px 142px minmax(0, 1fr) 64px 64px 106px 90px",
  alignItems: "center",
  gap: 10,
  minHeight: 40,
  padding: "0 14px",
  borderBottom: "1px solid #303030",
  background: "#111",
  color: "#999",
  fontSize: 12,
  fontWeight: 900,
}

const recordCardStyle: CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  background: "#171717",
  padding: 8,
}

const desktopRecordCardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "54px 112px 82px 142px minmax(0, 1fr) 64px 64px 106px 90px",
  alignItems: "center",
  gap: 10,
  minHeight: 56,
  border: "none",
  borderBottom: "1px solid #2b2b2b",
  borderRadius: 0,
  background: "#1a1a1a",
  padding: "8px 14px",
}

const cardTopStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "34px minmax(60px, auto) minmax(42px, auto) minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 6,
  marginBottom: 7,
}

const inboundMarkStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  width: 28,
  height: 28,
  borderRadius: 999,
  background: "rgba(90,162,255,0.18)",
  color: "#9dccff",
  border: "1px solid rgba(90,162,255,0.34)",
  fontSize: 13,
  fontWeight: 900,
}

const outboundMarkStyle: CSSProperties = {
  ...inboundMarkStyle,
  background: "rgba(248,113,113,0.18)",
  color: "#fecaca",
  border: "1px solid rgba(248,113,113,0.34)",
}

const topMetaStyle: CSSProperties = {
  color: "#d5d5d5",
  fontSize: 12,
  fontWeight: 900,
  whiteSpace: "nowrap",
}

const amountStyle: CSSProperties = {
  color: "#e5e5e5",
  fontSize: 13,
  fontWeight: 950,
  textAlign: "right",
  whiteSpace: "nowrap",
}

const voidButtonStyle: CSSProperties = {
  minWidth: 48,
  height: 30,
  border: "none",
  borderRadius: 10,
  background: "#ef4444",
  color: "#fff",
  fontSize: 13,
  fontWeight: 900,
}

const disabledVoidStyle: CSSProperties = {
  minWidth: 48,
  minHeight: 30,
  display: "grid",
  placeItems: "center",
  borderRadius: 10,
  background: "#2a2a2a",
  color: "#8e8e8e",
  fontSize: 12,
  fontWeight: 900,
  padding: "0 7px",
  boxSizing: "border-box",
}

const skuStyle: CSSProperties = {
  color: "#fff",
  fontSize: 16,
  fontWeight: 950,
  overflowWrap: "anywhere",
}

const desktopSkuStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 850,
}

const nameStyle: CSSProperties = {
  color: "#ddd",
  fontSize: 13,
  fontWeight: 850,
  marginTop: 3,
  overflowWrap: "anywhere",
}

const desktopNameStyle: CSSProperties = {
  marginTop: 0,
  color: "#f4f4f5",
  fontSize: 13,
}

const cardBottomStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
  gap: 6,
  alignItems: "end",
  marginTop: 7,
}

const qtyBoxStyle: CSSProperties = {
  border: "1px solid #2e2e2e",
  borderRadius: 10,
  background: "#111",
  padding: "6px 8px",
  minWidth: 0,
}

const qtyLabelStyle: CSSProperties = {
  color: "#bbb",
  fontSize: 11,
  fontWeight: 850,
  marginRight: 8,
}

const qtyValueStyle: CSSProperties = {
  color: "#fff",
  fontSize: 16,
  fontWeight: 950,
}

const desktopQtyValueStyle: CSSProperties = {
  color: "#e5e7eb",
  fontSize: 13,
  fontWeight: 850,
}

const idStyle: CSSProperties = {
  color: "#aaa",
  fontSize: 12,
  fontWeight: 900,
  paddingBottom: 7,
}

const voidInfoStyle: CSSProperties = {
  borderRadius: 10,
  background: "rgba(148,163,184,0.1)",
  color: "#aaa",
  padding: 8,
  fontSize: 12,
  marginTop: 8,
}

const emptyStyle: CSSProperties = {
  border: "1px solid #333",
  borderRadius: 16,
  background: "#171717",
  color: "#999",
  padding: 16,
  fontSize: 14,
}

const messageStyle: CSSProperties = {
  background: "rgba(90,162,255,0.12)",
  color: "#bfdbfe",
  border: "1px solid rgba(90,162,255,0.28)",
  borderRadius: 12,
  padding: 12,
  marginBottom: 12,
  fontSize: 14,
}

const errorStyle: CSSProperties = {
  background: "rgba(248,113,113,0.12)",
  color: "#ff6666",
  border: "1px solid rgba(248,113,113,0.28)",
  borderRadius: 12,
  padding: 12,
  marginBottom: 12,
  fontSize: 14,
}
