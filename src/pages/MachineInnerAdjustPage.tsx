// MachineInnerAdjustPage.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabase"

const GROUP_CODE = "catchme_penghu"

type Props = {
  onBack: () => void
}

type LifecycleRow = {
  id: number
  machine_no: string
  product_sku: string
  initial_inner_qty: number
  mounted_biz_date: string
  removed_biz_date: string | null
}

type ProductRow = {
  product_sku: string
  product_name: string
  units_per_box: number
}

type DailyRow = {
  lifecycle_id: number
  theoretical_inner_qty: number | null
  theoretical_ground_qty: number | null
  theoretical_qty: number | null
}

type AdjustItem = {
  lifecycle_id: number
  machine_no: string
  product_sku: string
  product_name: string
  units_per_box: number
  initial_inner_qty: number
  theoretical_inner_qty: number | null
  theoretical_ground_qty: number | null
  theoretical_qty: number | null
}

export default function MachineInnerAdjustPage({ onBack }: Props) {
  const [bizDate, setBizDate] = useState(getBusinessDateValue())
  const [items, setItems] = useState<AdjustItem[]>([])
  const [selectedMachineNo, setSelectedMachineNo] = useState("")
  const [search, setSearch] = useState("")
  const [selectedItem, setSelectedItem] = useState<AdjustItem | null>(null)
  const [correctedInnerQty, setCorrectedInnerQty] = useState("")
  const [note, setNote] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const affectedStartDate = addDays(bizDate, 1)

  const machineNos = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.machine_no))).sort(
      compareMachineNo
    )
  }, [items])

  const selectedMachineItems = useMemo(() => {
    return items.filter((item) => item.machine_no === selectedMachineNo)
  }, [items, selectedMachineNo])

  const selectedMachineSummary = useMemo(() => {
    return selectedMachineItems.reduce(
      (acc, item) => {
        acc.innerQty += item.theoretical_inner_qty ?? 0
        acc.groundQty += item.theoretical_ground_qty ?? 0
        acc.totalQty += item.theoretical_qty ?? 0
        return acc
      },
      {
        innerQty: 0,
        groundQty: 0,
        totalQty: 0,
      }
    )
  }, [selectedMachineItems])

  const filteredItems = useMemo(() => {
    const keyword = search.trim().toLowerCase()

    return items
      .filter((item) => item.machine_no === selectedMachineNo)
      .filter((item) => {
        if (!keyword) return true

        return (
          item.product_sku.toLowerCase().includes(keyword) ||
          item.product_name.toLowerCase().includes(keyword)
        )
      })
      .slice(0, 30)
  }, [items, search, selectedMachineNo])

  useEffect(() => {
    loadItems()
  }, [bizDate])

  async function loadItems() {
    try {
      setLoading(true)
      setError("")
      setMessage("")
      setSelectedItem(null)
      setCorrectedInnerQty("")

      const { data: lifecycleData, error: lifecycleError } = await supabase
        .from("machine_lifecycles")
        .select(
          "id,machine_no,product_sku,initial_inner_qty,mounted_biz_date,removed_biz_date"
        )
        .eq("group_code", GROUP_CODE)
        .lte("mounted_biz_date", bizDate)
        .or(`removed_biz_date.is.null,removed_biz_date.gte.${bizDate}`)
        .order("machine_no", { ascending: true })
        .order("product_sku", { ascending: true })

      if (lifecycleError) throw lifecycleError

      const lifecycles = ((lifecycleData ?? []) as LifecycleRow[]).map(
        (row) => ({
          ...row,
          product_sku: row.product_sku.toLowerCase(),
          initial_inner_qty: Number(row.initial_inner_qty ?? 0),
        })
      )

      const skuList = Array.from(
        new Set(lifecycles.map((row) => row.product_sku))
      )
      const lifecycleIds = lifecycles.map((row) => row.id)

      let productMap = new Map<string, ProductRow>()
      let dailyMap = new Map<number, DailyRow>()

      if (skuList.length > 0) {
        const { data: productData, error: productError } = await supabase
          .from("products")
          .select("product_sku,product_name,units_per_box")
          .in("product_sku", skuList)

        if (productError) throw productError

        productMap = new Map(
          ((productData ?? []) as ProductRow[]).map((product) => [
            product.product_sku.toLowerCase(),
            {
              ...product,
              product_sku: product.product_sku.toLowerCase(),
              units_per_box: Number(product.units_per_box ?? 1),
            },
          ])
        )
      }

      if (lifecycleIds.length > 0) {
        const { data: dailyData, error: dailyError } = await supabase
          .from("machine_lifecycle_daily")
          .select(
            "lifecycle_id,theoretical_inner_qty,theoretical_ground_qty,theoretical_qty"
          )
          .eq("biz_date", bizDate)
          .in("lifecycle_id", lifecycleIds)

        if (dailyError) throw dailyError

        dailyMap = new Map(
          ((dailyData ?? []) as DailyRow[]).map((row) => [
            Number(row.lifecycle_id),
            {
              lifecycle_id: Number(row.lifecycle_id),
              theoretical_inner_qty: toNullableNumber(
                row.theoretical_inner_qty
              ),
              theoretical_ground_qty: toNullableNumber(
                row.theoretical_ground_qty
              ),
              theoretical_qty: toNullableNumber(row.theoretical_qty),
            },
          ])
        )
      }

      const merged = lifecycles.map((lifecycle) => {
        const product = productMap.get(lifecycle.product_sku)
        const daily = dailyMap.get(lifecycle.id)

        return {
          lifecycle_id: lifecycle.id,
          machine_no: lifecycle.machine_no,
          product_sku: lifecycle.product_sku,
          product_name: product?.product_name ?? lifecycle.product_sku,
          units_per_box: product?.units_per_box ?? 1,
          initial_inner_qty: lifecycle.initial_inner_qty,
          theoretical_inner_qty: daily?.theoretical_inner_qty ?? null,
          theoretical_ground_qty: daily?.theoretical_ground_qty ?? null,
          theoretical_qty: daily?.theoretical_qty ?? null,
        }
      })

      setItems(merged)

      const nextMachineNos = Array.from(
        new Set(merged.map((item) => item.machine_no))
      ).sort(compareMachineNo)

      setSelectedMachineNo((current) =>
        nextMachineNos.includes(current) ? current : nextMachineNos[0] ?? ""
      )
    } catch (err) {
      console.error(err)
      setError(getErrorMessage(err, "讀取機台品項失敗"))
    } finally {
      setLoading(false)
    }
  }

  function selectItem(item: AdjustItem) {
    setSelectedItem(item)
    setSearch(`${item.product_sku} ${item.product_name}`)
    setCorrectedInnerQty(
      String(item.theoretical_inner_qty ?? item.initial_inner_qty ?? 0)
    )
    setMessage("")
    setError("")
  }

  async function submitAdjustment() {
    if (!selectedItem) {
      setError("請先選擇要校正的商品")
      return
    }

    const qty = Number(correctedInnerQty)

    if (!Number.isInteger(qty) || qty < 0) {
      setError("台內數量請輸入 0 以上的整數")
      return
    }

    try {
      setSaving(true)
      setError("")
      setMessage("")

      const { error: saveError } = await supabase.rpc(
        "rpc_machine_inner_adjustment_upsert_v1",
        {
          p_group: GROUP_CODE,
          p_biz_date: bizDate,
          p_machine_no: selectedItem.machine_no,
          p_sku: selectedItem.product_sku,
          p_corrected_inner_qty: qty,
          p_note: note.trim() || null,
          p_created_by: "webapp",
        }
      )

      if (saveError) throw saveError

      const { error: rebuildError } = await supabase.rpc(
        "rebuild_machine_lifecycle_daily_v1",
        {
          p_group: GROUP_CODE,
          p_start_date: bizDate,
          p_end_date: affectedStartDate,
        }
      )

      if (rebuildError) {
        setMessage(`已儲存 ${bizDate} 結束台內校正，但 Supabase 日結更新失敗`)
        setError(rebuildError.message)
        return
      }

      setMessage(
        `已儲存 ${bizDate} 結束台內校正，Supabase 日結已更新至 ${affectedStartDate}`
      )
      await loadItems()
    } catch (err) {
      console.error(err)
      setError(getErrorMessage(err, "校正失敗"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={topBarStyle}>
        <button onClick={onBack} style={backButtonStyle}>
          ‹
        </button>

        <div style={titleBlockStyle}>
          <h1 style={titleStyle}>台內校正</h1>
          <div style={subTitleStyle}>機台日結數量</div>
        </div>

        <button onClick={loadItems} disabled={loading} style={refreshButtonStyle}>
          更新
        </button>
      </div>

      {message && <div style={messageStyle}>{message}</div>}
      {error && <div style={errorStyle}>{error}</div>}

      <section style={panelStyle}>
        <label style={labelStyle}>校正日期（該日結束後）</label>
        <input
          type="date"
          value={bizDate}
          onChange={(event) => setBizDate(event.target.value)}
          style={inputStyle}
        />

        <div style={rebuildInfoStyle}>
          <div style={rebuildInfoRowStyle}>
            <span>寫入</span>
            <strong>{bizDate} 結束台內</strong>
          </div>
          <div style={rebuildInfoRowStyle}>
            <span>更新</span>
            <strong>
              Supabase {bizDate} ～ {affectedStartDate}
            </strong>
          </div>
          <div style={rebuildInfoRowStyle}>
            <span>影響</span>
            <strong>{affectedStartDate} 起的損益 F 欄</strong>
          </div>
        </div>

        <label style={labelStyle}>機台</label>
        <select
          value={selectedMachineNo}
          onChange={(event) => {
            setSelectedMachineNo(event.target.value)
            setSelectedItem(null)
            setSearch("")
            setCorrectedInnerQty("")
          }}
          style={selectStyle}
          disabled={loading || machineNos.length === 0}
        >
          {machineNos.map((machineNo) => (
            <option key={machineNo} value={machineNo}>
              {machineNo}
            </option>
          ))}
        </select>

        <label style={labelStyle}>搜尋商品</label>
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setSelectedItem(null)
            setCorrectedInnerQty("")
          }}
          placeholder="SKU / 品名"
          style={inputStyle}
        />
      </section>

      {!loading && selectedMachineNo && (
        <section style={machineSummaryStyle}>
          <div style={machineSummaryHeaderStyle}>
            <span style={machineSummaryTitleStyle}>
              機台 {selectedMachineNo}
            </span>
            <span style={machineSummaryCountStyle}>
              {selectedMachineItems.length} 項
            </span>
          </div>

          <div style={summaryStatGridStyle}>
            <div style={summaryStatStyle}>
              <span>台內</span>
              <strong>{selectedMachineSummary.innerQty}</strong>
            </div>
            <div style={summaryStatStyle}>
              <span>台頂</span>
              <strong>{selectedMachineSummary.groundQty}</strong>
            </div>
            <div style={summaryStatStyle}>
              <span>合計</span>
              <strong>{selectedMachineSummary.totalQty}</strong>
            </div>
          </div>
        </section>
      )}

      {loading && <p style={mutedStyle}>載入中...</p>}

      {!loading && filteredItems.length > 0 && !selectedItem && (
        <section style={resultListStyle}>
          {filteredItems.map((item) => (
            <button
              key={item.lifecycle_id}
              onClick={() => selectItem(item)}
              style={resultCardStyle}
            >
              <span style={resultMainStyle}>
                <strong style={skuStyle}>{item.product_sku}</strong>
                <span style={nameStyle}>{item.product_name}</span>
              </span>

              <span style={resultMetaStyle}>
                台內 {displayQty(item.theoretical_inner_qty)} / 台頂{" "}
                {displayQty(item.theoretical_ground_qty)}
              </span>
            </button>
          ))}
        </section>
      )}

      {!loading && filteredItems.length === 0 && (
        <p style={mutedStyle}>沒有符合的機台商品</p>
      )}

      {selectedItem && (
        <section style={detailCardStyle}>
          <div style={detailHeaderStyle}>
            <div>
              <div style={skuStyle}>{selectedItem.product_sku}</div>
              <div style={detailNameStyle}>{selectedItem.product_name}</div>
            </div>

            <button
              onClick={() => {
                setSelectedItem(null)
                setCorrectedInnerQty("")
              }}
              style={clearButtonStyle}
            >
              更換
            </button>
          </div>

          <div style={statGridStyle}>
            <div style={statBoxStyle}>
              <span style={statLabelStyle}>標準台內</span>
              <strong style={statValueStyle}>
                {selectedItem.initial_inner_qty}
              </strong>
            </div>
            <div style={statBoxStyle}>
              <span style={statLabelStyle}>目前台內</span>
              <strong style={statValueStyle}>
                {displayQty(selectedItem.theoretical_inner_qty)}
              </strong>
            </div>
            <div style={statBoxStyle}>
              <span style={statLabelStyle}>目前台頂</span>
              <strong style={statValueStyle}>
                {displayQty(selectedItem.theoretical_ground_qty)}
              </strong>
            </div>
            <div style={statBoxStyle}>
              <span style={statLabelStyle}>合計</span>
              <strong style={statValueStyle}>
                {displayQty(selectedItem.theoretical_qty)}
              </strong>
            </div>
          </div>

          <label style={labelStyle}>校正後台內數量</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={correctedInnerQty}
            onChange={(event) => setCorrectedInnerQty(event.target.value)}
            style={inputStyle}
          />

          <label style={labelStyle}>備註</label>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="可留空"
            style={inputStyle}
          />

          <button
            onClick={submitAdjustment}
            disabled={saving}
            style={{
              ...submitButtonStyle,
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "更新中..." : "儲存並更新日結"}
          </button>

          <div style={detailHintStyle}>
            送出後會寫入 {bizDate} 結束後台內數量，並更新 Supabase {bizDate} 到{" "}
            {affectedStartDate}；試算表仍需另外重建。
          </div>
        </section>
      )}
    </div>
  )
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function displayQty(value: number | null) {
  return value === null ? "-" : value.toLocaleString("zh-TW")
}

function compareMachineNo(a: string, b: string) {
  const aNumber = Number(a)
  const bNumber = Number(b)

  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
    return aNumber - bNumber
  }

  return a.localeCompare(b, "zh-TW")
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === "string") return message
  }
  return fallback
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

