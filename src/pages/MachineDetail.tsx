//MachineDetail.tsx
import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabase"

type Props = {
  machineNo: string
  onBack: () => void
}

type MachineItem = {
  id: number
  machine_no: string
  product_sku: string
  qty_piece: number
  product_name: string
}

type Product = {
  product_sku: string
  product_name: string
  barcode?: string
}

const GROUP_CODE = "catchme_penghu"

function getTaipeiDateString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())

  const year = parts.find((p) => p.type === "year")?.value ?? ""
  const month = parts.find((p) => p.type === "month")?.value ?? ""
  const day = parts.find((p) => p.type === "day")?.value ?? ""

  return `${year}-${month}-${day}`
}

function toSheetDate(dateText: string) {
  const [, month, day] = dateText.split("-")
  return `${month}${day}`
}

function toSafeNumber(value: string) {
  if (value.trim() === "") return 0
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

export default function MachineDetail({ machineNo, onBack }: Props) {
  const todayText = useMemo(() => getTaipeiDateString(), [])

  const [items, setItems] = useState<MachineItem[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [newQty, setNewQty] = useState("")
  const [mountedDate, setMountedDate] = useState(todayText)

  const [closingItem, setClosingItem] = useState<MachineItem | null>(null)
  const [removedQty, setRemovedQty] = useState("")
  const [removedDate, setRemovedDate] = useState(todayText)

  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    loadItems()
  }, [machineNo])

  useEffect(() => {
    if (!showAdd) return

    const keyword = searchText.trim()

    if (!keyword) {
      setProducts([])
      setSelectedProduct(null)
      return
    }

    const timer = window.setTimeout(() => {
      searchProducts(keyword)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [searchText, showAdd])

  async function loadItems() {
    try {
      setLoading(true)
      setError("")

      const { data: itemData, error: itemError } = await supabase
        .from("machine_items")
        .select("id,machine_no,product_sku,qty_piece")
        .eq("group_code", GROUP_CODE)
        .eq("machine_no", machineNo)
        .order("product_sku", { ascending: true })

      if (itemError) throw itemError

      const skuList = Array.from(
        new Set((itemData ?? []).map((item) => item.product_sku))
      )

      let productMap = new Map<string, string>()

      if (skuList.length > 0) {
        const { data: productData, error: productError } = await supabase
          .from("products")
          .select("product_sku,product_name")
          .in("product_sku", skuList)

        if (productError) throw productError

        productMap = new Map(
          (productData ?? []).map((p) => [
            p.product_sku,
            p.product_name ?? "",
          ])
        )
      }

      setItems(
        (itemData ?? []).map((item) => ({
          id: item.id,
          machine_no: item.machine_no,
          product_sku: item.product_sku,
          qty_piece: Number(item.qty_piece ?? 0),
          product_name: productMap.get(item.product_sku) ?? "",
        }))
      )
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? "讀取失敗")
    } finally {
      setLoading(false)
    }
  }

  async function searchProducts(keyword: string) {
    try {
      setSearching(true)
      setError("")

      const normalizedKeyword = keyword.trim()

      const { data: productData, error: productError } = await supabase
        .from("products")
        .select("product_sku,product_name")
        .eq("enabled", true)
        .or(
          `product_sku.ilike.%${normalizedKeyword}%,product_name.ilike.%${normalizedKeyword}%`
        )
        .limit(30)

      if (productError) throw productError

      const { data: barcodeData, error: barcodeError } = await supabase
        .from("product_barcodes")
        .select("product_sku,barcode")
        .eq("enabled", true)
        .ilike("barcode", `%${normalizedKeyword}%`)
        .limit(30)

      if (barcodeError) throw barcodeError

      const skuFromBarcode = Array.from(
        new Set((barcodeData ?? []).map((row) => row.product_sku))
      )

      let barcodeProductData: Array<{
        product_sku: string
        product_name: string
      }> = []

      if (skuFromBarcode.length > 0) {
        const { data, error } = await supabase
          .from("products")
          .select("product_sku,product_name")
          .eq("enabled", true)
          .in("product_sku", skuFromBarcode)

        if (error) throw error

        barcodeProductData = data ?? []
      }

      const barcodeMap = new Map(
        (barcodeData ?? []).map((row) => [row.product_sku, row.barcode])
      )

      const merged = new Map<string, Product>()

      for (const product of productData ?? []) {
        merged.set(product.product_sku, {
          product_sku: product.product_sku,
          product_name: product.product_name ?? "",
          barcode: barcodeMap.get(product.product_sku),
        })
      }

      for (const product of barcodeProductData) {
        merged.set(product.product_sku, {
          product_sku: product.product_sku,
          product_name: product.product_name ?? "",
          barcode: barcodeMap.get(product.product_sku),
        })
      }

      setProducts(Array.from(merged.values()).slice(0, 30))
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? "搜尋失敗")
    } finally {
      setSearching(false)
    }
  }

  function updateLocalQty(itemId: number, value: string) {
    const qty = toSafeNumber(value)

    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, qty_piece: qty } : item
      )
    )

    setMessage("")
  }

  async function saveQty(item: MachineItem) {
    try {
      setSaving(true)
      setError("")

      const { error } = await supabase.rpc("rpc_upsert_machine_item", {
        p_group: GROUP_CODE,
        p_machine_no: item.machine_no,
        p_product_sku: item.product_sku,
        p_qty_piece: item.qty_piece,
      })

      if (error) throw error

      setMessage("已儲存")
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? "儲存失敗")
    } finally {
      setSaving(false)
    }
  }

  function openCloseModal(item: MachineItem) {
    setClosingItem(item)
    setRemovedQty("")
    setRemovedDate(todayText)
    setError("")
    setMessage("")
  }

  function closeCloseModal() {
    setClosingItem(null)
    setRemovedQty("")
    setRemovedDate(todayText)
  }

  async function confirmCloseItem() {
    if (!closingItem) return

    const actualRemovedQty = toSafeNumber(removedQty)

    if (actualRemovedQty < 0 || removedQty.trim() === "") {
      setError("請輸入實際撤台數量")
      return
    }

    if (!removedDate) {
      setError("請選擇撤台日期")
      return
    }

    const ok = window.confirm(
      `確認撤台結算？\n\n機台：${machineNo}\n商品：${
        closingItem.product_name || closingItem.product_sku
      }\n實際撤台數量：${actualRemovedQty}`
    )

    if (!ok) return

    try {
      setSaving(true)
      setError("")
      setMessage("")

      const { data: lifecycle, error: lifecycleFindError } = await supabase
        .from("machine_lifecycles")
        .select("id")
        .eq("group_code", GROUP_CODE)
        .eq("machine_no", machineNo)
        .eq("product_sku", closingItem.product_sku)
        .eq("status", "active")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lifecycleFindError) throw lifecycleFindError

      if (!lifecycle?.id) {
        throw new Error("找不到這個商品的啟用中生命週期，無法撤台結算")
      }

      const { error: lifecycleUpdateError } = await supabase
        .from("machine_lifecycles")
        .update({
          status: "closed",
          actual_removed_qty: actualRemovedQty,
          removed_at: `${removedDate}T05:00:00+08:00`,
          removed_biz_date: removedDate,
          remark: "機台管理 X 撤台結算",
        })
        .eq("id", lifecycle.id)

      if (lifecycleUpdateError) throw lifecycleUpdateError

      const { error: deleteError } = await supabase.rpc(
        "rpc_delete_machine_item",
        {
          p_group: GROUP_CODE,
          p_machine_no: machineNo,
          p_product_sku: closingItem.product_sku,
        }
      )

      if (deleteError) throw deleteError

      closeCloseModal()
      setMessage("已撤台結算並移除商品")
      await loadItems()
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? "撤台失敗")
    } finally {
      setSaving(false)
    }
  }

  async function addProduct() {
    if (!selectedProduct) {
      setError("請先選擇商品")
      return
    }

    const initialInnerQty = toSafeNumber(newQty)

    if (initialInnerQty < 0) {
      setError("請輸入台內數量")
      return
    }

    if (!mountedDate) {
      setError("請選擇上架日期")
      return
    }

    const existed = items.some(
      (item) => item.product_sku === selectedProduct.product_sku
    )

    if (existed) {
      setError("這個商品已經在此機台內")
      return
    }

    try {
      setSaving(true)
      setError("")
      setMessage("")

      const { error: upsertError } = await supabase.rpc(
        "rpc_upsert_machine_item",
        {
          p_group: GROUP_CODE,
          p_machine_no: machineNo,
          p_product_sku: selectedProduct.product_sku,
          p_qty_piece: initialInnerQty,
        }
      )

      if (upsertError) throw upsertError

      const { data: itemRow, error: itemError } = await supabase
        .from("machine_items")
        .select("id")
        .eq("group_code", GROUP_CODE)
        .eq("machine_no", machineNo)
        .eq("product_sku", selectedProduct.product_sku)
        .maybeSingle()

      if (itemError) throw itemError

      const { error: lifecycleError } = await supabase
        .from("machine_lifecycles")
        .insert({
          group_code: GROUP_CODE,
          machine_item_id: itemRow?.id ?? null,
          machine_no: machineNo,
          product_sku: selectedProduct.product_sku,
          initial_inner_qty: initialInnerQty,
          target_inner_qty: initialInnerQty,
          mounted_at: `${mountedDate}T05:00:00+08:00`,
          mounted_biz_date: mountedDate,
          mounted_sheet_date: toSheetDate(mountedDate),
          status: "active",
        })

      if (lifecycleError) throw lifecycleError

      closeAddModal()
      setMessage("已加入商品並建立生命週期")
      await loadItems()
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? "加入失敗")
    } finally {
      setSaving(false)
    }
  }

  function closeAddModal() {
    setShowAdd(false)
    setSearchText("")
    setSelectedProduct(null)
    setNewQty("")
    setMountedDate(todayText)
    setProducts([])
  }

  return (
    <div style={pageStyle}>
      <div style={topBarStyle}>
        <button onClick={onBack} style={backButtonStyle}>
          ←
        </button>

        <div style={titleWrapStyle}>
          <div style={smallTitleStyle}>機台管理</div>
          <h1 style={titleStyle}>#{machineNo}</h1>
        </div>

        <div />
      </div>

      <button onClick={() => setShowAdd(true)} style={addProductButtonStyle}>
        ＋ 加入商品
      </button>

      {message && <div style={messageStyle}>{message}</div>}
      {error && <div style={errorStyle}>{error}</div>}
      {loading && <p style={mutedStyle}>載入中...</p>}

      {!loading && items.length === 0 && (
        <div style={emptyBoxStyle}>此機台尚未設定商品</div>
      )}

      {!loading && (
        <div style={listStyle}>
          {items.map((item) => (
            <div key={item.id} style={cardStyle}>
              <button
                onClick={() => openCloseModal(item)}
                style={deleteButtonStyle}
              >
                ×
              </button>

              <div style={skuStyle}>{item.product_sku}</div>

              <div style={nameStyle}>
                {item.product_name || item.product_sku}
              </div>

              <div style={qtyRowStyle}>
                <span style={qtyLabelStyle}>台內數</span>

                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={item.qty_piece || ""}
                  onChange={(e) => updateLocalQty(item.id, e.target.value)}
                  onBlur={() => saveQty(item)}
                  style={qtyInputStyle}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {saving && <div style={savingStyle}>儲存中...</div>}

      {showAdd && (
        <div style={modalMaskStyle}>
          <div style={modalStyle}>
            <div style={modalHandleStyle} />

            <h2 style={modalTitleStyle}>加入商品</h2>

            <label style={fieldLabelStyle}>搜尋商品</label>
            <input
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value)
                setSelectedProduct(null)
              }}
              placeholder="搜尋貨編 / 名稱 / 條碼"
              style={searchInputStyle}
              autoFocus
            />

            {searching && <div style={mutedStyle}>搜尋中...</div>}

            {selectedProduct && (
              <div style={selectedBoxStyle}>
                <strong>已選：{selectedProduct.product_sku}</strong>
                <br />
                {selectedProduct.product_name}
                {selectedProduct.barcode && (
                  <>
                    <br />
                    條碼：{selectedProduct.barcode}
                  </>
                )}
              </div>
            )}

            <div style={productListStyle}>
              {products.map((product) => (
                <button
                  key={product.product_sku}
                  onClick={() => setSelectedProduct(product)}
                  style={{
                    ...productButtonStyle,
                    borderColor:
                      selectedProduct?.product_sku === product.product_sku
                        ? "#60a5fa"
                        : "#334155",
                  }}
                >
                  <strong>{product.product_sku}</strong>
                  <br />
                  {product.product_name}
                  {product.barcode && (
                    <>
                      <br />
                      <span style={barcodeStyle}>條碼：{product.barcode}</span>
                    </>
                  )}
                </button>
              ))}

              {searchText.trim() && !searching && products.length === 0 && (
                <div style={emptyBoxStyle}>找不到商品</div>
              )}
            </div>

            <label style={fieldLabelStyle}>初始台內數量</label>
            <input
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              placeholder="例如：100"
              inputMode="numeric"
              type="number"
              min={0}
              style={searchInputStyle}
            />

            <label style={fieldLabelStyle}>上架日期</label>
            <input
              value={mountedDate}
              onChange={(e) => setMountedDate(e.target.value)}
              type="date"
              style={searchInputStyle}
            />

            <div style={hintStyle}>
              上架日期會用來抓當天機台補貨明細，之後計算初始落地。
            </div>

            <div style={modalActionsStyle}>
              <button onClick={closeAddModal} style={cancelButtonStyle}>
                取消
              </button>

              <button
                onClick={addProduct}
                disabled={saving}
                style={confirmButtonStyle}
              >
                加入
              </button>
            </div>
          </div>
        </div>
      )}

      {closingItem && (
        <div style={modalMaskStyle}>
          <div style={modalStyle}>
            <div style={modalHandleStyle} />

            <h2 style={modalTitleStyle}>撤台結算</h2>

            <div style={selectedBoxStyle}>
              <strong>機台：#{machineNo}</strong>
              <br />
              商品：{closingItem.product_sku}
              <br />
              {closingItem.product_name || closingItem.product_sku}
              <br />
              目前台內數：{closingItem.qty_piece}
            </div>

            <label style={fieldLabelStyle}>實際撤台數量</label>
            <input
              value={removedQty}
              onChange={(e) => setRemovedQty(e.target.value)}
              placeholder="請輸入實際撤回幾個"
              inputMode="numeric"
              type="number"
              min={0}
              style={searchInputStyle}
              autoFocus
            />

            <label style={fieldLabelStyle}>撤台日期</label>
            <input
              value={removedDate}
              onChange={(e) => setRemovedDate(e.target.value)}
              type="date"
              style={searchInputStyle}
            />

            <div style={hintStyle}>
              確認後會關閉這個商品的生命週期，並從目前機台商品中移除。
            </div>

            <div style={modalActionsStyle}>
              <button onClick={closeCloseModal} style={cancelButtonStyle}>
                取消
              </button>

              <button
                onClick={confirmCloseItem}
                disabled={saving}
                style={dangerConfirmButtonStyle}
              >
                確認撤台
              </button>
            </div>
          </div>
        </div>
      )}
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
  padding: "calc(env(safe-area-inset-top, 0px) + 10px) 14px 28px",
  boxSizing: "border-box",
  WebkitTextSizeAdjust: "100%",
  touchAction: "manipulation",
}

const topBarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "44px minmax(0, 1fr) 44px",
  alignItems: "center",
  gap: 8,
  marginBottom: 14,
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
}

const backButtonStyle: CSSProperties = {
  width: 44,
  height: 44,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 14,
  color: "#fff",
  fontSize: 30,
  lineHeight: 1,
  padding: 0,
}

const titleWrapStyle: CSSProperties = {
  minWidth: 0,
  maxWidth: "100%",
  textAlign: "center",
  overflow: "hidden",
}

const smallTitleStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 2,
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1.1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}

const addProductButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 54,
  borderRadius: 18,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontSize: 19,
  fontWeight: 900,
  marginBottom: 14,
  boxSizing: "border-box",
}

const messageStyle: CSSProperties = {
  color: "#4ade80",
  background: "rgba(74,222,128,0.1)",
  border: "1px solid rgba(74,222,128,0.22)",
  borderRadius: 14,
  padding: "10px 12px",
  marginBottom: 12,
  fontSize: 15,
  boxSizing: "border-box",
}

const errorStyle: CSSProperties = {
  color: "#fca5a5",
  background: "rgba(248,113,113,0.1)",
  border: "1px solid rgba(248,113,113,0.22)",
  borderRadius: 14,
  padding: "10px 12px",
  marginBottom: 12,
  fontSize: 15,
  boxSizing: "border-box",
}

const mutedStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 15,
}

const listStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  boxSizing: "border-box",
}

const cardStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  maxWidth: "100%",
  minWidth: 0,
  background: "#111827",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20,
  padding: "16px 54px 16px 14px",
  boxSizing: "border-box",
  overflow: "hidden",
}

const deleteButtonStyle: CSSProperties = {
  position: "absolute",
  top: 10,
  right: 10,
  width: 38,
  height: 38,
  background: "rgba(239,68,68,0.12)",
  border: "1px solid rgba(239,68,68,0.28)",
  borderRadius: 14,
  color: "#f87171",
  fontSize: 28,
  fontWeight: 900,
  lineHeight: 1,
  padding: 0,
}

