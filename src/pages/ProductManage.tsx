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

type ImportDraftRow = {
  rowNumber: number
  sku: string
  name: string
  unitsPerBox: number
  barcode: string
  enabled: boolean
  errors: string[]
}

type Mode = "list" | "detail" | "import"

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
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    let cancelled = false

    const timer = window.setTimeout(() => {
      loadProducts(query, () => cancelled)
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  const filteredProducts = useMemo(() => {
    return products.slice(0, PRODUCT_RESULT_LIMIT)
  }, [products])

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
    keyword: string
  ) {
    const request = supabase
      .from("products")
      .select("product_sku,product_name,units_per_box,enabled,category,tags")
      .ilike(column, `%${keyword}%`)
      .order("product_sku", { ascending: true })
      .limit(PRODUCT_RESULT_LIMIT)

    const { data, error } = await request
    if (error) throw error

    return (data ?? []) as ProductRow[]
  }

  async function searchProductsByBarcode(keyword: string) {
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

    const request = supabase
      .from("products")
      .select("product_sku,product_name,units_per_box,enabled,category,tags")
      .in("product_sku", skuList)
      .order("product_sku", { ascending: true })

    const { data, error } = await request
    if (error) throw error

    return (data ?? []) as ProductRow[]
  }

  async function loadProducts(
    searchText = query,
    shouldCancel = () => false
  ) {
    try {
      setLoading(true)
      setError("")

      const keyword = searchText.trim()
      let rows: ProductRow[] = []

      if (keyword) {
        const [skuRows, nameRows, barcodeRows] = await Promise.all([
          searchProductsByColumn("product_sku", keyword),
          searchProductsByColumn("product_name", keyword),
          searchProductsByBarcode(keyword),
        ])

        rows = mergeProductRows([skuRows, nameRows, barcodeRows])
      } else {
        const request = supabase
          .from("products")
          .select("product_sku,product_name,units_per_box,enabled,category,tags")
          .order("product_sku", { ascending: true })
          .limit(PRODUCT_RESULT_LIMIT)

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

  function openImportPage() {
    setMode("import")
    setMessage("")
    setError("")
  }

  function closeImportPage() {
    setMode("list")
  }

  async function handleImportDone(importMessage: string) {
    await loadProducts()
    setMessage(importMessage)
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
              ←
            </button>

            <h1 style={{ ...pageTitleStyle, ...(isDesktop ? desktopPageTitleStyle : {}) }}>
              商品管理
            </h1>

            <button
              aria-label="新增商品"
              onClick={openNewForm}
              style={{
                ...addButtonStyle,
                ...(isDesktop ? desktopAddButtonStyle : {}),
              }}
            >
              +
            </button>
          </header>

          <div style={{ ...(isDesktop ? desktopToolbarStyle : {}) }}>
            <button
              onClick={openImportPage}
              style={{ ...importButtonStyle, ...(isDesktop ? desktopImportButtonStyle : {}) }}
            >
              匯入商品
            </button>

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
                placeholder="搜尋商品"
                style={{
                  ...searchInputStyle,
                  ...(isDesktop ? desktopSearchInputStyle : {}),
                }}
              />
            </label>
          </div>

          {loading && <div style={emptyStyle}>商品資料載入中...</div>}

          {!loading && (
            <section style={{ ...listStyle, ...(isDesktop ? desktopListStyle : {}) }}>
              {isDesktop && filteredProducts.length > 0 && (
                <div style={desktopListHeaderStyle}>
                  <span>狀態</span>
                  <span>SKU</span>
                  <span>品名</span>
                  <span>箱入數</span>
                  <span>條碼</span>
                  <span />
                </div>
              )}

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
                        ...(isDesktop ? desktopStatusDotStyle : {}),
                        background: product.enabled ? "#16c765" : "#64748b",
                        boxShadow: product.enabled
                          ? "0 0 0 7px rgba(22,199,101,0.12)"
                          : "0 0 0 7px rgba(100,116,139,0.12)",
                      }}
                  />
                  <div style={{ ...skuStyle, ...(isDesktop ? desktopSkuStyle : {}) }}>
                    {product.product_sku}
                  </div>
                  <div style={{ ...nameStyle, ...(isDesktop ? desktopNameStyle : {}) }}>
                    {product.product_name || "未命名商品"}
                  </div>

                  <div
                    style={{
                      ...metricGridStyle,
                      ...(isDesktop ? desktopMetricGridStyle : {}),
                    }}
                  >
                    <div
                      style={{
                        ...metricBoxStyle,
                        ...(isDesktop ? desktopMetricBoxStyle : {}),
                      }}
                    >
                      <div
                        style={{
                          ...metricLabelStyle,
                          ...(isDesktop ? desktopMetricLabelStyle : {}),
                        }}
                      >
                        箱入數
                      </div>
                      <div
                        style={{
                          ...metricValueStyle,
                          ...(isDesktop ? desktopMetricValueStyle : {}),
                        }}
                      >
                        {product.units_per_box || "-"}
                      </div>
                    </div>
                    <div
                      style={{
                        ...metricBoxStyle,
                        ...(isDesktop ? desktopMetricBoxStyle : {}),
                      }}
                    >
                      <div
                        style={{
                          ...metricLabelStyle,
                          ...(isDesktop ? desktopMetricLabelStyle : {}),
                        }}
                      >
                        條碼
                      </div>
                      <div
                        style={{
                          ...barcodeValueStyle,
                          ...(isDesktop ? desktopBarcodeValueStyle : {}),
                        }}
                      >
                        {product.barcodes[0]?.barcode ?? "-"}
                      </div>
                    </div>
                  </div>

                  {isDesktop && <div style={desktopRowArrowStyle}>›</div>}
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

      {mode === "import" && (
        <ProductImport
          isDesktop={isDesktop}
          onCancel={closeImportPage}
          onImported={handleImportDone}
        />
      )}
    </main>
  )
}

function ProductImport({
  isDesktop,
  onCancel,
  onImported,
}: {
  isDesktop: boolean
  onCancel: () => void
  onImported: (message: string) => Promise<void>
}) {
  const [rawText, setRawText] = useState("")
  const [busy, setBusy] = useState(false)
  const [importError, setImportError] = useState("")

  const rows = useMemo(() => parseImportRows(rawText), [rawText])
  const validRows = rows.filter((row) => row.errors.length === 0)
  const invalidRows = rows.filter((row) => row.errors.length > 0)
  const canImport = validRows.length > 0 && !busy

  async function handleImport() {
    try {
      setBusy(true)
      setImportError("")

      if (rows.length === 0) throw new Error("請先貼上要匯入的商品")

      const now = new Date().toISOString()
      const productRows = validRows.map((row) => ({
        product_sku: row.sku,
        product_name: row.name,
        units_per_box: row.unitsPerBox,
        enabled: true,
        tags: [],
        category: null,
        updated_at: now,
      }))

      const { error: productError } = await supabase
        .from("products")
        .upsert(productRows, { onConflict: "product_sku" })

      if (productError) throw productError

      const barcodeCandidates = validRows
        .filter((row) => row.barcode)
        .map((row) => ({
          product_sku: row.sku,
          barcode: row.barcode,
          enabled: true,
        }))

      let insertedBarcodeCount = 0

      if (barcodeCandidates.length > 0) {
        const uniqueBarcodes = Array.from(
          new Set(barcodeCandidates.map((row) => row.barcode))
        )

        const { data: existingBarcodeRows, error: existingBarcodeError } =
          await supabase
            .from("product_barcodes")
            .select("barcode")
            .in("barcode", uniqueBarcodes)

        if (existingBarcodeError) throw existingBarcodeError

        const existingBarcodes = new Set(
          (existingBarcodeRows ?? []).map((row) => String(row.barcode))
        )
        const seenBarcodes = new Set<string>()
        const barcodeRows = barcodeCandidates.filter((row) => {
          if (existingBarcodes.has(row.barcode)) return false
          if (seenBarcodes.has(row.barcode)) return false
          seenBarcodes.add(row.barcode)
          return true
        })

        if (barcodeRows.length > 0) {
          const { error: barcodeError } = await supabase
            .from("product_barcodes")
            .insert(barcodeRows)

          if (barcodeError) throw barcodeError
          insertedBarcodeCount = barcodeRows.length
        }
      }

      const skippedText =
        invalidRows.length > 0 ? `，略過 ${invalidRows.length} 筆錯誤列` : ""

      await onImported(
        `已匯入 ${validRows.length} 筆商品，新增 ${insertedBarcodeCount} 筆條碼${skippedText}`
      )
    } catch (err) {
      console.error(err)
      setImportError(err instanceof Error ? err.message : "商品匯入失敗")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={{ ...detailShellStyle, ...(isDesktop ? desktopDetailShellStyle : {}) }}>
      <div style={{ ...detailPanelStyle, ...(isDesktop ? desktopDetailPanelStyle : {}) }}>
        <div style={{ ...detailHeaderStyle, ...(isDesktop ? desktopDetailHeaderStyle : {}) }}>
          <h1 style={detailTitleStyle}>匯入商品</h1>
          <button
            aria-label="關閉"
            onClick={onCancel}
            style={{ ...closeButtonStyle, ...(isDesktop ? desktopCloseButtonStyle : {}) }}
          >
            ×
          </button>
        </div>

        {importError && <div style={errorStyle}>{importError}</div>}

        <div style={importHintStyle}>
          可從試算表直接複製貼上。欄位順序：sku、品名、箱入數、條碼。條碼可空白，匯入商品一律預設啟用。
        </div>

        <textarea
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          placeholder={"sku,品名,箱入數,條碼\nef023,大品客-16入,16,8886467127137\ntest001,商品,10,"}
          style={{
            ...importTextareaStyle,
            ...(isDesktop ? desktopImportTextareaStyle : {}),
          }}
        />

        <div style={importSummaryStyle}>
          <span>共 {rows.length} 筆</span>
          <span>可匯入 {validRows.length} 筆</span>
          <span style={{ color: invalidRows.length ? "#ff9999" : "#86efac" }}>
            會略過 {invalidRows.length} 筆
          </span>
        </div>

        {rows.length > 0 && (
          <div style={importPreviewStyle}>
            <div style={importPreviewHeaderStyle}>
              <span>列</span>
              <span>SKU</span>
              <span>品名</span>
              <span>箱入數</span>
              <span>條碼</span>
              <span>狀態</span>
            </div>

            {rows.slice(0, 80).map((row) => (
              <div
                key={`${row.rowNumber}-${row.sku}-${row.barcode}`}
                style={{
                  ...importPreviewRowStyle,
                  borderColor: row.errors.length ? "#7f1d1d" : "#333",
                }}
              >
                <span>{row.rowNumber}</span>
                <span>{row.sku || "-"}</span>
                <span>{row.name || "-"}</span>
                <span>{row.unitsPerBox || "-"}</span>
                <span>{row.barcode || "-"}</span>
                <span style={{ color: row.errors.length ? "#ff9999" : "#86efac" }}>
                  {row.errors.length ? `略過：${row.errors.join("、")}` : "可匯入"}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={actionRowStyle}>
          <button onClick={onCancel} style={secondaryButtonStyle}>
            取消
          </button>
          <button
            disabled={!canImport}
            onClick={handleImport}
            style={{
              ...primaryButtonStyle,
              opacity: canImport ? 1 : 0.45,
            }}
          >
            {busy ? "匯入中..." : "確認匯入"}
          </button>
        </div>
      </div>
    </section>
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

function parseImportRows(rawText: string): ImportDraftRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return []

  const delimiter = detectDelimiter(lines[0])
  const firstCells = splitDelimitedLine(lines[0], delimiter).map(normalizeHeader)
  const hasHeader = firstCells.some((cell) =>
    ["sku", "product_sku", "品名", "商品名稱", "箱入數", "條碼"].includes(cell)
  )

  const dataLines = hasHeader ? lines.slice(1) : lines
  const skuCounts = new Map<string, number>()
  const barcodeCounts = new Map<string, number>()

  const parsedRows = dataLines.map((line, index) => {
    const cells = splitDelimitedLine(line, delimiter)
    const sku = String(cells[0] ?? "").trim().toLowerCase()
    const name = String(cells[1] ?? "").trim()
    const unitsPerBox = Number(String(cells[2] ?? "").trim())
    const barcode = String(cells[3] ?? "").trim()

    if (sku) skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1)
    if (barcode) {
      barcodeCounts.set(barcode, (barcodeCounts.get(barcode) ?? 0) + 1)
    }

    return {
      rowNumber: index + 1 + (hasHeader ? 1 : 0),
      sku,
      name,
      unitsPerBox,
      barcode,
      enabled: true,
      errors: [],
    }
  })

  return parsedRows.map((row) => {
    const errors: string[] = []

    if (!row.sku) errors.push("缺 SKU")
    if (row.sku && !/^[a-z0-9._-]+$/.test(row.sku)) {
      errors.push("SKU 格式錯")
    }
    if (row.sku && (skuCounts.get(row.sku) ?? 0) > 1) {
      errors.push("同批 SKU 重複")
    }
    if (!row.name) errors.push("缺品名")
    if (!Number.isInteger(row.unitsPerBox) || row.unitsPerBox <= 0) {
      errors.push("箱入數錯")
    }
    if (row.barcode && (barcodeCounts.get(row.barcode) ?? 0) > 1) {
      errors.push("同批條碼重複")
    }

    return {
      ...row,
      errors,
    }
  })
}

function detectDelimiter(line: string) {
  if (line.includes("\t")) return "\t"
  return ","
}

function splitDelimitedLine(line: string, delimiter: string) {
  if (delimiter === "\t") return line.split("\t")

  const cells: string[] = []
  let current = ""
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const nextChar = line[index + 1]

    if (char === '"' && quoted && nextChar === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      quoted = !quoted
      continue
    }

    if (char === delimiter && !quoted) {
      cells.push(current.trim())
      current = ""
      continue
    }

    current += char
  }

  cells.push(current.trim())
  return cells
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_")
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
  display: "grid",
  gridTemplateColumns: "52px minmax(0, 1fr) 52px",
  alignItems: "center",
  maxWidth: 520,
  margin: "0 auto 16px",
}

const desktopTopBarStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "52px minmax(0, 1fr) 52px",
  gap: 12,
  maxWidth: 1120,
  margin: "0 auto 18px",
}

const pageTitleStyle: CSSProperties = {
  margin: 0,
  color: "#fff",
  fontSize: 26,
  lineHeight: 1.1,
  fontWeight: 900,
  letterSpacing: 0,
  textAlign: "center",
}

const desktopPageTitleStyle: CSSProperties = {
  fontSize: 28,
}

const ghostButtonStyle: CSSProperties = {
  background: "transparent",
  color: "#fff",
  border: "none",
  fontSize: 46,
  lineHeight: 1,
  padding: 0,
  textAlign: "left",
}

const desktopGhostButtonStyle: CSSProperties = {
  width: 46,
  height: 46,
  border: "none",
  borderRadius: 0,
  background: "transparent",
}

const addButtonStyle: CSSProperties = {
  background: "transparent",
  color: "#5aa2ff",
  border: "none",
  fontSize: 34,
  lineHeight: 1,
  fontWeight: 700,
  padding: 0,
  textAlign: "right",
}

const desktopAddButtonStyle: CSSProperties = {
  width: 52,
  height: 46,
  borderRadius: 0,
  border: "none",
  background: "transparent",
  color: "#5aa2ff",
  fontSize: 34,
  fontWeight: 700,
}

const desktopToolbarStyle: CSSProperties = {
  width: "100%",
  maxWidth: 1120,
  margin: "0 auto 12px",
  display: "grid",
  gridTemplateColumns: "150px minmax(280px, 1fr)",
  gap: 12,
  alignItems: "center",
}

const importButtonStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  height: 46,
  margin: "0 auto 12px",
  border: "1px solid #444",
  borderRadius: 12,
  background: "#1a1a1a",
  color: "#fff",
  fontSize: 16,
  fontWeight: 800,
}

const desktopImportButtonStyle: CSSProperties = {
  maxWidth: "none",
  margin: 0,
  fontSize: 15,
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

const listStyle: CSSProperties = {
  width: "100%",
  maxWidth: 520,
  margin: "0 auto",
  display: "grid",
  gap: 14,
}

const desktopListStyle: CSSProperties = {
  maxWidth: 1120,
  gap: 0,
  border: "1px solid #333",
  borderRadius: 16,
  overflow: "hidden",
  background: "#151515",
}

const desktopListHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "58px 160px minmax(0, 1fr) 100px 220px 34px",
  alignItems: "center",
  gap: 12,
  minHeight: 42,
  padding: "0 16px",
  borderBottom: "1px solid #303030",
  background: "#111",
  color: "#999",
  fontSize: 12,
  fontWeight: 800,
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
  minHeight: 58,
  display: "grid",
  gridTemplateColumns: "58px 160px minmax(0, 1fr) 100px 220px 34px",
  alignItems: "center",
  gap: 12,
  border: "none",
  borderBottom: "1px solid #2b2b2b",
  borderRadius: 0,
  background: "#1a1a1a",
  padding: "10px 16px",
  boxShadow: "none",
  cursor: "pointer",
}

const statusDotStyle: CSSProperties = {
  position: "absolute",
  top: 18,
  right: 18,
  width: 12,
  height: 12,
  borderRadius: 999,
}

const desktopStatusDotStyle: CSSProperties = {
  position: "static",
  justifySelf: "center",
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

const desktopSkuStyle: CSSProperties = {
  maxWidth: "none",
  fontSize: 14,
  fontWeight: 800,
}

const nameStyle: CSSProperties = {
  marginTop: 6,
  color: "#ddd",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.35,
  overflowWrap: "anywhere",
}

const desktopNameStyle: CSSProperties = {
  marginTop: 0,
  color: "#f4f4f5",
  fontSize: 14,
  fontWeight: 700,
}

const metricGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: 10,
  marginTop: 14,
}

const desktopMetricGridStyle: CSSProperties = {
  display: "contents",
  marginTop: 0,
}

const metricBoxStyle: CSSProperties = {
  minWidth: 0,
  border: "1px solid #333",
  borderRadius: 12,
  background: "#0f0f0f",
  padding: "10px 12px",
  boxSizing: "border-box",
}

const desktopMetricBoxStyle: CSSProperties = {
  border: "none",
  borderRadius: 0,
  background: "transparent",
  padding: 0,
}

const metricLabelStyle: CSSProperties = {
  color: "#bbb",
  fontSize: 13,
}

const desktopMetricLabelStyle: CSSProperties = {
  display: "none",
}

const metricValueStyle: CSSProperties = {
  marginTop: 6,
  color: "#fff",
  fontSize: 18,
  fontWeight: 700,
  lineHeight: 1.2,
}

const desktopMetricValueStyle: CSSProperties = {
  marginTop: 0,
  color: "#e5e7eb",
  fontSize: 14,
  fontWeight: 800,
}

const barcodeValueStyle: CSSProperties = {
  ...metricValueStyle,
  fontSize: 15,
  overflowWrap: "anywhere",
}

const desktopBarcodeValueStyle: CSSProperties = {
  ...desktopMetricValueStyle,
  color: "#cbd5e1",
  fontSize: 13,
  overflowWrap: "anywhere",
}

const desktopRowArrowStyle: CSSProperties = {
  color: "#777",
  fontSize: 26,
  lineHeight: 1,
  fontWeight: 800,
  textAlign: "right",
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
  borderRadius: 0,
  border: "none",
  background: "transparent",
  color: "#fff",
  fontSize: 34,
  lineHeight: 1,
  justifySelf: "end",
}

const desktopCloseButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
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

const importHintStyle: CSSProperties = {
  color: "#bbb",
  fontSize: 14,
  lineHeight: 1.5,
  marginBottom: 12,
}

const importTextareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 180,
  borderRadius: 12,
  border: "1px solid #444",
  outline: "none",
  background: "#0f0f0f",
  color: "#fff",
  padding: 12,
  boxSizing: "border-box",
  fontSize: 14,
  lineHeight: 1.5,
  resize: "vertical",
  marginBottom: 12,
}

const desktopImportTextareaStyle: CSSProperties = {
  minHeight: 220,
}

const importSummaryStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  color: "#ddd",
  fontSize: 14,
  fontWeight: 700,
  marginBottom: 12,
}

const importPreviewStyle: CSSProperties = {
  display: "grid",
  gap: 0,
  border: "1px solid #333",
  borderRadius: 12,
  overflowX: "auto",
  overflowY: "hidden",
  marginBottom: 16,
}

const importPreviewHeaderStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "48px 130px minmax(0, 1fr) 76px 160px 150px",
  gap: 10,
  alignItems: "center",
  minWidth: 760,
  minHeight: 38,
  padding: "0 12px",
  background: "#111",
  color: "#999",
  fontSize: 12,
  fontWeight: 800,
}

const importPreviewRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "48px 130px minmax(0, 1fr) 76px 160px 150px",
  gap: 10,
  alignItems: "center",
  minWidth: 760,
  minHeight: 42,
  borderTop: "1px solid #333",
  padding: "8px 12px",
  color: "#e5e7eb",
  fontSize: 13,
  overflowWrap: "anywhere",
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
