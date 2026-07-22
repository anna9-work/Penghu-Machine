import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabase"

type Props = {
  onBack: () => void
}

type Product = {
  product_sku: string
  product_name: string
  units_per_box: number
  enabled: boolean
  category: string | null
  tags: string[]
  barcodes: ProductBarcode[]
}

type ProductBarcode = {
  id: number
  barcode: string
}

type ProductFormValues = {
  sku: string
  name: string
  unitsPerBox: string
  enabled: boolean
  tags: string[]
  newBarcode: string
}

type ProductRow = {
  product_sku: string
  product_name: string | null
  units_per_box: number | null
  enabled: boolean | null
  category: string | null
  tags: string[] | null
}

type BarcodeRow = {
  id: number
  product_sku: string
  barcode: string
}

type Filter = "all" | "enabled" | "disabled"
type Mode = "list" | "detail"

const TAG_OPTIONS = ["代夾物", "食品", "百貨", "娃娃"]
const PRODUCT_RESULT_LIMIT = 50

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

export default function ProductManage({ onBack }: Props) {
  const isDesktop = useIsDesktop()
  const [mode, setMode] = useState<Mode>("list")
  const [products, setProducts] = useState<Product[]>([])
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    let cancelled = false

    const timer = window.setTimeout(() => {
      loadProducts(query, filter, () => cancelled)
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [filter, query])

  const filteredProducts = useMemo(() => {
    return products.slice(0, PRODUCT_RESULT_LIMIT)
  }, [products])

  function applyEnabledFilter(
    request: any,
    activeFilter: Filter
  ) {
    if (activeFilter === "enabled") return request.eq("enabled", true)
    if (activeFilter === "disabled") return request.eq("enabled", false)
    return request
  }

  function mergeProductRows(rowGroups: ProductRow[][]) {
    const map = new Map<string, ProductRow>()

    rowGroups.flat().forEach((row) => {
      if (!row.product_sku) return
      map.set(row.product_sku, row)
    })

    return Array.from(map.values()).sort((a, b) =>
      a.product_sku.localeCompare(b.product_sku)
    )
  }

  async function searchProductsByColumn(
    column: "product_sku" | "product_name",
    keyword: string,
    activeFilter: Filter
  ) {
    let request = supabase
      .from("products")
      .select("product_sku,product_name,units_per_box,enabled,category,tags")
      .ilike(column, `%${keyword}%`)
      .order("product_sku", { ascending: true })
      .limit(PRODUCT_RESULT_LIMIT)

    request = applyEnabledFilter(request, activeFilter)

    const { data, error } = await request
    if (error) throw error

    return (data ?? []) as ProductRow[]
  }

  async function searchProductsByBarcode(keyword: string, activeFilter: Filter) {
    const { data: barcodeRows, error: barcodeError } = await supabase
      .from("product_barcodes")
      .select("product_sku")
      .eq("enabled", true)
      .ilike("barcode", `%${keyword}%`)
      .limit(PRODUCT_RESULT_LIMIT)

    if (barcodeError) throw barcodeError

    const skuList = Array.from(
      new Set((barcodeRows ?? []).map((row) => row.product_sku).filter(Boolean))
    )

    if (skuList.length === 0) return []

    let request = supabase
      .from("products")
      .select("product_sku,product_name,units_per_box,enabled,category,tags")
      .in("product_sku", skuList)
      .order("product_sku", { ascending: true })

    request = applyEnabledFilter(request, activeFilter)

    const { data, error } = await request
    if (error) throw error

    return (data ?? []) as ProductRow[]
  }

  async function loadProducts(
    searchText = query,
    activeFilter = filter,
    shouldCancel = () => false
  ) {
    try {
      setLoading(true)
      setError("")

      const keyword = searchText.trim()
      let rows: ProductRow[] = []

      if (keyword) {
        const [skuRows, nameRows, barcodeRows] = await Promise.all([
          searchProductsByColumn("product_sku", keyword, activeFilter),
          searchProductsByColumn("product_name", keyword, activeFilter),
          searchProductsByBarcode(keyword, activeFilter),
        ])

        rows = mergeProductRows([skuRows, nameRows, barcodeRows])
      } else {
        let request = supabase
          .from("products")
          .select("product_sku,product_name,units_per_box,enabled,category,tags")
          .order("product_sku", { ascending: true })
          .limit(PRODUCT_RESULT_LIMIT)

        request = applyEnabledFilter(request, activeFilter)

        const { data: productData, error: productError } = await request
        if (productError) throw productError

        rows = (productData ?? []) as ProductRow[]
      }

      if (shouldCancel()) return

      const skuList = Array.from(new Set(rows.map((product) => product.product_sku)))
      let barcodeMap = new Map<string, ProductBarcode[]>()

      if (skuList.length > 0) {
        const { data: barcodeData, error: barcodeError } = await supabase
          .from("product_barcodes")
          .select("id,product_sku,barcode")
          .eq("enabled", true)
          .in("product_sku", skuList)
          .order("barcode", { ascending: true })

        if (barcodeError) throw barcodeError
        if (shouldCancel()) return

        barcodeMap = (barcodeData ?? []).reduce((map, row) => {
          const barcodeRow = row as BarcodeRow
          const current = map.get(barcodeRow.product_sku) ?? []
          map.set(barcodeRow.product_sku, [
            ...current,
            {
              id: barcodeRow.id,
              barcode: barcodeRow.barcode,
            },
          ])
          return map
        }, new Map<string, ProductBarcode[]>())
      }

      const nextProducts = rows
        .slice(0, PRODUCT_RESULT_LIMIT)
        .map((product) => ({
          product_sku: product.product_sku,
          product_name: product.product_name ?? "",
          units_per_box: product.units_per_box ?? 0,
          enabled: product.enabled !== false,
          category: product.category,
          tags: product.tags ?? [],
          barcodes: barcodeMap.get(product.product_sku) ?? [],
        }))

      if (!shouldCancel()) setProducts(nextProducts)
    } catch (err) {
      if (shouldCancel()) return
      console.error(err)
      setError(err instanceof Error ? err.message : "商品讀取失敗")
    } finally {
      if (!shouldCancel()) setLoading(false)
    }
  }

  function openNewForm() {
    setSelectedProduct(null)
    setMode("detail")
    setMessage("")
    setError("")
  }

  function openDetail(product: Product) {
    setSelectedProduct(product)
    setMode("detail")
    setMessage("")
    setError("")
  }

  function closeDetail() {
    setSelectedProduct(null)
    setMode("list")
  }

  async function saveProduct(product: Product | null, values: ProductFormValues) {
    try {
      setError("")
      setMessage("")

      const sku = values.sku.trim().toLowerCase()
      const productName = values.name.trim()
      const unitsPerBox = Number(values.unitsPerBox)
      const newBarcode = values.newBarcode.trim()

      if (!sku) throw new Error("請輸入 SKU")
      if (!productName) throw new Error("請輸入品名")
      if (!Number.isInteger(unitsPerBox) || unitsPerBox <= 0) {
        throw new Error("箱入數必須是大於 0 的整數")
      }

      if (!product) {
        const { data: existingProduct, error: checkError } = await supabase
          .from("products")
          .select("product_sku")
          .eq("product_sku", sku)
          .maybeSingle()

        if (checkError) throw checkError
        if (existingProduct) throw new Error("這個 SKU 已存在，請換一個")

        const { error: insertError } = await supabase.from("products").insert({
          product_sku: sku,
          product_name: productName,
          units_per_box: unitsPerBox,
          enabled: values.enabled,
          tags: values.tags,
          category: null,
        })

        if (insertError) throw insertError
      } else {
        const { error: updateError } = await supabase
          .from("products")
          .update({
            product_name: productName,
            units_per_box: unitsPerBox,
            enabled: values.enabled,
            tags: values.tags,
            updated_at: new Date().toISOString(),
          })
          .eq("product_sku", product.product_sku)

        if (updateError) throw updateError
      }

      if (newBarcode) {
        const { error: barcodeError } = await supabase.from("product_barcodes").insert({
          product_sku: product?.product_sku ?? sku,
          barcode: newBarcode,
          enabled: true,
        })

        if (barcodeError) throw barcodeError
      }

      await loadProducts()
      setMessage(product ? "商品已儲存" : "商品已新增")
      closeDetail()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "商品儲存失敗")
    }
  }

  async function deleteProduct(product: Product) {
    try {
      setError("")
      setMessage("")

      const { error: barcodeError } = await supabase
        .from("product_barcodes")
        .delete()
        .eq("product_sku", product.product_sku)

      if (barcodeError) throw barcodeError

      const { error: productError } = await supabase
        .from("products")
        .delete()
        .eq("product_sku", product.product_sku)

      if (productError) throw productError

      await loadProducts()
      setMessage("商品已刪除")
      closeDetail()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "商品刪除失敗")
    }
  }

  async function deleteBarcode(barcodeId: number) {
    try {
      setError("")
      setMessage("")

      const { error: barcodeError } = await supabase
        .from("product_barcodes")
        .delete()
        .eq("id", barcodeId)

      if (barcodeError) throw barcodeError

      setSelectedProduct((current) =>
        current
          ? {
              ...current,
              barcodes: current.barcodes.filter((barcode) => barcode.id !== barcodeId),
            }
          : current
      )
      setProducts((current) =>
        current.map((product) => ({
          ...product,
          barcodes: product.barcodes.filter((barcode) => barcode.id !== barcodeId),
        }))
      )
      setMessage("條碼已刪除")
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "條碼刪除失敗")
    }
  }

  return (
    <main style={{ ...pageStyle, ...(isDesktop ? desktopPageStyle : {}) }}>
      {message && <div style={messageStyle}>{message}</div>}
      {error && <div style={errorStyle}>{error}</div>}

      {mode === "list" && (
        <>
          <header style={{ ...topBarStyle, ...(isDesktop ? desktopTopBarStyle : {}) }}>
            <button
              aria-label="返回首頁"
              onClick={onBack}
              style={{
                ...ghostButtonStyle,
                ...(isDesktop ? desktopGhostButtonStyle : {}),
              }}
            >
              &lt;
            </button>

            {isDesktop && (
              <div style={desktopHeadingStyle}>
                <div style={desktopEyebrowStyle}>PRODUCT DATABASE</div>
                <h1 style={desktopTitleStyle}>商品管理</h1>
                <p style={desktopDescriptionStyle}>
                  管理商品啟用狀態、箱入數、條碼與分類標籤。
                </p>
              </div>
            )}

            <button
              aria-label="新增商品"
              onClick={openNewForm}
              style={{
                ...addButtonStyle,
                ...(isDesktop ? desktopAddButtonStyle : {}),
              }}
            >
              {isDesktop ? "新增商品" : "+"}
            </button>
          </header>

          <div style={{ ...(isDesktop ? desktopToolbarStyle : {}) }}>
            <label
              style={{
                ...searchWrapStyle,
                ...(isDesktop ? desktopSearchWrapStyle : {}),
              }}
            >
              <span style={searchIconStyle}>⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜尋 sku / 品名 / 條碼（直接查詢資料庫）"
                style={{
                  ...searchInputStyle,
                  ...(isDesktop ? desktopSearchInputStyle : {}),
                }}
              />
            </label>

            <div
              style={{
                ...filterRowStyle,
                ...(isDesktop ? desktopFilterRowStyle : {}),
              }}
            >
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
                全部
              </FilterChip>
              <FilterChip active={filter === "enabled"} onClick={() => setFilter("enabled")}>
                啟用
              </FilterChip>
              <FilterChip active={filter === "disabled"} onClick={() => setFilter("disabled")}>
                停用
              </FilterChip>
            </div>
          </div>

          {loading && <div style={emptyStyle}>商品資料載入中...</div>}

          {!loading && (
            <section style={{ ...listStyle, ...(isDesktop ? desktopListStyle : {}) }}>
              {filteredProducts.map((product) => (
                <button
                  key={product.product_sku}
                  onClick={() => openDetail(product)}
                  style={{
                    ...productCardStyle,
                    ...(isDesktop ? desktopProductCardStyle : {}),
                  }}
                >
                  <span
                    style={{
                      ...statusDotStyle,
                      background: product.enabled ? "#16c765" : "#64748b",
                      boxShadow: product.enabled
                        ? "0 0 0 7px rgba(22,199,101,0.12)"
                        : "0 0 0 7px rgba(100,116,139,0.12)",
                    }}
                  />
                  <div style={skuStyle}>{product.product_sku}</div>
                  <div style={nameStyle}>{product.product_name || "未命名商品"}</div>

                  <div style={metricGridStyle}>
                    <div style={metricBoxStyle}>
                      <div style={metricLabelStyle}>箱入數</div>
                      <div style={metricValueStyle}>
                        {product.units_per_box || "-"}
                      </div>
                    </div>
                    <div style={metricBoxStyle}>
                      <div style={metricLabelStyle}>條碼</div>
                      <div style={barcodeValueStyle}>
                        {product.barcodes[0]?.barcode ?? "-"}
                      </div>
                    </div>
                  </div>
                </button>
              ))}

              {filteredProducts.length === 0 && (
                <div style={emptyStyle}>
                  {query.trim() ? "沒有符合的商品" : "請輸入關鍵字搜尋更多商品"}
                </div>
              )}
            </section>
          )}
        </>
      )}

      {mode === "detail" && (
        <ProductDetail
          isDesktop={isDesktop}
          product={selectedProduct}
          onCancel={closeDetail}
          onDeleteBarcode={deleteBarcode}
          onDeleteProduct={deleteProduct}
          onSubmit={saveProduct}
        />
      )}
    </main>
  )
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean
  children: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...filterChipStyle,
        background: active ? "#5aa2ff" : "rgba(255,255,255,0.06)",
        borderColor: active ? "#5aa2ff" : "rgba(255,255,255,0.13)",
        color: active ? "#ffffff" : "#f4f7fb",
      }}
    >
      {children}
    </button>
  )
}

