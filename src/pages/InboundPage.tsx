import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { inbound, loadProducts, loadWarehouses } from "../lib/inventory"
import type { Product, WarehouseKind } from "../types"

type Props = {
  onBack: () => void
  onSaved: () => void
}

export default function InboundPage({ onBack, onSaved }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseKind[]>([])
  const [keyword, setKeyword] = useState("")
  const [productSku, setProductSku] = useState("")
  const [warehouseCode, setWarehouseCode] = useState("main")
  const [inBox, setInBox] = useState("0")
  const [inPiece, setInPiece] = useState("0")
  const [unitCostPiece, setUnitCostPiece] = useState("")
  const [expiryDate, setExpiryDate] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  const selectedProduct = useMemo(() => {
    return products.find((product) => product.product_sku === productSku) ?? null
  }, [productSku, products])

  const isFood = selectedProduct?.tags.includes("食品") ?? false

  const filteredProducts = useMemo(() => {
    const text = keyword.trim().toLowerCase()

    return products
      .filter((product) => {
        if (!product.enabled) return false
        if (!text) return true

        return (
          product.product_sku.toLowerCase().includes(text) ||
          (product.product_name || "").toLowerCase().includes(text)
        )
      })
      .slice(0, 20)
  }, [keyword, products])

  useEffect(() => {
    async function init() {
      try {
        const [productRows, warehouseRows] = await Promise.all([
          loadProducts(),
          loadWarehouses(),
        ])

        setProducts(productRows)
        setWarehouses(warehouseRows)

        if (warehouseRows[0]) {
          setWarehouseCode(warehouseRows[0].warehouse_code)
        }
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : "資料讀取失敗")
      }
    }

    init()
  }, [])

  async function submit() {
    try {
      setSaving(true)
      setError("")
      setMessage("")

      if (!productSku) throw new Error("請選擇商品")
      if (!warehouseCode) throw new Error("請選擇倉庫")

      const box = Number(inBox || 0)
      const piece = Number(inPiece || 0)
      const cost = Number(unitCostPiece || 0)

      if (box <= 0 && piece <= 0) throw new Error("請輸入入庫箱數或個數")
      if (cost <= 0) throw new Error("請輸入單個成本")
      if (isFood && !expiryDate) throw new Error("食品類商品需要填有效日期")

      await inbound({
        product_sku: productSku,
        warehouse_code: warehouseCode,
        in_box: box,
        in_piece: piece,
        unit_cost_piece: cost,
        expiry_date: expiryDate,
      })

      setMessage("入庫完成")
      setInBox("0")
      setInPiece("0")
      setUnitCostPiece("")
      setExpiryDate("")
      onSaved()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "入庫失敗")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={pageStyle}>
      <header style={topBarStyle}>
        <button onClick={onBack} style={backButtonStyle}>
          &lt;
        </button>
        <div>
          <div style={eyebrowStyle}>INBOUND</div>
          <h1 style={titleStyle}>入庫</h1>
        </div>
      </header>

      {message && <div style={messageStyle}>{message}</div>}
      {error && <div style={errorStyle}>{error}</div>}

      <section style={panelStyle}>
        <label style={fieldStyle}>
          <span style={labelStyle}>搜尋商品</span>
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="輸入 SKU 或品名"
            style={inputStyle}
          />
        </label>

        <div style={productListStyle}>
          {filteredProducts.map((product) => {
            const active = product.product_sku === productSku

            return (
              <button
                key={product.product_sku}
                onClick={() => setProductSku(product.product_sku)}
                style={{
                  ...productButtonStyle,
                  borderColor: active ? "#5aa2ff" : "rgba(255,255,255,0.12)",
                  background: active ? "rgba(90,162,255,0.18)" : "rgba(255,255,255,0.05)",
                }}
              >
                <strong>{product.product_sku}</strong>
                <span>{product.product_name || "未命名商品"}</span>
                <small>箱入數：{product.units_per_box}</small>
              </button>
            )
          })}
        </div>

        <label style={fieldStyle}>
          <span style={labelStyle}>入庫倉庫</span>
          <select
            value={warehouseCode}
            onChange={(event) => setWarehouseCode(event.target.value)}
            style={inputStyle}
          >
            {warehouses.map((warehouse) => (
              <option key={warehouse.warehouse_code} value={warehouse.warehouse_code}>
                {warehouse.warehouse_name}
              </option>
            ))}
          </select>
        </label>

        <div style={twoColStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>箱數</span>
            <input
              inputMode="decimal"
              value={inBox}
              onChange={(event) => setInBox(event.target.value)}
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>個數</span>
            <input
              inputMode="decimal"
              value={inPiece}
              onChange={(event) => setInPiece(event.target.value)}
              style={inputStyle}
            />
          </label>
        </div>

        <label style={fieldStyle}>
          <span style={labelStyle}>單個成本</span>
          <input
            inputMode="decimal"
            value={unitCostPiece}
            onChange={(event) => setUnitCostPiece(event.target.value)}
            placeholder="例如 12.5"
            style={inputStyle}
          />
        </label>

        {isFood && (
          <label style={fieldStyle}>
            <span style={labelStyle}>有效日期</span>
            <input
              type="date"
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
              style={inputStyle}
            />
          </label>
        )}

        <button disabled={saving} onClick={submit} style={primaryButtonStyle}>
          {saving ? "處理中..." : "確認入庫"}
        </button>
      </section>
    </main>
  )
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  width: "100%",
  maxWidth: 520,
  margin: "0 auto",
  background:
    "radial-gradient(circle at 18% 0%, rgba(56, 189, 248, 0.2), transparent 28%), linear-gradient(180deg, #05070b 0%, #030407 100%)",
  color: "#f8fafc",
  padding: "calc(env(safe-area-inset-top, 0px) + 32px) 18px 28px",
}

const topBarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "44px minmax(0, 1fr)",
  gap: 14,
  alignItems: "center",
  marginBottom: 20,
}

const backButtonStyle: CSSProperties = {
  height: 40,
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: 12,
  background: "rgba(255,255,255,0.06)",
  color: "#f8fafc",
  fontSize: 18,
}

const eyebrowStyle: CSSProperties = {
  color: "#8dd7ff",
  fontSize: 12,
  fontWeight: 900,
}

const titleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#f8fafc",
  fontSize: 28,
  lineHeight: 1.1,
  fontWeight: 950,
}

const panelStyle: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.22)",
  borderRadius: 24,
  background: "linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.035))",
  padding: 18,
}

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginBottom: 16,
}

const labelStyle: CSSProperties = {
  color: "#cbd5e1",
  fontSize: 14,
  fontWeight: 850,
}

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 46,
  border: "1px solid rgba(148,163,184,0.28)",
  borderRadius: 14,
  background: "rgba(15,23,42,0.72)",
  color: "#f8fafc",
  padding: "0 14px",
  outline: "none",
}

const productListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  maxHeight: 300,
  overflowY: "auto",
  marginBottom: 18,
}

const productButtonStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  border: "1px solid",
  borderRadius: 16,
  color: "#f8fafc",
  padding: 14,
  textAlign: "left",
}

const twoColStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
}

const primaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 50,
  border: "none",
  borderRadius: 16,
  background: "#5aa2ff",
  color: "#fff",
  fontSize: 17,
  fontWeight: 950,
}

const messageStyle: CSSProperties = {
  marginBottom: 12,
  borderRadius: 14,
  background: "rgba(22,199,101,0.16)",
  color: "#86efac",
  padding: 12,
  fontWeight: 850,
}

const errorStyle: CSSProperties = {
  marginBottom: 12,
  borderRadius: 14,
  background: "rgba(248,113,113,0.16)",
  color: "#fca5a5",
  padding: 12,
  fontWeight: 850,
}