const skuStyle: CSSProperties = {
  fontSize: 20,
  fontWeight: 900,
  marginBottom: 8,
  maxWidth: "100%",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
}

const nameStyle: CSSProperties = {
  fontSize: 17,
  lineHeight: 1.4,
  marginBottom: 16,
  color: "#e5e7eb",
  maxWidth: "100%",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
}

const qtyRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(88px, 112px)",
  alignItems: "center",
  gap: 10,
  width: "100%",
  minWidth: 0,
}

const qtyLabelStyle: CSSProperties = {
  fontSize: 16,
  color: "#cbd5e1",
  fontWeight: 700,
  minWidth: 0,
}

const qtyInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 48,
  borderRadius: 14,
  border: "1px solid #475569",
  background: "#020617",
  color: "#fff",
  fontSize: 18,
  padding: "0 12px",
  boxSizing: "border-box",
}

const emptyBoxStyle: CSSProperties = {
  color: "#94a3b8",
  border: "1px solid #273244",
  borderRadius: 18,
  padding: 16,
  fontSize: 15,
  boxSizing: "border-box",
}

const savingStyle: CSSProperties = {
  color: "#94a3b8",
  marginTop: 16,
  fontSize: 15,
}

const modalMaskStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "100vw",
  maxWidth: "100vw",
  overflowX: "hidden",
  background: "rgba(0,0,0,0.76)",
  display: "flex",
  alignItems: "flex-end",
  zIndex: 100,
}