function ProductDetail({
  isDesktop,
  product,
  onCancel,
  onDeleteBarcode,
  onDeleteProduct,
  onSubmit,
}: {
  isDesktop: boolean
  product: Product | null
  onCancel: () => void
  onDeleteBarcode: (barcodeId: number) => Promise<void>
  onDeleteProduct: (product: Product) => Promise<void>
  onSubmit: (product: Product | null, values: ProductFormValues) => Promise<void>
}) {
  const [sku, setSku] = useState(product?.product_sku ?? "")
  const [name, setName] = useState(product?.product_name ?? "")
  const [unitsPerBox, setUnitsPerBox] = useState(
    product?.units_per_box ? String(product.units_per_box) : ""
  )
  const [enabled, setEnabled] = useState(product?.enabled ?? true)
  const [selectedTags, setSelectedTags] = useState<string[]>(product?.tags ?? [])
  const [newBarcode, setNewBarcode] = useState("")
  const [skuStatus, setSkuStatus] = useState<
    "idle" | "checking" | "available" | "taken"
  >("idle")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (product) return

    const normalizedSku = sku.trim().toLowerCase()
    if (!normalizedSku) {
      setSkuStatus("idle")
      return
    }

    let cancelled = false
    setSkuStatus("checking")

    const timer = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from("products")
        .select("product_sku")
        .eq("product_sku", normalizedSku)
        .maybeSingle()

      if (cancelled) return

      if (error) {
        setSkuStatus("idle")
        return
      }

      setSkuStatus(data ? "taken" : "available")
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [product, sku])

  function toggleTag(tag: string) {
    setSelectedTags((current) =>
      current.includes(tag)
        ? current.filter((currentTag) => currentTag !== tag)
        : [...current, tag]
    )
  }

  async function handleSubmit() {
    try {
      setBusy(true)
      await onSubmit(product, {
        sku,
        name,
        unitsPerBox,
        enabled,
        tags: selectedTags,
        newBarcode,
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteProduct() {
    if (!product) return
    const confirmed = window.confirm(`確定要刪除商品 ${product.product_sku}？`)
    if (!confirmed) return

    try {
      setBusy(true)
      await onDeleteProduct(product)
    } finally {
      setBusy(false)
    }
  }

  async function handleDeleteBarcode(barcode: ProductBarcode) {
    const confirmed = window.confirm(`確定要刪除條碼 ${barcode.barcode}？`)
    if (!confirmed) return

    try {
      setBusy(true)
      await onDeleteBarcode(barcode.id)
    } finally {
      setBusy(false)
    }
  }

  const canSave =
    !busy &&
    Boolean(sku.trim()) &&
    Boolean(name.trim()) &&
    Boolean(unitsPerBox.trim()) &&
    (Boolean(product) || skuStatus === "available")

  const skuStatusText = product
    ? "商品建立後 SKU 不可修改"
    : skuStatus === "checking"
      ? "檢查 SKU 中..."
      : skuStatus === "available"
        ? "此 SKU 可使用"
        : skuStatus === "taken"
          ? "此 SKU 已存在"
          : "輸入後會自動檢查是否可用"

  return (
    <section style={{ ...detailShellStyle, ...(isDesktop ? desktopDetailShellStyle : {}) }}>
      <div style={{ ...detailPanelStyle, ...(isDesktop ? desktopDetailPanelStyle : {}) }}>
        <div style={{ ...detailHeaderStyle, ...(isDesktop ? desktopDetailHeaderStyle : {}) }}>
          <h1 style={detailTitleStyle}>
            商品詳情：{product?.product_sku || "新增"}
          </h1>
          <button aria-label="關閉" onClick={onCancel} style={closeButtonStyle}>
            ×
          </button>
        </div>

        <div style={isDesktop ? desktopFormGridStyle : undefined}>
          <label style={fieldStyle}>
            <span style={labelStyle}>sku（必填、強制 lowercase）</span>
            <input
              value={sku}
              onChange={(event) => setSku(event.target.value.toLowerCase())}
              placeholder="0330-1"
              style={{
                ...inputStyle,
                ...(isDesktop ? desktopInputStyle : {}),
                opacity: product ? 0.52 : 1,
              }}
              disabled={Boolean(product)}
            />
            <span
              style={{
                ...hintStyle,
                color:
                  !product && skuStatus === "available"
                    ? "#86efac"
                    : !product && skuStatus === "taken"
                      ? "#ff6666"
                      : "#999",
              }}
            >
              {skuStatusText}
            </span>
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>品名（必填）</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="商品名稱"
              style={{
                ...inputStyle,
                ...(isDesktop ? desktopInputStyle : {}),
              }}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>箱入數（必填）</span>
            <input
              inputMode="numeric"
              value={unitsPerBox}
              onChange={(event) => setUnitsPerBox(event.target.value)}
              placeholder="480"
              style={{
                ...inputStyle,
                ...(isDesktop ? desktopInputStyle : {}),
              }}
            />
          </label>

          <label style={{ ...enabledRowStyle, ...(isDesktop ? desktopEnabledRowStyle : {}) }}>
            <input
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              style={checkboxStyle}
              type="checkbox"
            />
            <span>啟用</span>
          </label>
        </div>

        <div style={fieldStyle}>
          <div style={labelStyle}>標籤（可複選）</div>
          <div style={tagRowStyle}>
            {TAG_OPTIONS.map((tag) => {
              const active = selectedTags.includes(tag)
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  style={{
                    ...tagButtonStyle,
                    background: active ? "#5aa2ff" : "rgba(255,255,255,0.07)",
                    borderColor: active ? "#5aa2ff" : "rgba(255,255,255,0.15)",
                  }}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </div>

        <label style={fieldStyle}>
          <span style={labelStyle}>新增條碼（選填）</span>
          <input
            value={newBarcode}
            onChange={(event) => setNewBarcode(event.target.value)}
            placeholder="掃描或輸入條碼"
            style={{
              ...inputStyle,
              ...(isDesktop ? desktopInputStyle : {}),
            }}
          />
        </label>

        <div style={boundBoxStyle}>
          <div style={boundTitleStyle}>已綁定條碼</div>
          {product?.barcodes.length ? (
            <div style={barcodeListStyle}>
              {product.barcodes.map((barcode) => (
                <div key={barcode.id} style={barcodeRowStyle}>
                  <span style={boundBarcodeStyle}>{barcode.barcode}</span>
                  <button
                    disabled={busy}
                    onClick={() => handleDeleteBarcode(barcode)}
                    style={smallDangerButtonStyle}
                  >
                    刪除
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={boundEmptyStyle}>目前沒有條碼</div>
          )}
        </div>

        {product && (
          <button
            disabled={busy}
            onClick={handleDeleteProduct}
            style={dangerButtonStyle}
          >
            刪除商品
          </button>
        )}

        <div style={actionRowStyle}>
          <button onClick={onCancel} style={secondaryButtonStyle}>
            取消
          </button>
          <button
            disabled={!canSave}
            onClick={handleSubmit}
            style={{
              ...primaryButtonStyle,
              opacity: canSave ? 1 : 0.45,
            }}
          >
            {busy ? "處理中..." : "儲存"}
          </button>
        </div>
      </div>
    </section>
  )
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "#0f0f0f",
  color: "#fff",
  padding: "calc(env(safe-area-inset-top, 0px) + 44px) 16px 24px",
  boxSizing: "border-box",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const desktopPageStyle: CSSProperties = {
  padding: "44px 24px 32px",
}

const topBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  maxWidth: 520,
  margin: "0 auto 20px",
}

const desktopTopBarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "72px minmax(0, 1fr) 120px",
  gap: 16,
  maxWidth: 1120,
  margin: "0 auto 20px",
}

const desktopHeadingStyle: CSSProperties = {
  minWidth: 0,
}

const desktopEyebrowStyle: CSSProperties = {
  color: "#999",
  fontSize: 12,
}

const desktopTitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#fff",
  fontSize: 22,
  fontWeight: 700,
  lineHeight: 1.2,
}

const desktopDescriptionStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#999",
  fontSize: 14,
}

const ghostButtonStyle: CSSProperties = {
  background: "transparent",
  color: "#fff",
  border: "none",
  fontSize: 18,
  padding: 0,
}

const desktopGhostButtonStyle: CSSProperties = {
  height: 40,
  border: "1px solid #333",
  borderRadius: 12,
  background: "#1a1a1a",
}

const addButtonStyle: CSSProperties = {
  background: "transparent",
  color: "#5aa2ff",
  border: "none",
  fontSize: 28,
  fontWeight: 700,
  padding: 0,
}

const desktopAddButtonStyle: CSSProperties = {
  width: "100%",
  height: 40,
  borderRadius: 12,
  border: "none",
  background: "#fff",
  color: "#111",
  fontSize: 15,
  fontWeight: 700,
}

const desktopToolbarStyle: CSSProperties = {
  width: "100%",
  maxWidth: 1120,
  margin: "0 auto 18px",
  display: "grid",
  gridTemplateColumns: "minmax(280px, 1fr) auto",
  gap: 12,
  alignItems: "center",
}

const searchWrapStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  height: 46,
  margin: "0 auto 14px",
  display: "flex",
  alignItems: "center",
  borderRadius: 12,
  border: "1px solid #444",
  background: "#0f0f0f",
}

const desktopSearchWrapStyle: CSSProperties = {
  maxWidth: "none",
  margin: 0,
}

const searchIconStyle: CSSProperties = {
  width: 38,
  color: "#999",
  textAlign: "center",
  fontSize: 18,
}

const searchInputStyle: CSSProperties = {
  minWidth: 0,
  width: "100%",
  height: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  color: "#fff",
  fontSize: 16,
}

const desktopSearchInputStyle: CSSProperties = {
  fontSize: 15,
}

const filterRowStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  margin: "0 auto 20px",
  display: "flex",
  gap: 10,
}

const desktopFilterRowStyle: CSSProperties = {
  width: "auto",
  maxWidth: "none",
  margin: 0,
  justifyContent: "flex-end",
}

const filterChipStyle: CSSProperties = {
  minWidth: 64,
  height: 38,
  padding: "0 14px",
  borderRadius: 12,
  border: "1px solid",
  fontSize: 15,
  fontWeight: 700,
}

const listStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  margin: "0 auto",
  display: "grid",
  gap: 14,
}

const desktopListStyle: CSSProperties = {
  maxWidth: 1120,
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
}

const productCardStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  border: "1px solid #333",
  borderRadius: 16,
  background: "#1a1a1a",
  color: "#fff",
  padding: 16,
  textAlign: "left",
}

const desktopProductCardStyle: CSSProperties = {
  minHeight: 150,
}

const statusDotStyle: CSSProperties = {
  position: "absolute",
  top: 18,
  right: 18,
  width: 12,
  height: 12,
  borderRadius: 999,
}

const skuStyle: CSSProperties = {
  maxWidth: "calc(100% - 30px)",
  overflowWrap: "anywhere",
  color: "#fff",
  fontSize: 18,
  fontWeight: 700,
  lineHeight: 1.2,
  letterSpacing: 0,
}

const nameStyle: CSSProperties = {
  marginTop: 6,
  color: "#ddd",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.35,
  overflowWrap: "anywhere",
}

const metricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 10,
  marginTop: 14,
}

const metricBoxStyle: CSSProperties = {
  minWidth: 0,
  border: "1px solid #333",
  borderRadius: 12,
  background: "#0f0f0f",
  padding: "10px 12px",
  boxSizing: "border-box",
}

const metricLabelStyle: CSSProperties = {
  color: "#bbb",
  fontSize: 13,
}

const metricValueStyle: CSSProperties = {
  marginTop: 6,
  color: "#fff",
  fontSize: 18,
  fontWeight: 700,
  lineHeight: 1.2,
}

const barcodeValueStyle: CSSProperties = {
  ...metricValueStyle,
  fontSize: 15,
  overflowWrap: "anywhere",
}

const detailShellStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  margin: "0 auto",
}

