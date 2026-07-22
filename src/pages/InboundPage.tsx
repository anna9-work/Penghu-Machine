import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabase"

type Props = {
  onBack: () => void
}

type Product = {
  product_sku: string
  product_name: string
  units_per_box: number
  tags: string[]
}

type ProductRow = {
  product_sku: string
  product_name: string | null
  units_per_box: number | null
  tags: string[] | null
}

type Warehouse = {
  warehouse_code: string
  warehouse_name: string
}

const GROUP_CODE = "catchme_penghu"
const INBOUND_SOURCE = "app_inbound"
const ALLOWED_WAREHOUSES = ["main", "withdraw", "swap"]

export default function InboundPage({ onBack }: Props) {
  const [bizDate] = useState(() => getTodayText())
  const [warehouse, setWarehouse] = useState("main")
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [product, setProduct] = useState<Product | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState("")
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [boxQty, setBoxQty] = useState("0")
  const [pieceQty, setPieceQty] = useState("0")
  const [unitCost, setUnitCost] = useState("")
  const [expiryDate, setExpiryDate] = useState("")
  const [loadingProduct, setLoadingProduct] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    loadWarehouses()
  }, [])

  useEffect(() => {
    if (!searchOpen) return

    const value = searchKeyword.trim()

    if (!value) {
      setSearchResults([])
      return
    }

    if (value.length < 2) {
      return
    }

    const timer = window.setTimeout(() => {
      void searchProductOptions(value)
    }, 350)

    return () => window.clearTimeout(timer)
  }, [searchKeyword, searchOpen])

  const isFood = useMemo(() => {
    return product?.tags.some((tag) => tag === "食品") ?? false
  }, [product])

  async function loadWarehouses() {
    const { data, error: warehouseError } = await supabase
      .from("warehouse_kinds")
      .select("warehouse_code,warehouse_name")
      .in("warehouse_code", ALLOWED_WAREHOUSES)
      .order("warehouse_code", { ascending: true })

    if (warehouseError) {
      console.error(warehouseError)
      setWarehouses([
        { warehouse_code: "main", warehouse_name: "總倉" },
        { warehouse_code: "withdraw", warehouse_name: "撤台" },
        { warehouse_code: "swap", warehouse_name: "夾換品" },
      ])
      return
    }

    const rows = ((data ?? []) as Warehouse[]).sort((a, b) => {
      return (
        ALLOWED_WAREHOUSES.indexOf(a.warehouse_code) -
        ALLOWED_WAREHOUSES.indexOf(b.warehouse_code)
      )
    })
    setWarehouses(rows)
    if (rows.length > 0 && !rows.some((row) => row.warehouse_code === warehouse)) {
      setWarehouse(rows[0].warehouse_code)
    }
  }

  async function searchProductOptions(searchValue = searchKeyword) {
    const value = searchValue.trim()
    if (!value) {
      setError("請輸入 SKU、關鍵字或條碼")
      return
    }

    try {
      setLoadingProduct(true)
      setError("")
      setMessage("")
      setSearchResults([])

      const normalizedKeyword = value.toLowerCase()
      const exactMatches: Product[] = []
      const skuProduct = await loadProductBySku(normalizedKeyword)

      if (skuProduct) {
        exactMatches.push(skuProduct)
      }

      const { data: barcodeData, error: barcodeError } = await supabase
        .from("product_barcodes")
        .select("product_sku")
        .eq("barcode", value)
        .eq("enabled", true)
        .maybeSingle()

      if (barcodeError) throw barcodeError

      const barcodeSku = barcodeData?.product_sku ?? ""
      const barcodeProduct =
        barcodeSku && barcodeSku !== skuProduct?.product_sku
          ? await loadProductBySku(barcodeSku)
          : null

      if (barcodeProduct) {
        exactMatches.push(barcodeProduct)
      }

      const keywordProducts = await searchProductsByKeyword(value)
      const results = [...exactMatches, ...keywordProducts].filter(
        (row, index, rows) =>
          rows.findIndex((item) => item.product_sku === row.product_sku) === index
      )

      setSearchResults(results)

      if (results.length === 0) {
        setError("找不到此商品")
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "商品查詢失敗")
    } finally {
      setLoadingProduct(false)
    }
  }

  async function searchProductsByKeyword(value: string) {
    const normalizedValue = value.trim().toLowerCase()
    const { data, error: productError } = await supabase
      .from("products")
      .select("product_sku,product_name,units_per_box,tags")
      .eq("enabled", true)
      .or(`product_sku.ilike.%${normalizedValue}%,product_name.ilike.%${normalizedValue}%`)
      .order("product_sku", { ascending: true })
      .limit(10)

    if (productError) throw productError

    return ((data ?? []) as ProductRow[]).map((row) => ({
      product_sku: row.product_sku,
      product_name: row.product_name ?? "",
      units_per_box: row.units_per_box ?? 0,
      tags: row.tags ?? [],
    }))
  }

  async function selectProduct(nextProduct: Product) {
    setProduct(nextProduct)
    setSearchKeyword("")
    setSearchResults([])
    setSearchOpen(false)
    setExpiryDate("")
    const latestCost = await loadLatestUnitCost(nextProduct.product_sku)
    setUnitCost(latestCost)
  }

  async function loadProductBySku(sku: string) {
    const { data, error: productError } = await supabase
      .from("products")
      .select("product_sku,product_name,units_per_box,tags")
      .eq("product_sku", sku)
      .eq("enabled", true)
      .maybeSingle()

    if (productError) throw productError
    if (!data) return null

    const row = data as ProductRow
    return {
      product_sku: row.product_sku,
      product_name: row.product_name ?? "",
      units_per_box: row.units_per_box ?? 0,
      tags: row.tags ?? [],
    }
  }

  async function loadLatestUnitCost(productSku: string) {
    const { data, error: costError } = await supabase
      .from("inventory_ledger")
      .select("unit_cost_piece")
      .eq("product_sku", productSku)
      .in("source", ["app_inbound", "APP_INBOUND", "backfill_inbound"])
      .gt("unit_cost_piece", 0)
      .or("in_box.gt.0,in_piece.gt.0")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (costError) throw costError

    const cost = data?.unit_cost_piece
    return cost === null || cost === undefined ? "" : String(cost)
  }

  async function createInbound() {
    if (!product) {
      setError("請先加入商品")
      return
    }

    try {
      setSaving(true)
      setError("")
      setMessage("")

      const inBox = Number(boxQty || "0")
      const inPiece = Number(pieceQty || "0")
      const cost = Number(unitCost)

      if (!Number.isFinite(inBox) || inBox < 0) throw new Error("入庫箱數不可小於 0")
      if (!Number.isFinite(inPiece) || inPiece < 0) throw new Error("入庫散數不可小於 0")
      if (inBox === 0 && inPiece === 0) throw new Error("請輸入入庫箱數或散數")
      if (!Number.isFinite(cost) || cost <= 0) throw new Error("請輸入大於 0 的單件成本")
      if (isFood && !expiryDate) throw new Error("食品入庫請填寫效期")

      const { error: inboundError } = await supabase.rpc("app_inbound_min_v2", {
        p_group: GROUP_CODE,
        p_sku: product.product_sku,
        p_wh_code: warehouse,
        p_in_box: inBox,
        p_in_piece: inPiece,
        p_unit_cost_piece: cost,
        p_at: new Date().toISOString(),
        p_source: INBOUND_SOURCE,
        p_expiry_date: isFood ? expiryDate : null,
      })

      if (inboundError) throw inboundError

      setMessage("入庫已送出")
      setProduct(null)
      setSearchKeyword("")
      setSearchResults([])
      setBoxQty("0")
      setPieceQty("0")
      setUnitCost("")
      setExpiryDate("")
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "入庫失敗")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={contentStyle}>
        <header style={headerStyle}>
          <button onClick={onBack} style={backButtonStyle}>
            ←
          </button>
          <div>
            <h1 style={storeTitleStyle}>澎湖店</h1>
          </div>
          <div style={dateBlockStyle}>
            <div>{formatDisplayDate()}</div>
            <div style={bizDateStyle}>業務日：{bizDate}</div>
          </div>
        </header>

        {message && <div style={messageStyle}>{message}</div>}
        {error && <div style={errorStyle}>{error}</div>}

        <button
          onClick={() => {
            setSearchOpen(true)
            setSearchKeyword("")
            setSearchResults([])
            setError("")
          }}
          style={addProductButtonStyle}
        >
          + 加入商品
        </button>

        {product && (
          <section style={productCardStyle}>
            <div style={productNameStyle}>{product.product_name}</div>
            <div style={productMetaStyle}>SKU：{product.product_sku}</div>
            <div style={productMetaStyle}>箱入數：{product.units_per_box || "-"}</div>
            {product.tags.length > 0 && (
              <div style={tagRowStyle}>
                {product.tags.map((tag) => (
                  <span key={tag} style={tagStyle}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        <section style={panelStyle}>
          <label style={labelStyle}>倉庫</label>
          <select
            value={warehouse}
            onChange={(event) => setWarehouse(event.target.value)}
            style={inputStyle}
          >
            {warehouses.map((row) => (
              <option key={row.warehouse_code} value={row.warehouse_code}>
                {row.warehouse_name}
              </option>
            ))}
          </select>

          <label style={labelStyle}>箱入數</label>
          <input
            readOnly
            value={product?.units_per_box || "-"}
            style={{
              ...inputStyle,
              color: "#bbb",
            }}
          />

          <div style={twoColumnStyle}>
            <div>
              <label style={labelStyle}>入庫箱數</label>
              <input
                value={boxQty}
                onChange={(event) => setBoxQty(event.target.value)}
                inputMode="decimal"
                type="number"
                min={0}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>入庫散數</label>
              <input
                value={pieceQty}
                onChange={(event) => setPieceQty(event.target.value)}
                inputMode="decimal"
                type="number"
                min={0}
                style={inputStyle}
              />
            </div>
          </div>

          <label style={labelStyle}>單件成本</label>
          <input
            value={unitCost}
            onChange={(event) => setUnitCost(event.target.value)}
            inputMode="decimal"
            type="number"
            min={0}
            placeholder="請輸入單件成本"
            style={inputStyle}
          />

          {isFood && (
            <>
              <label style={labelStyle}>效期</label>
              <input
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
                type="date"
                style={inputStyle}
              />
            </>
          )}
        </section>

        <button disabled={saving} onClick={createInbound} style={primaryButtonStyle}>
          {saving ? "送出中..." : "送出入庫"}
        </button>
      </div>

      {searchOpen && (
        <div style={overlayStyle}>
          <button
            aria-label="關閉搜尋商品"
            onClick={() => setSearchOpen(false)}
            style={overlayBackdropStyle}
          />
          <section style={searchSheetStyle}>
            <div style={sheetHeaderStyle}>
              <h2 style={sheetTitleStyle}>搜尋商品</h2>
              <button
                aria-label="關閉"
                onClick={() => setSearchOpen(false)}
                style={closeButtonStyle}
              >
                ×
              </button>
            </div>

            <input
              autoFocus
              value={searchKeyword}
              onChange={(event) => {
                setSearchKeyword(event.target.value)
                setSearchResults([])
                setError("")
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void searchProductOptions()
                }
              }}
              placeholder="搜尋 SKU / 商品名稱 / 條碼"
              style={inputStyle}
            />

            {loadingProduct && <div style={hintStyle}>查詢商品中...</div>}

            {!loadingProduct && searchKeyword.trim().length === 0 && (
              <div style={hintStyle}>請輸入 SKU、名稱或條碼</div>
            )}

            {searchResults.length > 0 && (
              <div style={resultListStyle}>
                {searchResults.map((row) => (
                  <button
                    key={row.product_sku}
                    onClick={() => selectProduct(row)}
                    style={resultButtonStyle}
                  >
                    <span style={resultSkuStyle}>{row.product_sku}</span>
                    <span style={resultNameStyle}>
                      {row.product_name || "未命名商品"}
                    </span>
                    <span style={resultMetaStyle}>
                      箱入數：{row.units_per_box || "-"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function getTodayText() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())

  const year = parts.find((part) => part.type === "year")?.value ?? ""
  const month = parts.find((part) => part.type === "month")?.value ?? ""
  const day = parts.find((part) => part.type === "day")?.value ?? ""

  return `${year}-${month}-${day}`
}

function formatDisplayDate() {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).format(new Date())
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "#0f0f0f",
  color: "#fff",
  padding: "calc(env(safe-area-inset-top, 0px) + 44px) 16px 24px",
  boxSizing: "border-box",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const contentStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  margin: "0 auto",
}

const headerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "36px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 12,
  marginBottom: 20,
}

const backButtonStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "#fff",
  fontSize: 34,
  lineHeight: 1,
  padding: 0,
}

const storeTitleStyle: CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 24,
  fontWeight: 800,
}

const dateBlockStyle: CSSProperties = {
  color: "#ddd",
  fontSize: 15,
  textAlign: "right",
  lineHeight: 1.35,
}

const bizDateStyle: CSSProperties = {
  color: "#999",
  fontSize: 13,
  fontWeight: 700,
}

const panelStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  borderRadius: 16,
  background: "#151515",
  padding: 16,
  marginBottom: 16,
}

const labelStyle: CSSProperties = {
  display: "block",
  color: "#bbb",
  fontSize: 14,
  marginTop: 4,
}

const inputStyle: CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 12,
  border: "1px solid #444",
  background: "#202020",
  color: "#fff",
  fontSize: 18,
  padding: "0 12px",
  boxSizing: "border-box",
}

const hintStyle: CSSProperties = {
  color: "#999",
  fontSize: 13,
}

const resultListStyle: CSSProperties = {
  display: "grid",
  gap: 0,
  marginTop: 18,
}

const resultButtonStyle: CSSProperties = {
  width: "100%",
  border: "none",
  borderBottom: "1px solid #252525",
  background: "transparent",
  color: "#fff",
  padding: "14px 0",
  textAlign: "left",
}

const resultSkuStyle: CSSProperties = {
  display: "block",
  color: "#fff",
  fontSize: 18,
  fontWeight: 700,
  overflowWrap: "anywhere",
}

const resultNameStyle: CSSProperties = {
  display: "block",
  color: "#ddd",
  fontSize: 16,
  marginTop: 8,
  overflowWrap: "anywhere",
}

const resultMetaStyle: CSSProperties = {
  display: "block",
  color: "#999",
  fontSize: 13,
  marginTop: 8,
}

const addProductButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 60,
  borderRadius: 20,
  border: "1px solid #3d3d3d",
  background: "#303030",
  color: "#fff",
  fontSize: 18,
  marginBottom: 18,
}

const productCardStyle: CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  background: "#0f0f0f",
  padding: 12,
}

const productNameStyle: CSSProperties = {
  color: "#fff",
  fontSize: 18,
  fontWeight: 700,
}

const productMetaStyle: CSSProperties = {
  color: "#aaa",
  fontSize: 13,
  marginTop: 6,
}

const tagRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginTop: 10,
}

const tagStyle: CSSProperties = {
  border: "1px solid #444",
  borderRadius: 999,
  color: "#ddd",
  padding: "4px 10px",
  fontSize: 13,
}

const twoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
}

const primaryButtonStyle: CSSProperties = {
  position: "sticky",
  bottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
  width: "100%",
  minHeight: 54,
  border: "none",
  borderRadius: 16,
  background: "#5aa2ff",
  color: "#fff",
  fontSize: 18,
  fontWeight: 800,
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

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 20,
  display: "flex",
  alignItems: "flex-end",
}

const overlayBackdropStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  border: "none",
  background: "rgba(0,0,0,0.68)",
}

const searchSheetStyle: CSSProperties = {
  position: "relative",
  zIndex: 1,
  width: "100%",
  maxHeight: "68dvh",
  overflowY: "auto",
  borderRadius: "22px 22px 0 0",
  background: "#151515",
  padding: "24px 16px calc(env(safe-area-inset-bottom, 0px) + 22px)",
  boxSizing: "border-box",
}

const sheetHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 46px",
  alignItems: "center",
  gap: 12,
  marginBottom: 18,
}

const sheetTitleStyle: CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 22,
  fontWeight: 800,
}

const closeButtonStyle: CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 999,
  border: "none",
  background: "#252525",
  color: "#fff",
  fontSize: 28,
  lineHeight: 1,
}
