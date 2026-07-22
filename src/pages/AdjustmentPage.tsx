import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabase"

type Props = {
  onBack: () => void
}

type Mode = "backfill_inbound" | "backfill_outbound" | "box2piece"

type Product = {
  product_sku: string
  product_name: string
  units_per_box: number
  tags: string[]
  stock_box?: number
  stock_piece?: number
  stock_amount?: number
}

type ProductRow = {
  product_sku: string
  product_name: string | null
  units_per_box: number | null
  tags: string[] | null
}

type StockRow = {
  warehouse_code: string
  warehouse_name: string
  product_sku: string
  product_name: string | null
  units_per_box: number | null
  box: number | null
  piece: number | null
  amount: number | null
}

type Warehouse = {
  warehouse_code: string
  warehouse_name: string
}

const GROUP_CODE = "catchme_penghu"
const ALLOWED_WAREHOUSES = ["main", "withdraw", "swap"]

export default function AdjustmentPage({ onBack }: Props) {
  const submittingRef = useRef(false)
  const [mode, setMode] = useState<Mode>("backfill_inbound")
  const [adjustDate, setAdjustDate] = useState(() => getTodayText())
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

    if (value.length < 2) return

    const timer = window.setTimeout(() => {
      void searchProductOptions(value)
    }, 350)

    return () => window.clearTimeout(timer)
  }, [searchKeyword, searchOpen])

  useEffect(() => {
    if (mode !== "box2piece" || !product) return

    void refreshSelectedStock(product.product_sku)
  }, [mode, product?.product_sku, warehouse])

  const isInbound = mode === "backfill_inbound"
  const isOutbound = mode === "backfill_outbound"
  const isBox2Piece = mode === "box2piece"
  const isFood = useMemo(() => {
    return product?.tags.some((tag) => tag === "食品") ?? false
  }, [product])

  const convertedPiece = useMemo(() => {
    if (!isBox2Piece || !product) return 0
    const qtyBox = Number(boxQty || "0")
    if (!Number.isFinite(qtyBox) || qtyBox <= 0) return 0
    return qtyBox * Number(product.units_per_box || 0)
  }, [boxQty, isBox2Piece, product])

  const box2PieceQty = Number(boxQty || "0")
  const box2PieceStockBox = Number(product?.stock_box ?? 0)
  const box2PieceWarning =
    isBox2Piece && product && box2PieceQty > box2PieceStockBox
      ? "轉換箱數不可大於目前庫存箱數"
      : ""
  const canSubmit =
    !saving &&
    Boolean(product) &&
    (!isBox2Piece ||
      (Number.isInteger(box2PieceQty) &&
        box2PieceQty > 0 &&
        box2PieceQty <= box2PieceStockBox))

  const modeLabel = isInbound ? "補入庫" : isOutbound ? "補出庫" : "箱轉散"
  const fixedTime = isInbound ? "13:00" : isOutbound ? "14:00" : "送出當下"

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
    if (mode === "box2piece") {
      await searchStockProductOptions(searchValue)
      return
    }

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

      const barcodeSku = await loadSkuByBarcode(value)
      const barcodeProduct =
        barcodeSku && barcodeSku !== skuProduct?.product_sku
          ? await loadProductBySku(barcodeSku)
          : null

      if (barcodeProduct) {
        exactMatches.push(barcodeProduct)
      }

      const keywordProducts = await searchProductsByKeyword(value)
      const results = dedupeProducts([...exactMatches, ...keywordProducts])

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

  async function searchStockProductOptions(searchValue = searchKeyword) {
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

      const barcodeSku = await loadSkuByBarcode(value)
      const stockRows = await loadStockRows()
      const lowerValue = value.toLowerCase()

      const results = stockRows
        .filter((row) => {
          if (row.warehouse_code !== warehouse) return false
          if (Number(row.box ?? 0) <= 0) return false
          if (barcodeSku && row.product_sku === barcodeSku) return true

          const sku = row.product_sku.toLowerCase()
          const name = (row.product_name ?? "").toLowerCase()
          return sku.includes(lowerValue) || name.includes(lowerValue)
        })
        .slice(0, 10)
        .map(stockRowToProduct)

      setSearchResults(results)

      if (results.length === 0) {
        setError("找不到有箱數庫存的商品")
      }
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "庫存查詢失敗")
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
    setError("")

    if (mode === "backfill_inbound") {
      const latestCost = await loadLatestUnitCost(nextProduct.product_sku)
      setUnitCost(latestCost)
    } else {
      setUnitCost("")
    }
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

  async function loadSkuByBarcode(value: string) {
    const { data, error: barcodeError } = await supabase
      .from("product_barcodes")
      .select("product_sku")
      .eq("barcode", value)
      .eq("enabled", true)
      .maybeSingle()

    if (barcodeError) throw barcodeError
    return data?.product_sku ?? ""
  }

  async function loadStockRows() {
    const stockBizDate = mode === "box2piece" ? getBusinessDateText() : adjustDate
    const { data, error: stockError } = await supabase.rpc("get_business_day_stock", {
      p_group: GROUP_CODE,
      p_biz_date: stockBizDate,
    })

    if (stockError) throw stockError
    return (data ?? []) as StockRow[]
  }

  async function refreshSelectedStock(productSku: string) {
    try {
      const stockRows = await loadStockRows()
      const row = stockRows.find(
        (item) => item.product_sku === productSku && item.warehouse_code === warehouse
      )

      setProduct((current) => {
        if (!current || current.product_sku !== productSku) return current
        if (!row) {
          return {
            ...current,
            stock_box: 0,
            stock_piece: 0,
            stock_amount: 0,
          }
        }

        return {
          ...current,
          units_per_box: Number(row.units_per_box ?? current.units_per_box ?? 0),
          product_name: row.product_name ?? current.product_name,
          stock_box: Number(row.box ?? 0),
          stock_piece: Number(row.piece ?? 0),
          stock_amount: Number(row.amount ?? 0),
        }
      })
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "庫存重新讀取失敗")
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

  function changeMode(nextMode: Mode) {
    setMode(nextMode)
    setMessage("")
    setError("")
    setBoxQty("0")
    setPieceQty("0")
    setExpiryDate("")
    setProduct(null)
    setSearchKeyword("")
    setSearchResults([])

    if (nextMode === "backfill_inbound" && product) {
      void loadLatestUnitCost(product.product_sku).then(setUnitCost).catch((err) => {
        console.error(err)
        setUnitCost("")
      })
    } else {
      setUnitCost("")
    }
  }

  async function submitAdjustment() {
    if (submittingRef.current) return

    if (!product) {
      setError("請先加入商品")
      return
    }

    try {
      submittingRef.current = true
      setSaving(true)
      setError("")
      setMessage("")

      const qtyBox = Number(boxQty || "0")
      const qtyPiece = Number(pieceQty || "0")

      if (!isBox2Piece && !adjustDate) throw new Error("請選擇異動日期")
      if (!Number.isFinite(qtyBox) || qtyBox < 0) throw new Error("箱數不可小於 0")
      if (!Number.isFinite(qtyPiece) || qtyPiece < 0) throw new Error("散數不可小於 0")

      if (mode === "box2piece") {
        await createBox2Piece(qtyBox)
      } else {
        if (qtyBox === 0 && qtyPiece === 0) throw new Error("請輸入箱數或散數")

        if (mode === "backfill_inbound") {
          await createBackfillInbound(qtyBox, qtyPiece)
        } else {
          await createBackfillOutbound(qtyBox, qtyPiece)
        }
      }

      const rebuildStartDate = isBox2Piece ? getBusinessDateText() : adjustDate
      await rebuildAfterBackfill(rebuildStartDate)

      setMessage(`${modeLabel}已送出，已要求從 ${rebuildStartDate} 起重建關帳與試算表`)
      setProduct(null)
      setSearchKeyword("")
      setSearchResults([])
      setBoxQty("0")
      setPieceQty("0")
      setUnitCost("")
      setExpiryDate("")
    } catch (err) {
      console.error(err)
      setError(formatErrorMessage(err))
    } finally {
      submittingRef.current = false
      setSaving(false)
    }
  }

  async function createBackfillInbound(qtyBox: number, qtyPiece: number) {
    const cost = Number(unitCost)

    if (!Number.isFinite(cost) || cost <= 0) {
      throw new Error("請輸入大於 0 的單件成本")
    }

    if (isFood && !expiryDate) {
      throw new Error("食品補入庫請填寫效期")
    }

    const { error: inboundError } = await supabase.rpc("app_inbound_min_v2", {
      p_group: GROUP_CODE,
      p_sku: product?.product_sku,
      p_wh_code: warehouse,
      p_in_box: qtyBox,
      p_in_piece: qtyPiece,
      p_unit_cost_piece: cost,
      p_at: buildTaipeiTimestamp(adjustDate, "13"),
      p_source: "backfill_inbound",
      p_expiry_date: isFood ? expiryDate : null,
    })

    if (inboundError) throw inboundError
  }

  async function createBackfillOutbound(qtyBox: number, qtyPiece: number) {
    const { error: outboundError } = await supabase.rpc("rpc_outbound_min", {
      p_group_code: GROUP_CODE,
      p_warehouse_code: warehouse,
      p_product_sku: product?.product_sku,
      p_out_box: qtyBox,
      p_out_piece: qtyPiece,
      p_source: "backfill_outbound",
      p_at: buildTaipeiTimestamp(adjustDate, "14"),
    })

    if (outboundError) throw outboundError
  }

  async function createBox2Piece(qtyBox: number) {
    if (!Number.isFinite(qtyBox) || qtyBox <= 0) {
      throw new Error("請輸入要箱轉散的箱數")
    }

    if (!Number.isInteger(qtyBox)) {
      throw new Error("箱轉散箱數必須是整數")
    }

    const stockRows = await loadStockRows()
    const stockRow = stockRows.find(
      (item) =>
        item.product_sku === product?.product_sku && item.warehouse_code === warehouse
    )
    const stockBox = Number(stockRow?.box ?? 0)

    setProduct((current) => {
      if (!current) return current
      return {
        ...current,
        stock_box: stockBox,
        stock_piece: Number(stockRow?.piece ?? 0),
        stock_amount: Number(stockRow?.amount ?? 0),
      }
    })

    if (stockBox <= 0) throw new Error("此商品目前沒有可轉換的箱數庫存")
    if (qtyBox > stockBox) throw new Error("轉換箱數不可大於目前庫存箱數")

    const { error: box2PieceError } = await supabase.rpc("box2piece_min", {
      p_group: GROUP_CODE,
      p_sku: product?.product_sku,
      p_wh: warehouse,
      p_box: qtyBox,
      p_at: new Date().toISOString(),
    })

    if (box2PieceError) throw box2PieceError
  }

  async function rebuildAfterBackfill(startDate: string) {
    const { error: closingError } = await supabase.rpc("rebuild_closings_range_from", {
      p_group: GROUP_CODE,
      p_start_biz_date: startDate,
    })

    if (closingError) {
      throw new Error(`異動已寫入，但重建關帳失敗：${closingError.message}`)
    }

    const { error: gasError } = await supabase.rpc("push_gas_rebuild_range", {
      p_group: GROUP_CODE,
      p_start_date: startDate,
      p_end_date: getTodayText(),
      p_reason: mode,
    })

    if (gasError) {
      throw new Error(`異動已寫入且關帳已重建，但通知試算表失敗：${gasError.message}`)
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
            <h1 style={storeTitleStyle}>異動單</h1>
            <p style={subtitleStyle}>補入庫 13:00 / 補出庫 14:00 / 箱轉散即時</p>
          </div>
        </header>

        <div style={modeSwitchStyle}>
          <button
            onClick={() => changeMode("backfill_inbound")}
            style={mode === "backfill_inbound" ? activeModeButtonStyle : modeButtonStyle}
          >
            補入庫
          </button>
          <button
            onClick={() => changeMode("backfill_outbound")}
            style={mode === "backfill_outbound" ? activeModeButtonStyle : modeButtonStyle}
          >
            補出庫
          </button>
          <button
            onClick={() => changeMode("box2piece")}
            style={mode === "box2piece" ? activeModeButtonStyle : modeButtonStyle}
          >
            箱轉散
          </button>
        </div>

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
          {isBox2Piece ? "+ 選擇有庫存商品" : "+ 加入商品"}
        </button>

        {product && (
          <section style={productCardStyle}>
            <div style={productNameStyle}>{product.product_name}</div>
            <div style={productMetaStyle}>SKU：{product.product_sku}</div>
            <div style={productMetaStyle}>箱入數：{product.units_per_box || "-"}</div>
            {isBox2Piece && (
              <>
                <div style={productMetaStyle}>
                  庫存箱數：{formatNumber(product.stock_box ?? 0)}
                </div>
                <div style={productMetaStyle}>
                  庫存散數：{formatNumber(product.stock_piece ?? 0)}
                </div>
              </>
            )}
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
          {!isBox2Piece && (
            <>
              <label style={labelStyle}>異動日期</label>
              <input
                value={adjustDate}
                onChange={(event) => setAdjustDate(event.target.value)}
                type="date"
                style={inputStyle}
              />
            </>
          )}
          <div style={hintStyle}>
            {isBox2Piece
              ? "箱轉散會以送出當下時間寫入"
              : `資料寫入時間固定為 ${fixedTime}（台北時間）`}
          </div>

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
            style={{ ...inputStyle, color: "#bbb" }}
          />

          {isBox2Piece && (
            <>
              <label style={labelStyle}>目前庫存箱數</label>
              <input
                readOnly
                value={formatNumber(product?.stock_box ?? 0)}
                style={{ ...inputStyle, color: "#bbb" }}
              />

              <label style={labelStyle}>要轉成散數的箱數</label>
              <input
                value={boxQty}
                onChange={(event) => setBoxQty(event.target.value)}
                inputMode="numeric"
                type="number"
                min={0}
                step={1}
                max={Math.max(0, Number(product?.stock_box ?? 0))}
                style={inputStyle}
              />

              <label style={labelStyle}>轉換後新增散數</label>
              <input
                readOnly
                value={formatNumber(convertedPiece)}
                style={{ ...inputStyle, color: "#bbb" }}
              />

              <div style={hintBoxStyle}>箱轉散只允許箱轉散，不提供散轉箱。</div>
              {box2PieceWarning && (
                <div style={warningBoxStyle}>{box2PieceWarning}</div>
              )}
            </>
          )}

          {!isBox2Piece && (
            <div style={twoColumnStyle}>
              <div>
                <label style={labelStyle}>{isInbound ? "補入箱數" : "補出箱數"}</label>
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
                <label style={labelStyle}>{isInbound ? "補入散數" : "補出散數"}</label>
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
          )}

          {isInbound && (
            <>
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
            </>
          )}

          {isOutbound && (
            <div style={hintBoxStyle}>補出庫不填成本，成本會由既有庫存自動帶出。</div>
          )}
        </section>

        <button
          disabled={!canSubmit}
          onClick={submitAdjustment}
          style={{
            ...primaryButtonStyle,
            opacity: canSubmit ? 1 : 0.45,
          }}
        >
          {saving ? "送出中..." : `送出${modeLabel}`}
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
              <h2 style={sheetTitleStyle}>{isBox2Piece ? "搜尋有庫存商品" : "搜尋商品"}</h2>
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

            {loadingProduct && <div style={sheetHintStyle}>查詢商品中...</div>}

            {!loadingProduct && searchKeyword.trim().length === 0 && (
              <div style={sheetHintStyle}>請輸入 SKU、名稱或條碼</div>
            )}

            {searchResults.length > 0 && (
              <div style={resultListStyle}>
                {searchResults.map((row) => (
                  <button
                    key={row.product_sku}
                    onClick={() => void selectProduct(row)}
                    style={resultButtonStyle}
                  >
                    <span style={resultSkuStyle}>{row.product_sku}</span>
                    <span style={resultNameStyle}>
                      {row.product_name || "未命名商品"}
                    </span>
                    <span style={resultMetaStyle}>
                      箱入數：{row.units_per_box || "-"}
                    </span>
                    {isBox2Piece && (
                      <span style={resultMetaStyle}>
                        庫存箱數：{formatNumber(row.stock_box ?? 0)}
                      </span>
                    )}
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

function stockRowToProduct(row: StockRow): Product {
  return {
    product_sku: row.product_sku,
    product_name: row.product_name ?? "",
    units_per_box: Number(row.units_per_box ?? 0),
    tags: [],
    stock_box: Number(row.box ?? 0),
    stock_piece: Number(row.piece ?? 0),
    stock_amount: Number(row.amount ?? 0),
  }
}

function dedupeProducts(rows: Product[]) {
  return rows.filter(
    (row, index, allRows) =>
      allRows.findIndex((item) => item.product_sku === row.product_sku) === index
  )
}

function buildTaipeiTimestamp(dateText: string, hour: "12" | "13" | "14") {
  return `${dateText}T${hour}:00:00+08:00`
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

function getBusinessDateText() {
  const now = new Date()
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now)

  const year = parts.find((part) => part.type === "year")?.value ?? ""
  const month = parts.find((part) => part.type === "month")?.value ?? ""
  const day = parts.find((part) => part.type === "day")?.value ?? ""
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0")

  const base = new Date(`${year}-${month}-${day}T12:00:00+08:00`)
  if (hour < 5) base.setDate(base.getDate() - 1)

  const businessYear = base.getFullYear()
  const businessMonth = String(base.getMonth() + 1).padStart(2, "0")
  const businessDay = String(base.getDate()).padStart(2, "0")

  return `${businessYear}-${businessMonth}-${businessDay}`
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value)
}

function formatErrorMessage(err: unknown) {
  const message = err instanceof Error ? err.message : "異動單送出失敗"

  if (message.includes("ERR_QTY_ZERO")) return "請輸入箱數或散數"
  if (message.includes("ERR_BAD_COST")) return "請輸入正確的單件成本"
  if (message.includes("ERR_UNIT_COST_REQUIRED")) return "找不到可用成本，請先確認庫存成本"
  if (message.includes("ERR_PRODUCT_NOT_FOUND")) return "找不到此商品"
  if (message.includes("ERR_EXPIRY_REQUIRED")) return "此食品補入庫需要填寫效期"
  if (message.includes("box2piece_min: empty sku")) return "請先選擇商品"
  if (message.includes("box2piece_min: p_box must be > 0")) return "請輸入要轉換的箱數"
  if (message.includes("box2piece_min: p_box must be an integer")) {
    return "箱轉散箱數必須是整數"
  }
  if (message.includes("box2piece_min: insufficient box stock")) {
    return "庫存箱數不足，請重新查詢目前庫存"
  }
  if (message.includes("box2piece_min: current stock is negative")) {
    return "目前庫存已有負數異常，請先校正庫存後再轉換"
  }
  if (message.includes("box2piece_min: invalid units_per_box")) {
    return "此商品箱入數異常，無法箱轉散"
  }

  return message
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
  maxWidth: 560,
  margin: "0 auto",
}

const headerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "36px minmax(0, 1fr)",
  alignItems: "center",
  gap: 12,
  marginBottom: 16,
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

const subtitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#999",
  fontSize: 13,
  fontWeight: 700,
}

const modeSwitchStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 8,
  borderRadius: 14,
  background: "#151515",
  border: "1px solid #2c2c2c",
  padding: 6,
  marginBottom: 14,
}

const modeButtonStyle: CSSProperties = {
  minHeight: 42,
  border: "none",
  borderRadius: 10,
  background: "transparent",
  color: "#aaa",
  fontSize: 15,
  fontWeight: 800,
}

const activeModeButtonStyle: CSSProperties = {
  ...modeButtonStyle,
  background: "#5aa2ff",
  color: "#fff",
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
  fontSize: 16,
  padding: "0 12px",
  boxSizing: "border-box",
}

const hintStyle: CSSProperties = {
  color: "#999",
  fontSize: 13,
}

const hintBoxStyle: CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  background: "#101010",
  color: "#aaa",
  fontSize: 13,
  padding: 12,
}

const warningBoxStyle: CSSProperties = {
  border: "1px solid rgba(248,113,113,0.36)",
  borderRadius: 12,
  background: "rgba(248,113,113,0.12)",
  color: "#ffb4b4",
  fontSize: 13,
  padding: 12,
  marginTop: 10,
}

const addProductButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 56,
  borderRadius: 18,
  border: "1px solid #3d3d3d",
  background: "#303030",
  color: "#fff",
  fontSize: 17,
  marginBottom: 14,
}

const productCardStyle: CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  background: "#0f0f0f",
  padding: 12,
  marginBottom: 14,
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

const sheetHintStyle: CSSProperties = {
  color: "#999",
  fontSize: 13,
  marginTop: 18,
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