function addDays(dateText: string, days: number) {
  const date = new Date(`${dateText}T12:00:00+08:00`)
  date.setDate(date.getDate() + days)

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
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
  gridTemplateColumns: "48px minmax(0, 1fr) 54px",
  alignItems: "center",
  borderBottom: "1px solid #111827",
  minWidth: 0,
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

const refreshButtonStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#60a5fa",
  fontSize: 14,
  fontWeight: 800,
  lineHeight: 1.2,
  padding: 0,
  minHeight: 44,
  cursor: "pointer",
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

const panelStyle: CSSProperties = {
  background: "#101827",
  border: "1px solid #273244",
  borderRadius: 18,
  padding: 14,
  display: "grid",
  gap: 9,
  boxSizing: "border-box",
}

const rebuildInfoStyle: CSSProperties = {
  border: "1px solid rgba(96, 165, 250, 0.2)",
  borderRadius: 14,
  background: "rgba(96, 165, 250, 0.08)",
  padding: "10px 12px",
  display: "grid",
  gap: 7,
  marginTop: 3,
}

const rebuildInfoRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "48px minmax(0, 1fr)",
  gap: 10,
  alignItems: "center",
  color: "#cbd5e1",
  fontSize: 13,
  lineHeight: 1.25,
  fontWeight: 760,
}