const desktopDetailShellStyle: CSSProperties = {
  maxWidth: 900,
}

const detailPanelStyle: CSSProperties = {
  border: "1px solid #333",
  borderRadius: 16,
  background: "#1a1a1a",
  padding: 16,
}

const desktopDetailPanelStyle: CSSProperties = {
  padding: 20,
}

const detailHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 46px",
  alignItems: "center",
  gap: 12,
  marginBottom: 20,
}

const desktopDetailHeaderStyle: CSSProperties = {
  gridTemplateColumns: "minmax(0, 1fr) 46px",
}

const detailTitleStyle: CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 20,
  fontWeight: 700,
  lineHeight: 1.2,
  overflowWrap: "anywhere",
}

const closeButtonStyle: CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 12,
  border: "1px solid #444",
  background: "#222",
  color: "#fff",
  fontSize: 24,
}

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  marginBottom: 14,
}

const desktopFormGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  columnGap: 14,
}

const labelStyle: CSSProperties = {
  color: "#bbb",
  fontSize: 14,
}

const hintStyle: CSSProperties = {
  fontSize: 13,
}

const inputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  height: 46,
  borderRadius: 12,
  border: "1px solid #444",
  outline: "none",
  background: "#0f0f0f",
  color: "#fff",
  padding: "0 12px",
  boxSizing: "border-box",
  fontSize: 18,
}