const modalStyle: CSSProperties = {
  width: "100%",
  maxWidth: 560,
  minWidth: 0,
  maxHeight: "88dvh",
  overflowY: "auto",
  overflowX: "hidden",
  margin: "0 auto",
  background: "#101827",
  borderRadius: "24px 24px 0 0",
  padding: "10px 16px calc(env(safe-area-inset-bottom, 0px) + 16px)",
  boxSizing: "border-box",
}

const modalHandleStyle: CSSProperties = {
  width: 46,
  height: 5,
  borderRadius: 999,
  background: "#475569",
  margin: "0 auto 14px",
}

const modalTitleStyle: CSSProperties = {
  margin: "0 0 14px",
  fontSize: 22,
  fontWeight: 900,
}

const fieldLabelStyle: CSSProperties = {
  display: "block",
  color: "#cbd5e1",
  fontSize: 14,
  fontWeight: 800,
  margin: "0 0 6px",
}

const searchInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 50,
  borderRadius: 14,
  border: "1px solid #334155",
  background: "#020617",
  color: "#fff",
  fontSize: 16,
  padding: "0 14px",
  boxSizing: "border-box",
  marginBottom: 12,
}

const selectedBoxStyle: CSSProperties = {
  color: "#4ade80",
  background: "rgba(74,222,128,0.1)",
  border: "1px solid rgba(74,222,128,0.22)",
  borderRadius: 14,
  padding: 12,
  marginBottom: 12,
  lineHeight: 1.5,
  fontSize: 15,
  boxSizing: "border-box",
  overflowWrap: "anywhere",
}

const productListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginBottom: 14,
  width: "100%",
  minWidth: 0,
}

const productButtonStyle: CSSProperties = {
  textAlign: "left",
  border: "1px solid #334155",
  borderRadius: 14,
  background: "#1a2233",
  color: "#fff",
  padding: 12,
  fontSize: 16,
  lineHeight: 1.5,
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
  overflowWrap: "anywhere",
}

const barcodeStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 14,
}

const hintStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
  lineHeight: 1.5,
  margin: "-4px 0 14px",
}

const modalActionsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 10,
  position: "sticky",
  bottom: 0,
  background: "#101827",
  paddingTop: 10,
  width: "100%",
  minWidth: 0,
  boxSizing: "border-box",
}

const cancelButtonStyle: CSSProperties = {
  height: 52,
  borderRadius: 14,
  border: "1px solid #475569",
  background: "transparent",
  color: "#fff",
  fontSize: 17,
  fontWeight: 800,
  minWidth: 0,
}

const confirmButtonStyle: CSSProperties = {
  height: 52,
  borderRadius: 14,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontSize: 17,
  fontWeight: 900,
  minWidth: 0,
}

const dangerConfirmButtonStyle: CSSProperties = {
  ...confirmButtonStyle,
  background: "#dc2626",
}