const labelStyle: CSSProperties = {
  color: "#cbd5e1",
  fontSize: 13,
  fontWeight: 850,
  marginTop: 5,
}

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 46,
  borderRadius: 14,
  border: "1px solid #334155",
  background: "#0b1220",
  color: "#fff",
  fontSize: 16,
  padding: "0 13px",
  boxSizing: "border-box",
  outline: "none",
}

const selectStyle: CSSProperties = {
  ...inputStyle,
  appearance: "none",
}

const machineSummaryStyle: CSSProperties = {
  border: "1px solid #273244",
  borderRadius: 16,
  background: "#0f172a",
  padding: 13,
  marginTop: 12,
  display: "grid",
  gap: 10,
}

const machineSummaryHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
}

const machineSummaryTitleStyle: CSSProperties = {
  color: "#fff",
  fontSize: 16,
  fontWeight: 900,
}

const machineSummaryCountStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 800,
}

const summaryStatGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 8,
}

const summaryStatStyle: CSSProperties = {
  border: "1px solid #273244",
  borderRadius: 13,
  background: "#0b1220",
  padding: "9px 10px",
  display: "grid",
  gap: 4,
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 800,
}

const resultListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 12,
}

const resultCardStyle: CSSProperties = {
  width: "100%",
  border: "1px solid #273244",
  borderRadius: 16,
  background: "#0f172a",
  color: "#fff",
  padding: "13px 14px",
  textAlign: "left",
  display: "grid",
  gap: 8,
  cursor: "pointer",
}

const resultMainStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  minWidth: 0,
}

const skuStyle: CSSProperties = {
  color: "#93c5fd",
  fontSize: 15,
  fontWeight: 900,
  lineHeight: 1.2,
}

const nameStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 15,
  fontWeight: 760,
  lineHeight: 1.3,
}

const resultMetaStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  fontWeight: 760,
}

const detailCardStyle: CSSProperties = {
  background: "#101827",
  border: "1px solid #273244",
  borderRadius: 18,
  padding: 14,
  marginTop: 12,
  display: "grid",
  gap: 11,
  boxSizing: "border-box",
}

const detailHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 12,
  alignItems: "start",
}

const detailNameStyle: CSSProperties = {
  color: "#fff",
  fontSize: 18,
  fontWeight: 900,
  lineHeight: 1.3,
  marginTop: 4,
}

const clearButtonStyle: CSSProperties = {
  border: "1px solid #334155",
  background: "#0b1220",
  color: "#cbd5e1",
  borderRadius: 12,
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 850,
  cursor: "pointer",
}

const statGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
}

const statBoxStyle: CSSProperties = {
  border: "1px solid #273244",
  borderRadius: 14,
  background: "#0b1220",
  padding: "10px 12px",
  display: "grid",
  gap: 5,
}

const statLabelStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 800,
}