const desktopInputStyle: CSSProperties = {
  fontSize: 16,
}

const enabledRowStyle: CSSProperties = {
  minHeight: 46,
  display: "flex",
  alignItems: "center",
  gap: 10,
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 14,
}

const desktopEnabledRowStyle: CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  background: "#0f0f0f",
  padding: "0 12px",
  boxSizing: "border-box",
}

const checkboxStyle: CSSProperties = {
  width: 22,
  height: 22,
  accentColor: "#2f9bff",
}

const tagRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
}

const tagButtonStyle: CSSProperties = {
  minWidth: 72,
  height: 40,
  borderRadius: 12,
  border: "1px solid",
  color: "#fff",
  fontSize: 14,
  fontWeight: 700,
}

const boundBoxStyle: CSSProperties = {
  border: "1px solid #333",
  borderRadius: 12,
  background: "#0f0f0f",
  padding: 14,
  marginBottom: 20,
}

const boundTitleStyle: CSSProperties = {
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
  marginBottom: 10,
}

const barcodeListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
}

const barcodeRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 58px",
  gap: 8,
  alignItems: "center",
}

const boundBarcodeStyle: CSSProperties = {
  color: "#ddd",
  fontSize: 14,
  overflowWrap: "anywhere",
}

const boundEmptyStyle: CSSProperties = {
  color: "#999",
  fontSize: 14,
}

const actionRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 10,
}

const smallDangerButtonStyle: CSSProperties = {
  height: 34,
  borderRadius: 10,
  border: "1px solid rgba(255,102,102,0.35)",
  background: "rgba(255,102,102,0.12)",
  color: "#ff9999",
  fontSize: 13,
}

const dangerButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 46,
  borderRadius: 12,
  border: "1px solid rgba(255,102,102,0.35)",
  background: "rgba(255,102,102,0.12)",
  color: "#ff9999",
  fontSize: 15,
  fontWeight: 700,
  marginBottom: 12,
}

const secondaryButtonStyle: CSSProperties = {
  minHeight: 54,
  borderRadius: 16,
  border: "1px solid #333",
  background: "#222",
  color: "#fff",
  fontSize: 16,
  fontWeight: 700,
}

const primaryButtonStyle: CSSProperties = {
  minHeight: 54,
  borderRadius: 16,
  border: "none",
  background: "#fff",
  color: "#111",
  fontSize: 16,
  fontWeight: 700,
}

const emptyStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  margin: "0 auto",
  border: "1px dashed #444",
  borderRadius: 16,
  color: "#999",
  padding: 16,
  textAlign: "center",
  boxSizing: "border-box",
  fontSize: 14,
}

const messageStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  margin: "0 auto 14px",
  background: "rgba(90,162,255,0.12)",
  color: "#bfdbfe",
  border: "1px solid rgba(90,162,255,0.28)",
  borderRadius: 12,
  padding: 12,
  boxSizing: "border-box",
  fontSize: 14,
}

const errorStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  margin: "0 auto 14px",
  background: "rgba(248,113,113,0.12)",
  color: "#ff6666",
  border: "1px solid rgba(248,113,113,0.28)",
  borderRadius: 12,
  padding: 12,
  boxSizing: "border-box",
  fontSize: 14,
}