const statValueStyle: CSSProperties = {
  color: "#f8fafc",
  fontSize: 22,
  lineHeight: 1,
  fontWeight: 950,
}

const submitButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 52,
  border: "none",
  borderRadius: 16,
  background: "#2563eb",
  color: "#fff",
  fontSize: 17,
  fontWeight: 900,
  cursor: "pointer",
  marginTop: 4,
}

const detailHintStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 760,
  lineHeight: 1.5,
}

const messageStyle: CSSProperties = {
  background: "rgba(47, 214, 111, 0.1)",
  color: "#2fd66f",
  border: "1px solid rgba(47, 214, 111, 0.2)",
  borderRadius: 12,
  padding: "10px 12px",
  marginBottom: 12,
  fontSize: 14,
  textAlign: "center",
  boxSizing: "border-box",
}

const errorStyle: CSSProperties = {
  background: "rgba(255, 102, 102, 0.1)",
  color: "#ff6666",
  border: "1px solid rgba(255, 102, 102, 0.2)",
  borderRadius: 12,
  padding: "10px 12px",
  marginBottom: 12,
  fontSize: 14,
  textAlign: "center",
  boxSizing: "border-box",
}

const mutedStyle: CSSProperties = {
  color: "#9ca3af",
  textAlign: "center",
  padding: "20px 0",
  margin: 0,
}
