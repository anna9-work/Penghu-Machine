import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { supabase } from "../lib/supabase"

const GROUP_CODE = "catchme_penghu"
const DEFAULT_WAREHOUSE_ORDER = ["main", "withdraw", "swap", "onsite"]
const AUDIT_REVIEW_LIMIT_DAYS = 30

type Props = {
  onBack: () => void
}

type Screen = "menu" | "list" | "pending" | "entry" | "review"
type AuditStatus = "draft" | "submitted" | "approved"

type Warehouse = {
  warehouse_code: string
  warehouse_name: string
}

type AuditRecord = {
  id: number
  group_code: string
  biz_date: string
  warehouse_code: string
  status: AuditStatus
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

type AuditRow = AuditRecord & {
  item_count: number
}

type AuditItem = {
  id: number
  audit_id: number
  product_sku: string
  product_name: string
  units_per_box: number
  count_box: number
  count_piece: number
  created_at: string
  updated_at: string
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

type StockRow = {
  product_sku: string
  product_name?: string | null
  warehouse_code: string
  box: number | null
  piece: number | null
  amount?: number | null
}

type StockMapValue = {
  product_sku: string
  product_name: string
  box: number
  piece: number
  amount: number
}

type ReviewRow = AuditItem & {
  system_box: number
  system_piece: number
  diff_box: number
  diff_piece: number
}

export default function InventoryAuditPage({ onBack }: Props) {
  const [screen, setScreen] = useState<Screen>("menu")
  const [warehouses, setWarehouses] = useState<Warehouse[]>([])
  const [bizDate, setBizDate] = useState(getBusinessDateValue())
  const [warehouse, setWarehouse] = useState("main")
  const [audits, setAudits] = useState<AuditRow[]>([])
  const [audit, setAudit] = useState<AuditRecord | null>(null)
  const [items, setItems] = useState<AuditItem[]>([])
  const [stockMap, setStockMap] = useState<Map<string, StockMapValue>>(new Map())
  const [reviewExecutable, setReviewExecutable] = useState(false)
  const [auditListManaging, setAuditListManaging] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchKeyword, setSearchKeyword] = useState("")
  const [searchResults, setSearchResults] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [editingWarehouseCode, setEditingWarehouseCode] = useState<string | null>(null)
  const [categoryCode, setCategoryCode] = useState("")
  const [categoryName, setCategoryName] = useState("")
  const [countBox, setCountBox] = useState("0")
  const [countPiece, setCountPiece] = useState("0")
  const [loading, setLoading] = useState(false)
  const [loadingProduct, setLoadingProduct] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const warehouseName = useMemo(
    () => getWarehouseName(warehouse, warehouses),
    [warehouse, warehouses]
  )

  const editable = audit?.status === "draft"
  const currentWarehouseName = audit
    ? getWarehouseName(audit.warehouse_code, warehouses)
    : warehouseName
  const selectedExistingItem = selectedProduct
    ? items.find((item) => item.product_sku === selectedProduct.product_sku)
    : null

  const itemSummary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.box += item.count_box
        acc.piece += item.count_piece
        return acc
      },
      { box: 0, piece: 0 }
    )
  }, [items])

  const reviewRows = useMemo<ReviewRow[]>(() => {
    return items.map((item) => {
      const stock = stockMap.get(item.product_sku) ?? {
        product_sku: item.product_sku,
        product_name: item.product_name,
        box: 0,
        piece: 0,
        amount: 0,
      }

      return {
        ...item,
        system_box: stock.box,
        system_piece: stock.piece,
        diff_box: item.count_box - stock.box,
        diff_piece: item.count_piece - stock.piece,
      }
    })
  }, [items, stockMap])

  const missingStockRows = useMemo(() => {
    const counted = new Set(items.map((item) => item.product_sku))
    return [...stockMap.values()].filter((row) => {
      if (counted.has(row.product_sku)) return false
      return row.box !== 0 || row.piece !== 0
    })
  }, [items, stockMap])

  const reviewSummary = useMemo(() => {
    return reviewRows.reduce(
      (acc, row) => {
        if (row.diff_box !== 0 || row.diff_piece !== 0) acc.diffItems += 1
        acc.diffBox += row.diff_box
        acc.diffPiece += row.diff_piece
        return acc
      },
      {
        diffItems: 0,
        diffBox: 0,
        diffPiece: 0,
      }
    )
  }, [reviewRows])

  useEffect(() => {
    void loadWarehouses()
    void loadAudits("all")
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
      void searchProducts(value)
    }, 260)

    return () => window.clearTimeout(timer)
  }, [searchKeyword, searchOpen])

  async function loadWarehouses() {
    const { data, error: warehouseError } = await supabase
      .from("warehouse_kinds")
      .select("warehouse_code,warehouse_name")
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
      const aIndex = DEFAULT_WAREHOUSE_ORDER.indexOf(a.warehouse_code)
      const bIndex = DEFAULT_WAREHOUSE_ORDER.indexOf(b.warehouse_code)

      if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
      if (aIndex >= 0) return -1
      if (bIndex >= 0) return 1
      return a.warehouse_code.localeCompare(b.warehouse_code)
    })

    setWarehouses(rows)

    if (rows.length > 0 && !rows.some((row) => row.warehouse_code === warehouse)) {
      setWarehouse(rows[0].warehouse_code)
    }
  }

  function resetCategoryForm() {
    setEditingWarehouseCode(null)
    setCategoryCode("")
    setCategoryName("")
  }

  function editCategory(row: Warehouse) {
    setEditingWarehouseCode(row.warehouse_code)
    setCategoryCode(row.warehouse_code)
    setCategoryName(row.warehouse_name)
  }

  async function saveCategory() {
    const nextCode = categoryCode.trim().toLowerCase()
    const nextName = categoryName.trim()

    if (!nextCode || !nextName) {
      setError("請輸入類別代碼與名稱")
      return
    }

    if (!/^[a-z0-9_]+$/.test(nextCode)) {
      setError("類別代碼只能使用英文小寫、數字與底線")
      return
    }

    try {
      setSaving(true)
      setError("")
      setMessage("")

      if (editingWarehouseCode) {
        const { error: updateError } = await supabase
          .from("warehouse_kinds")
          .update({ warehouse_name: nextName })
          .eq("warehouse_code", editingWarehouseCode)

        if (updateError) throw updateError
        setMessage(`已更新類別：${nextName}`)
      } else {
        const { error: insertError } = await supabase
          .from("warehouse_kinds")
          .insert({
            warehouse_code: nextCode,
            warehouse_name: nextName,
          })

        if (insertError) throw insertError
        setWarehouse(nextCode)
        setMessage(`已新增類別：${nextName}`)
      }

      resetCategoryForm()
      await loadWarehouses()
    } catch (err) {
      console.error(err)
      setError(getErrorMessage(err, "儲存類別失敗"))
    } finally {
      setSaving(false)
    }
  }

  async function deleteCategory(row: Warehouse) {
    const ok = window.confirm(
      `確定刪除「${row.warehouse_name}」？\n若此類別已經被交易、盤點單或庫存資料使用，資料庫可能會拒絕刪除。`
    )
    if (!ok) return

    try {
      setSaving(true)
      setError("")
      setMessage("")

      const { error: deleteError } = await supabase
        .from("warehouse_kinds")
        .delete()
        .eq("warehouse_code", row.warehouse_code)

      if (deleteError) throw deleteError

      if (warehouse === row.warehouse_code) {
        const nextWarehouse = warehouses.find(
          (item) => item.warehouse_code !== row.warehouse_code
        )
        setWarehouse(nextWarehouse?.warehouse_code ?? "main")
      }

      if (editingWarehouseCode === row.warehouse_code) {
        resetCategoryForm()
      }

      setMessage(`已刪除類別：${row.warehouse_name}`)
      await loadWarehouses()
    } catch (err) {
      console.error(err)
      setError(getErrorMessage(err, "刪除類別失敗"))
    } finally {
      setSaving(false)
    }
  }

  async function loadAudits(kind: "all" | "submitted") {
    try {
      setLoading(true)
      setError("")

      const { data, error: listError } = await supabase.rpc(
        "rpc_inventory_audits_list",
        {
          p_group_code: GROUP_CODE,
          p_biz_date_from: addDays(getBusinessDateValue(), -90),
          p_biz_date_to: null,
          p_status: kind === "submitted" ? "submitted" : null,
        }
      )

      if (listError) throw listError

      setAudits(
        ((data ?? []) as AuditRow[]).map((row) => ({
          ...normalizeAudit(row),
          item_count: Number(row.item_count ?? 0),
        }))
      )
    } catch (err) {
      console.error(err)
      setError(getErrorMessage(err, "讀取盤點單失敗"))
    } finally {
      setLoading(false)
    }
  }

  async function createAudit() {
    try {
      setSaving(true)
      setError("")
      setMessage("")

      const { data, error: createError } = await supabase.rpc(
        "rpc_inventory_audit_create",
        {
          p_group_code: GROUP_CODE,
          p_biz_date: bizDate,
          p_warehouse_code: warehouse,
          p_created_by: "webapp",
        }
      )

      if (createError) throw createError

      const nextAudit = normalizeAudit(data as AuditRecord)
      setAudit(nextAudit)
      setItems([])
      setStockMap(new Map())
      setSelectedProduct(null)
      setCreateOpen(false)
      setScreen("entry")
      setMessage(`已建立 ${nextAudit.biz_date} ${warehouseName} 盤點單`)
      await loadAuditItems(nextAudit)
      await loadAudits("all")
    } catch (err) {
      console.error(err)
      setError(getErrorMessage(err, "建立盤點單失敗"))
    } finally {
      setSaving(false)
    }
  }

  async function openAudit(row: AuditRow, forceReview = false) {
    const nextAudit = normalizeAudit(row)
    setAudit(nextAudit)
    setBizDate(nextAudit.biz_date)
    setWarehouse(nextAudit.warehouse_code)
    setSelectedProduct(null)
    setSearchKeyword("")
    setSearchResults([])
    setMessage("")
    setError("")
    setReviewExecutable(
      forceReview &&
        nextAudit.status === "submitted" &&
        !isAuditReviewExpired(nextAudit)
    )
    setScreen(forceReview || nextAudit.status !== "draft" ? "review" : "entry")
    await loadAuditItems(nextAudit)
  }

  async function deleteAudit(row: AuditRow) {
    if (row.status === "approved") {
      setError("已執行的盤點單不能刪除")
      return
    }

    const ok = window.confirm(
      `確定刪除 ${row.biz_date} ${getWarehouseName(
        row.warehouse_code,
        warehouses
      )} 的盤點單？\n這會一起刪除這張盤點單的所有盤點明細。`
    )
    if (!ok) return

    try {
      setSaving(true)
      setError("")
      setMessage("")

      const { error: itemError } = await supabase
        .from("inventory_audit_items")
        .delete()
        .eq("audit_id", row.id)

      if (itemError) throw itemError

      const { error: auditError } = await supabase
        .from("inventory_audits")
        .delete()
        .eq("id", row.id)
        .eq("group_code", GROUP_CODE)

      if (auditError) throw auditError

      setMessage("盤點單已刪除")
      await loadAudits("all")
    } catch (err) {
      console.error(err)
      setError(getErrorMessage(err, "刪除盤點單失敗"))
    } finally {
      setSaving(false)
    }
  }

  async function loadAuditItems(nextAudit = audit) {
    if (!nextAudit) return

    try {
      setLoading(true)
      setError("")

      const { data, error: itemError } = await supabase.rpc(
        "rpc_inventory_audit_items_list",
        {
          p_audit_id: nextAudit.id,
        }
      )

      if (itemError) throw itemError

      const nextItems = ((data ?? []) as AuditItem[])
        .map((item) => ({
          ...item,
          id: Number(item.id),
          audit_id: Number(item.audit_id),
          product_sku: item.product_sku.toLowerCase(),
          product_name: item.product_name ?? item.product_sku,
          units_per_box: Number(item.units_per_box ?? 1),
          count_box: Number(item.count_box ?? 0),
          count_piece: Number(item.count_piece ?? 0),
        }))
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime()
        )

      setItems(nextItems)

      if (nextAudit.status !== "draft") {
        await loadStockMap(nextAudit)
      } else {
        setStockMap(new Map())
      }
    } catch (err) {
      console.error(err)
      setError(getErrorMessage(err, "讀取盤點品項失敗"))
    } finally {
      setLoading(false)
    }
  }

  async function loadStockMap(nextAudit = audit) {
    if (!nextAudit) return

    const { data, error: stockError } = await supabase.rpc(
      "get_business_day_stock",
      {
        p_group: GROUP_CODE,
        p_biz_date: nextAudit.biz_date,
      }
    )

    if (stockError) throw stockError

    const nextMap = new Map<string, StockMapValue>()

    for (const row of (data ?? []) as StockRow[]) {
      if (row.warehouse_code !== nextAudit.warehouse_code) continue

      const sku = row.product_sku.toLowerCase()
      nextMap.set(sku, {
        product_sku: sku,
        product_name: row.product_name ?? sku,
        box: Number(row.box ?? 0),
        piece: Number(row.piece ?? 0),
        amount: Number(row.amount ?? 0),
      })
    }

    setStockMap(nextMap)
  }

  async function searchProducts(value = searchKeyword) {
    const keyword = value.trim()
    if (!keyword) return

    try {
      setLoadingProduct(true)
      setError("")

      const normalizedKeyword = keyword.toLowerCase()
      const exactMatches: Product[] = []
      const skuProduct = await loadProductBySku(normalizedKeyword)

      if (skuProduct) exactMatches.push(skuProduct)

      const { data: barcodeData, error: barcodeError } = await supabase
        .from("product_barcodes")
        .select("product_sku")
        .eq("barcode", keyword)
        .eq("enabled", true)
        .maybeSingle()

      if (barcodeError) throw barcodeError

      const barcodeSku = barcodeData?.product_sku ?? ""
      const barcodeProduct =
        barcodeSku && barcodeSku.toLowerCase() !== skuProduct?.product_sku
          ? await loadProductBySku(barcodeSku.toLowerCase())
          : null

      if (barcodeProduct) exactMatches.push(barcodeProduct)

      const keywordProducts = await searchProductsByKeyword(keyword)
      const results = [...exactMatches, ...keywordProducts].filter(
        (row, index, rows) =>
          rows.findIndex((item) => item.product_sku === row.product_sku) ===
          index
      )

      setSearchResults(results)
    } catch (err) {
      console.error(err)
      setError(getErrorMessage(err, "商品查詢失敗"))
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
      .or(
        `product_sku.ilike.%${normalizedValue}%,product_name.ilike.%${normalizedValue}%`
      )
      .order("product_sku", { ascending: true })
      .limit(12)

    if (productError) throw productError

    return ((data ?? []) as ProductRow[]).map(normalizeProduct)
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

    return normalizeProduct(data as ProductRow)
  }

  function selectProduct(product: Product) {
    setSelectedProduct(product)
    setCountBox("0")
    setCountPiece("0")
    setSearchOpen(false)
    setSearchKeyword("")
    setSearchResults([])
  }

  async function addAuditItem() {
    if (!audit) {
      setError("請先建立或開啟盤點單")
      return
    }

    if (!selectedProduct) {
      setError("請先選擇商品")
      return
    }

    const box = Number(countBox || "0")
    const piece = Number(countPiece || "0")

    if (!Number.isFinite(box) || box < 0) {
      setError("盤點箱數不可小於 0")
      return
    }

    if (!Number.isFinite(piece) || piece < 0) {
      setError("盤點散數不可小於 0")
      return
    }

    if (box === 0 && piece === 0) {
      setError("請輸入盤點箱數或散數")
      return
    }

    try {
      setSaving(true)
      setError("")
      setMessage("")

      const existing = items.find(
        (item) => item.product_sku === selectedProduct.product_sku
      )

      if (existing) {
        const nextBox = existing.count_box + box
        const nextPiece = existing.count_piece + piece

        const { error: updateError } = await supabase.rpc(
          "rpc_inventory_audit_update_item",
          {
            p_audit_item_id: existing.id,
            p_count_box: nextBox,
            p_count_piece: nextPiece,
          }
        )

        if (updateError) throw updateError
        setMessage(
          `已累加 ${selectedProduct.product_sku}：箱 ${formatNumber(
            existing.count_box
          )} + ${formatNumber(box)}，散 ${formatNumber(
            existing.count_piece
          )} + ${formatNumber(piece)}`
        )
      } else {
        const { error: addError } = await supabase.rpc(
          "rpc_inventory_audit_add_item",
          {
            p_audit_id: audit.id,
            p_product_sku: selectedProduct.product_sku,
            p_count_box: box,
            p_count_piece: piece,
          }
        )

        if (addError) throw addError
        setMessage(`已加入 ${selectedProduct.product_sku}`)
      }

      setSelectedProduct(null)
      setCountBox("0")
      setCountPiece("0")
      await loadAuditItems(audit)
    } catch (err) {
      console.error(err)
      setError(getErrorMessage(err, "儲存盤點品項失敗"))
    } finally {
      setSaving(false)
    }
  }

  async function updateItem(item: AuditItem, box: number, piece: number) {
    if (!audit) return

    if (!Number.isFinite(box) || box < 0 || !Number.isFinite(piece) || piece < 0) {
      setError("盤點數量不可小於 0")
      return
    }

    try {
      setSaving(true)
      setError("")

      const { error: updateError } = await supabase.rpc(
        "rpc_inventory_audit_update_item",
        {
          p_audit_item_id: item.id,
          p_count_box: box,
          p_count_piece: piece,
        }
      )

      if (updateError) throw updateError

      await loadAuditItems(audit)
    } catch (err) {
      console.error(err)
      setError(getErrorMessage(err, "更新盤點品項失敗"))
    } finally {
      setSaving(false)
    }
  }

  async function deleteItem(item: AuditItem) {
    if (!audit) return

    try {
      setSaving(true)
      setError("")

      const { error: deleteError } = await supabase.rpc(
        "rpc_inventory_audit_delete_item",
        {
          p_audit_item_id: item.id,
        }
      )

      if (deleteError) throw deleteError

      await loadAuditItems(audit)
    } catch (err) {
      console.error(err)
      setError(getErrorMessage(err, "刪除盤點品項失敗"))
    } finally {
      setSaving(false)
    }
  }

  async function submitAudit() {
    if (!audit) return

    if (items.length === 0) {
      setError("盤點單至少需要 1 個品項")
      return
    }

    try {
      setSaving(true)
      setError("")
      setMessage("")

      const { error: submitError } = await supabase.rpc(
        "rpc_inventory_audit_submit",
        {
          p_audit_id: audit.id,
        }
      )

      if (submitError) throw submitError

      setAudit(null)
      setItems([])
      setStockMap(new Map())
      setSelectedProduct(null)
      setReviewExecutable(false)
      setScreen("menu")
      setMessage("盤點單已送審")
      await loadAudits("all")
    } catch (err) {
      console.error(err)
      setError(getErrorMessage(err, "送審失敗"))
    } finally {
      setSaving(false)
    }
  }

  async function approveAudit() {
    if (!audit) return

    const ok = window.confirm(
      `確認執行 ${audit.biz_date} ${currentWarehouseName} 盤點調整？\n\n沒有輸入但系統有庫存的品項，會被視為 0 並寫入調整。`
    )

    if (!ok) return

    try {
      setSaving(true)
      setError("")
      setMessage("")

      const { error: approveError } = await supabase.rpc(
        "rpc_inventory_audit_approve",
        {
          p_audit_id: audit.id,
        }
      )

      if (approveError) throw approveError

      setMessage("盤點已審核執行，庫存與試算表重建已送出")
      setAudit({ ...audit, status: "approved" })
      await loadAudits("submitted")
    } catch (err) {
      console.error(err)
      setError(getErrorMessage(err, "審核執行失敗"))
    } finally {
      setSaving(false)
    }
  }

  async function copyReviewCsv() {
    if (!audit) return

    const rows = [
      [
        "盤點日期",
        "倉庫",
        "SKU",
        "品名",
        "箱入數",
        "系統箱",
        "系統散",
        "盤點箱",
        "盤點散",
        "差異箱",
        "差異散",
      ],
      ...reviewRows.map((row) => [
        audit.biz_date,
        currentWarehouseName,
        row.product_sku,
        row.product_name,
        String(row.units_per_box),
        String(row.system_box),
        String(row.system_piece),
        String(row.count_box),
        String(row.count_piece),
        String(row.diff_box),
        String(row.diff_piece),
      ]),
      ...missingStockRows.map((row) => [
        audit.biz_date,
        currentWarehouseName,
        row.product_sku,
        row.product_name,
        "",
        String(row.box),
        String(row.piece),
        "0",
        "0",
        String(0 - row.box),
        String(0 - row.piece),
      ]),
    ]

    const csv = rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n")

    try {
      await navigator.clipboard.writeText(csv)
      setMessage("已複製 CSV 內容")
      setError("")
    } catch (err) {
      console.error(err)
      setError("複製失敗，請改用電腦瀏覽器再試一次")
    }
  }

  function goMenu() {
    setScreen("menu")
    setAudit(null)
    setItems([])
    setStockMap(new Map())
    setReviewExecutable(false)
    setSelectedProduct(null)
    setMessage("")
    setError("")
  }

  function openList() {
    setScreen("list")
    setAudit(null)
    setItems([])
    setStockMap(new Map())
    setReviewExecutable(false)
    setAuditListManaging(false)
    void loadAudits("all")
  }

  function openPending() {
    setScreen("pending")
    setAudit(null)
    setItems([])
    setStockMap(new Map())
    setReviewExecutable(false)
    setAuditListManaging(false)
    void loadAudits("submitted")
  }

  return (
    <main style={pageStyle}>
      <header style={topBarStyle}>
        <button
          onClick={screen === "menu" ? onBack : goMenu}
          style={backButtonStyle}
          aria-label="返回"
        >
          ‹
        </button>
        <div style={titleBlockStyle}>
          <h1 style={titleStyle}>{getScreenTitle(screen)}</h1>
          <p style={subtitleStyle}>全店盲盤 / 月盤</p>
        </div>
        {screen === "menu" ? (
          <button
            onClick={() => setCategoryOpen(true)}
            style={ghostButtonStyle}
          >
            ⚑ 類別
          </button>
        ) : screen === "list" ? (
          <button
            onClick={() => setAuditListManaging((value) => !value)}
            style={ghostButtonStyle}
          >
            {auditListManaging ? "完成" : "管理"}
          </button>
        ) : screen === "entry" && editable ? (
          <button
            onClick={() => setSearchOpen(true)}
            style={ghostButtonStyle}
          >
            +商品
          </button>
        ) : screen === "review" ? (
          <button
            onClick={() => void copyReviewCsv()}
            style={ghostButtonStyle}
          >
            複製CSV
          </button>
        ) : (
          <button
            onClick={() =>
              void loadAudits(screen === "pending" ? "submitted" : "all")
            }
            disabled={loading}
            style={ghostButtonStyle}
          >
            更新
          </button>
        )}
      </header>

      {message && <div style={messageStyle}>{message}</div>}
      {error && <div style={errorStyle}>{error}</div>}

      {screen === "menu" && (
        <section style={menuPanelStyle}>
          <ActionButton
            code="NEW"
            title="新增盤點單"
            subtitle="選擇日期與倉庫後開始盲盤"
            accent="#60a5fa"
            onClick={() => setCreateOpen(true)}
          />
          <ActionButton
            code="LST"
            title="盤點單列表"
            subtitle="草稿 / 待審核 / 已執行"
            accent="#38bdf8"
            onClick={openList}
          />
          <ActionButton
            code="CHK"
            title="待審核盤點單"
            subtitle="確認差異後送出執行"
            accent="#34d399"
            onClick={openPending}
          />
        </section>
      )}

      {screen === "list" && (
        <AuditList
          title="盤點單列表"
          audits={audits}
          warehouses={warehouses}
          loading={loading}
          emptyText="目前沒有盤點單"
          onOpen={(row) => void openAudit(row)}
          managing={auditListManaging}
          saving={saving}
          onDelete={(row) => void deleteAudit(row)}
        />
      )}

      {screen === "pending" && (
        <AuditList
          title="待審核盤點單"
          audits={audits}
          warehouses={warehouses}
          loading={loading}
          emptyText="目前沒有待審核盤點單"
          onOpen={(row) => void openAudit(row, true)}
        />
      )}

      {screen === "entry" && audit && (
        <>
          <AuditInfoCard
            audit={audit}
            warehouses={warehouses}
            itemCount={items.length}
            box={itemSummary.box}
            piece={itemSummary.piece}
          />

          {selectedProduct && editable && (
            <section style={panelStyle}>
              <div style={selectedProductStyle}>
                <div>
                  <strong>{selectedProduct.product_sku}</strong>
                  <span>{selectedProduct.product_name}</span>
                  <small>
                    箱入數：{selectedProduct.units_per_box}
                    {isFoodProduct(selectedProduct) ? " / 食品" : ""}
                  </small>
                  {selectedExistingItem && (
                    <small>
                      目前累計：箱 {formatNumber(selectedExistingItem.count_box)} /
                      散 {formatNumber(selectedExistingItem.count_piece)}
                    </small>
                  )}
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  style={clearButtonStyle}
                >
                  ×
                </button>
              </div>

              <div style={qtyGridStyle}>
                <label style={fieldStyle}>
                  <span>盤點箱數</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={countBox}
                    onChange={(event) => setCountBox(event.target.value)}
                    style={inputStyle}
                  />
                </label>
                <label style={fieldStyle}>
                  <span>盤點散數</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={countPiece}
                    onChange={(event) => setCountPiece(event.target.value)}
                    style={inputStyle}
                  />
                </label>
              </div>

              <button
                onClick={() => void addAuditItem()}
                disabled={saving}
                style={{
                  ...primaryButtonStyle,
                  opacity: saving ? 0.65 : 1,
                }}
              >
                儲存這筆盤點
              </button>
            </section>
          )}

          <section style={listPanelStyle}>
            <div style={sectionTitleRowStyle}>
              <h2 style={sectionTitleStyle}>盤點數據</h2>
              <span style={mutedStyle}>最新輸入在最上方</span>
            </div>

            {items.length === 0 && (
              <p style={emptyStyle}>點右上角「+商品」開始輸入盤點數據</p>
            )}

            {items.map((item) => (
              <AuditItemCard
                key={item.id}
                item={item}
                editable={editable}
                saving={saving}
                onUpdate={updateItem}
                onDelete={deleteItem}
              />
            ))}
          </section>

          {editable && (
            <button
              onClick={() => void submitAudit()}
              disabled={saving || items.length === 0}
              style={{
                ...bottomButtonStyle,
                opacity: saving || items.length === 0 ? 0.65 : 1,
              }}
            >
              送出審核
            </button>
          )}
        </>
      )}

      {screen === "review" && audit && (
        <>
          <AuditInfoCard
            audit={audit}
            warehouses={warehouses}
            itemCount={items.length}
            box={itemSummary.box}
            piece={itemSummary.piece}
          />

          <section style={reviewSummaryStyle}>
            <div>
              <span>差異品項</span>
              <strong>{formatNumber(reviewSummary.diffItems)}</strong>
            </div>
            <div>
              <span>差異箱數</span>
              <strong>{formatSigned(reviewSummary.diffBox)}</strong>
            </div>
            <div>
              <span>差異散數</span>
              <strong>{formatSigned(reviewSummary.diffPiece)}</strong>
            </div>
          </section>

          {missingStockRows.length > 0 && audit.status === "submitted" && (
            <div style={warningStyle}>
              未輸入但系統仍有庫存：{missingStockRows.length} 項。執行後會視為
              0 並調整庫存。
            </div>
          )}

          {audit.status === "submitted" && !reviewExecutable && (
            <div style={isAuditReviewExpired(audit) ? warningStyle : messageStyle}>
              {isAuditReviewExpired(audit)
                ? `此盤點單已超過 ${AUDIT_REVIEW_LIMIT_DAYS} 日審核期限，只能查看明細，不能送出執行。`
                : "此頁只提供查看明細。請從「待審核盤點單」入口進入後再送出執行。"}
            </div>
          )}

          <section style={listPanelStyle}>
            <div style={sectionTitleRowStyle}>
              <h2 style={sectionTitleStyle}>盤點審核數據</h2>
              <span style={mutedStyle}>系統 / 盤點 / 差異</span>
            </div>

            {reviewRows.map((row) => (
              <ReviewCard key={row.id} row={row} />
            ))}

            {missingStockRows.slice(0, 20).map((row) => (
              <MissingStockCard key={row.product_sku} row={row} />
            ))}

            {missingStockRows.length > 20 && (
              <p style={emptyStyle}>
                另有 {missingStockRows.length - 20} 項未輸入庫存，CSV 會完整複製。
              </p>
            )}
          </section>

          {audit.status === "submitted" && reviewExecutable && (
            <button
              onClick={() => void approveAudit()}
              disabled={saving}
              style={{
                ...bottomButtonStyle,
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                opacity: saving ? 0.65 : 1,
              }}
            >
              確認送出執行
            </button>
          )}
        </>
      )}

      {createOpen && (
        <div style={sheetOverlayStyle} onClick={() => setCreateOpen(false)}>
          <section
            style={dialogSheetStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={sheetHeaderStyle}>
              <h2 style={sheetTitleStyle}>新增盤點單</h2>
              <button
                onClick={() => setCreateOpen(false)}
                style={closeButtonStyle}
              >
                ×
              </button>
            </div>

            <label style={labelStyle}>盤點日期（該日結束庫存）</label>
            <input
              type="date"
              value={bizDate}
              onChange={(event) => setBizDate(event.target.value)}
              style={inputStyle}
            />

            <label style={labelStyle}>倉庫別</label>
            <select
              value={warehouse}
              onChange={(event) => setWarehouse(event.target.value)}
              style={selectStyle}
            >
              {warehouses.map((row) => (
                <option key={row.warehouse_code} value={row.warehouse_code}>
                  {row.warehouse_name}
                </option>
              ))}
            </select>

            <button
              onClick={() => void createAudit()}
              disabled={saving}
              style={{
                ...primaryButtonStyle,
                opacity: saving ? 0.65 : 1,
              }}
            >
              確認建立盤點單
            </button>
          </section>
        </div>
      )}

      {categoryOpen && (
        <div
          style={sheetOverlayStyle}
          onClick={() => {
            setCategoryOpen(false)
            resetCategoryForm()
          }}
        >
          <section
            style={searchSheetStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={sheetHeaderStyle}>
              <h2 style={sheetTitleStyle}>⚑ 類別管理</h2>
              <button
                onClick={() => {
                  setCategoryOpen(false)
                  resetCategoryForm()
                }}
                style={closeButtonStyle}
              >
                ×
              </button>
            </div>

            {message && <div style={messageStyle}>{message}</div>}
            {error && <div style={errorStyle}>{error}</div>}

            <section style={categoryFormStyle}>
              <label style={labelStyle}>類別代碼</label>
              <input
                value={categoryCode}
                onChange={(event) => setCategoryCode(event.target.value)}
                disabled={Boolean(editingWarehouseCode)}
                placeholder="例如 main / withdraw / swap"
                style={{
                  ...inputStyle,
                  opacity: editingWarehouseCode ? 0.62 : 1,
                }}
              />

              <label style={labelStyle}>顯示名稱</label>
              <input
                value={categoryName}
                onChange={(event) => setCategoryName(event.target.value)}
                placeholder="例如 總倉"
                style={inputStyle}
              />

              <div style={categoryButtonGridStyle}>
                {editingWarehouseCode && (
                  <button
                    onClick={resetCategoryForm}
                    disabled={saving}
                    style={secondaryButtonStyle}
                  >
                    取消編輯
                  </button>
                )}
                <button
                  onClick={() => void saveCategory()}
                  disabled={saving}
                  style={{
                    ...primaryButtonStyle,
                    opacity: saving ? 0.65 : 1,
                  }}
                >
                  {editingWarehouseCode ? "儲存修改" : "新增類別"}
                </button>
              </div>
            </section>

            <section style={categoryListStyle}>
              {warehouses.length === 0 && (
                <p style={emptyStyle}>目前沒有類別</p>
              )}

              {warehouses.map((row) => (
                <div key={row.warehouse_code} style={categoryRowStyle}>
                  <div>
                    <strong style={categoryNameStyle}>{row.warehouse_name}</strong>
                    <span style={categoryCodeStyle}>{row.warehouse_code}</span>
                  </div>
                  <div style={categoryActionStyle}>
                    <button
                      onClick={() => editCategory(row)}
                      disabled={saving}
                      style={smallEditButtonStyle}
                    >
                      修改
                    </button>
                    <button
                      onClick={() => void deleteCategory(row)}
                      disabled={saving}
                      style={smallDeleteButtonStyle}
                    >
                      刪除
                    </button>
                  </div>
                </div>
              ))}
            </section>
          </section>
        </div>
      )}

      {searchOpen && (
        <div style={sheetOverlayStyle} onClick={() => setSearchOpen(false)}>
          <section
            style={searchSheetStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={sheetHeaderStyle}>
              <h2 style={sheetTitleStyle}>加入商品</h2>
              <button
                onClick={() => setSearchOpen(false)}
                style={closeButtonStyle}
              >
                ×
              </button>
            </div>

            <input
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="搜尋 SKU / 商品名稱 / 條碼"
              autoFocus
              style={inputStyle}
            />

            {loadingProduct && <p style={emptyStyle}>搜尋中...</p>}
            {!loadingProduct && searchKeyword.trim().length === 0 && (
              <p style={emptyStyle}>請輸入 SKU、名稱或條碼</p>
            )}

            <div style={searchResultListStyle}>
              {searchResults.map((row) => (
                <button
                  key={row.product_sku}
                  onClick={() => selectProduct(row)}
                  style={searchResultStyle}
                >
                  <strong>{row.product_sku}</strong>
                  <span>{row.product_name}</span>
                  <small>
                    箱入數：{row.units_per_box}
                    {isFoodProduct(row) ? " / 食品" : ""}
                  </small>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  )
}

function ActionButton({
  code,
  title,
  subtitle,
  accent,
  onClick,
}: {
  code: string
  title: string
  subtitle: string
  accent: string
  onClick: () => void
}) {
  return (
    <button onClick={onClick} style={actionButtonStyle}>
      <span
        style={{
          ...actionCodeStyle,
          color: accent,
          borderColor: `${accent}66`,
          boxShadow: `0 0 26px ${accent}22`,
        }}
      >
        {code}
      </span>
      <span style={actionTextStyle}>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <span style={{ ...actionArrowStyle, color: accent }}>›</span>
    </button>
  )
}

function AuditList({
  title,
  audits,
  warehouses,
  loading,
  emptyText,
  onOpen,
  managing = false,
  saving = false,
  onDelete,
}: {
  title: string
  audits: AuditRow[]
  warehouses: Warehouse[]
  loading: boolean
  emptyText: string
  onOpen: (row: AuditRow) => void
  managing?: boolean
  saving?: boolean
  onDelete?: (row: AuditRow) => void
}) {
  return (
    <section style={listPanelStyle}>
      <div style={sectionTitleRowStyle}>
        <h2 style={sectionTitleStyle}>{title}</h2>
        <span style={mutedStyle}>{audits.length} 張</span>
      </div>

      {loading && <p style={emptyStyle}>讀取中...</p>}
      {!loading && audits.length === 0 && <p style={emptyStyle}>{emptyText}</p>}

      {audits.map((row) => {
        const expired = isAuditReviewExpired(row)

        return (
          <article key={row.id} style={auditRowStyle}>
            <button
              onClick={() => onOpen(row)}
              style={{
                ...auditOpenButtonStyle,
                paddingRight: managing ? 68 : 14,
              }}
            >
              <span>
                <strong>{row.biz_date}</strong>
                <small>
                  {getWarehouseName(row.warehouse_code, warehouses)} /{" "}
                  {formatStatus(row.status)} / {formatDateTime(row.created_at)}
                </small>
              </span>
              <span style={auditPillsStyle}>
                {expired && <span style={expiredPillStyle}>已逾期</span>}
                <span style={countPillStyle}>{row.item_count} 項</span>
              </span>
            </button>

            {managing && (
              <button
                onClick={() => onDelete?.(row)}
                disabled={saving || row.status === "approved"}
                style={{
                  ...auditDeleteButtonStyle,
                  opacity: saving || row.status === "approved" ? 0.46 : 1,
                }}
                aria-label="刪除盤點單"
              >
                -
              </button>
            )}
          </article>
        )
      })}
    </section>
  )
}

function AuditInfoCard({
  audit,
  warehouses,
  itemCount,
  box,
  piece,
}: {
  audit: AuditRecord
  warehouses: Warehouse[]
  itemCount: number
  box: number
  piece: number
}) {
  return (
    <section style={auditHeaderStyle}>
      <div>
        <h2 style={auditTitleStyle}>
          {audit.biz_date} {getWarehouseName(audit.warehouse_code, warehouses)}
        </h2>
        <p style={auditMetaStyle}>
          {formatStatus(audit.status)} / {itemCount} 項 / 箱 {formatNumber(box)} /
          散 {formatNumber(piece)}
        </p>
      </div>
      <span style={statusPillStyle}>{formatStatus(audit.status)}</span>
    </section>
  )
}

function AuditItemCard({
  item,
  editable,
  saving,
  onUpdate,
  onDelete,
}: {
  item: AuditItem
  editable: boolean
  saving: boolean
  onUpdate: (item: AuditItem, box: number, piece: number) => void
  onDelete: (item: AuditItem) => void
}) {
  const [box, setBox] = useState(String(item.count_box))
  const [piece, setPiece] = useState(String(item.count_piece))

  useEffect(() => {
    setBox(String(item.count_box))
    setPiece(String(item.count_piece))
  }, [item.count_box, item.count_piece])

  const nextBox = Number(box || "0")
  const nextPiece = Number(piece || "0")
  const changed = nextBox !== item.count_box || nextPiece !== item.count_piece

  return (
    <div style={itemCardStyle}>
      <div style={itemHeaderStyle}>
        <div>
          <strong style={skuStyle}>{item.product_sku}</strong>
          <div style={nameStyle}>{item.product_name}</div>
          <small style={mutedStyle}>
            箱入數：{item.units_per_box} / {formatDateTime(item.created_at)}
          </small>
        </div>
        {editable && (
          <button
            onClick={() => onDelete(item)}
            disabled={saving}
            style={deleteButtonStyle}
          >
            刪除
          </button>
        )}
      </div>

      <div style={qtyGridStyle}>
        <label style={fieldStyle}>
          <span>箱</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={box}
            onChange={(event) => setBox(event.target.value)}
            disabled={!editable}
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          <span>散</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={piece}
            onChange={(event) => setPiece(event.target.value)}
            disabled={!editable}
            style={inputStyle}
          />
        </label>
      </div>

      {editable && changed && (
        <button
          onClick={() => onUpdate(item, nextBox, nextPiece)}
          disabled={saving}
          style={secondaryButtonStyle}
        >
          更新數量
        </button>
      )}
    </div>
  )
}

function ReviewCard({ row }: { row: ReviewRow }) {
  const isSame = row.diff_box === 0 && row.diff_piece === 0

  return (
    <div style={reviewCardStyle}>
      <div style={reviewTopStyle}>
        <div>
          <strong style={skuStyle}>{row.product_sku}</strong>
          <div style={nameStyle}>{row.product_name}</div>
        </div>
        <span
          style={{
            ...diffPillStyle,
            color: isSame ? "#86efac" : "#fbbf24",
          }}
        >
          {isSame ? "一致" : "有差異"}
        </span>
      </div>

      <div style={compareGridStyle}>
        <div>
          <span>系統</span>
          <strong>
            箱 {formatNumber(row.system_box)} / 散 {formatNumber(row.system_piece)}
          </strong>
        </div>
        <div>
          <span>盤點</span>
          <strong>
            箱 {formatNumber(row.count_box)} / 散 {formatNumber(row.count_piece)}
          </strong>
        </div>
        <div>
          <span>差異</span>
          <strong>
            箱 {formatSigned(row.diff_box)} / 散 {formatSigned(row.diff_piece)}
          </strong>
        </div>
      </div>
    </div>
  )
}

function MissingStockCard({ row }: { row: StockMapValue }) {
  return (
    <div style={reviewCardStyle}>
      <div style={reviewTopStyle}>
        <div>
          <strong style={skuStyle}>{row.product_sku}</strong>
          <div style={nameStyle}>{row.product_name}</div>
        </div>
        <span style={{ ...diffPillStyle, color: "#f87171" }}>未盤</span>
      </div>

      <div style={compareGridStyle}>
        <div>
          <span>系統</span>
          <strong>
            箱 {formatNumber(row.box)} / 散 {formatNumber(row.piece)}
          </strong>
        </div>
        <div>
          <span>盤點</span>
          <strong>箱 0 / 散 0</strong>
        </div>
        <div>
          <span>差異</span>
          <strong>
            箱 {formatSigned(0 - row.box)} / 散 {formatSigned(0 - row.piece)}
          </strong>
        </div>
      </div>
    </div>
  )
}

function normalizeProduct(row: ProductRow): Product {
  return {
    product_sku: row.product_sku.toLowerCase(),
    product_name: row.product_name ?? row.product_sku,
    units_per_box: Number(row.units_per_box ?? 1),
    tags: row.tags ?? [],
  }
}

function normalizeAudit(row: AuditRecord | AuditRow): AuditRecord {
  return {
    id: Number(row.id),
    group_code: row.group_code,
    biz_date: row.biz_date,
    warehouse_code: row.warehouse_code,
    status: row.status as AuditStatus,
    created_by: row.created_by ?? null,
    approved_by: row.approved_by ?? null,
    approved_at: row.approved_at ?? null,
    created_at: row.created_at,
  }
}

function isFoodProduct(product: Product) {
  return product.tags.some((tag) => String(tag).trim() === "食品")
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

  return formatDateValue(base)
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00+08:00`)
  date.setDate(date.getDate() + days)
  return formatDateValue(date)
}

function isAuditReviewExpired(audit: Pick<AuditRecord, "biz_date" | "status">) {
  if (audit.status !== "submitted") return false

  const auditDate = new Date(`${audit.biz_date}T12:00:00+08:00`)
  const today = new Date(`${getBusinessDateValue()}T12:00:00+08:00`)
  const diffDays = Math.floor(
    (today.getTime() - auditDate.getTime()) / (24 * 60 * 60 * 1000)
  )

  return diffDays > AUDIT_REVIEW_LIMIT_DAYS
}

function formatDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getWarehouseName(value: string, warehouses: Warehouse[]) {
  const found = warehouses.find((row) => row.warehouse_code === value)
  if (found) return found.warehouse_name
  if (value === "main") return "總倉"
  if (value === "withdraw") return "撤台"
  if (value === "swap") return "夾換品"
  if (value === "onsite") return "現場"
  return value
}

function formatStatus(value: string) {
  if (value === "draft") return "草稿"
  if (value === "submitted") return "待審核"
  if (value === "approved") return "已執行"
  return value
}

function getScreenTitle(screen: Screen) {
  if (screen === "list") return "盤點單列表"
  if (screen === "pending") return "待審核盤點"
  if (screen === "entry") return "盤點輸入"
  if (screen === "review") return "審核執行"
  return "庫存盤點"
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatSigned(value: number) {
  if (value > 0) return `+${formatNumber(value)}`
  return formatNumber(value)
}

function formatDateTime(value: string) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function getErrorMessage(err: unknown, fallback: string) {
  if (err instanceof Error) return err.message
  if (typeof err === "object" && err !== null && "message" in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === "string") return message
  }
  return fallback
}

const pageStyle: CSSProperties = {
  minHeight: "100dvh",
  background: "linear-gradient(180deg, #05070b 0%, #080b12 100%)",
  color: "#f8fafc",
  padding:
    "calc(env(safe-area-inset-top, 0px) + 14px) 16px calc(env(safe-area-inset-bottom, 0px) + 92px)",
  boxSizing: "border-box",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
}

const topBarStyle: CSSProperties = {
  minHeight: 56,
  display: "grid",
  gridTemplateColumns: "44px minmax(0, 1fr) 72px",
  alignItems: "center",
  gap: 8,
  borderBottom: "1px solid rgba(148,163,184,0.14)",
  marginBottom: 16,
}

const backButtonStyle: CSSProperties = {
  width: 42,
  height: 42,
  border: "none",
  background: "transparent",
  color: "#e5e7eb",
  fontSize: 36,
  lineHeight: 1,
}

const titleBlockStyle: CSSProperties = {
  textAlign: "center",
}

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 20,
  lineHeight: 1.1,
  fontWeight: 950,
}

const subtitleStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 800,
}

const ghostButtonStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "#60a5fa",
  fontSize: 14,
  fontWeight: 950,
}

const menuPanelStyle: CSSProperties = {
  display: "grid",
  gap: 14,
}

const actionButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 104,
  display: "grid",
  gridTemplateColumns: "74px minmax(0, 1fr) 36px",
  gap: 14,
  alignItems: "center",
  border: "1px solid rgba(148,163,184,0.22)",
  borderRadius: 20,
  background:
    "linear-gradient(135deg, rgba(17,24,39,0.95), rgba(15,23,42,0.82))",
  color: "#f8fafc",
  padding: 16,
  textAlign: "left",
}

const actionCodeStyle: CSSProperties = {
  width: 62,
  height: 62,
  display: "grid",
  placeItems: "center",
  border: "1px solid",
  borderRadius: 16,
  background: "rgba(255,255,255,0.04)",
  fontSize: 16,
  fontWeight: 950,
}

const actionTextStyle: CSSProperties = {
  display: "grid",
  gap: 6,
}

const actionArrowStyle: CSSProperties = {
  fontSize: 44,
  fontWeight: 700,
  lineHeight: 1,
  textAlign: "right",
}

const panelStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 20,
  background: "rgba(15,23,42,0.78)",
  padding: 16,
  marginBottom: 14,
}

const labelStyle: CSSProperties = {
  color: "#cbd5e1",
  fontSize: 13,
  fontWeight: 900,
}

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 48,
  border: "1px solid rgba(148,163,184,0.26)",
  borderRadius: 14,
  background: "#070b14",
  color: "#f8fafc",
  fontSize: 16,
  padding: "0 14px",
  boxSizing: "border-box",
}

const selectStyle: CSSProperties = {
  ...inputStyle,
}

const primaryButtonStyle: CSSProperties = {
  minHeight: 52,
  border: "none",
  borderRadius: 16,
  background: "linear-gradient(135deg, #60a5fa, #3b82f6)",
  color: "#fff",
  fontSize: 16,
  fontWeight: 950,
}

const secondaryButtonStyle: CSSProperties = {
  minHeight: 46,
  border: "1px solid rgba(96,165,250,0.36)",
  borderRadius: 14,
  background: "rgba(96,165,250,0.12)",
  color: "#bfdbfe",
  fontSize: 14,
  fontWeight: 950,
}

const bottomButtonStyle: CSSProperties = {
  position: "fixed",
  left: 16,
  right: 16,
  bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
  minHeight: 56,
  border: "none",
  borderRadius: 18,
  background: "linear-gradient(135deg, #60a5fa, #3b82f6)",
  color: "#fff",
  fontSize: 17,
  fontWeight: 950,
  boxShadow: "0 16px 34px rgba(37,99,235,0.32)",
  zIndex: 10,
}

const messageStyle: CSSProperties = {
  border: "1px solid rgba(34,197,94,0.3)",
  borderRadius: 16,
  background: "rgba(22,101,52,0.22)",
  color: "#86efac",
  padding: 12,
  fontSize: 14,
  fontWeight: 850,
  marginBottom: 12,
}

const warningStyle: CSSProperties = {
  border: "1px solid rgba(251,191,36,0.3)",
  borderRadius: 16,
  background: "rgba(113,63,18,0.24)",
  color: "#fde68a",
  padding: 12,
  fontSize: 14,
  fontWeight: 850,
  marginBottom: 12,
}

const errorStyle: CSSProperties = {
  border: "1px solid rgba(248,113,113,0.32)",
  borderRadius: 16,
  background: "rgba(127,29,29,0.24)",
  color: "#fca5a5",
  padding: 12,
  fontSize: 14,
  fontWeight: 850,
  marginBottom: 12,
}

const listPanelStyle: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.2)",
  borderRadius: 20,
  background: "rgba(15,23,42,0.78)",
  padding: 16,
  marginBottom: 14,
}

const sectionTitleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
}

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 950,
}

const mutedStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 800,
}

const emptyStyle: CSSProperties = {
  color: "#94a3b8",
  fontSize: 14,
  fontWeight: 800,
  margin: "12px 0",
}

const auditRowStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 16,
  background: "rgba(2,6,23,0.44)",
  marginBottom: 10,
  overflow: "hidden",
}

const auditOpenButtonStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  border: "none",
  background: "transparent",
  color: "#f8fafc",
  padding: "14px 14px",
  textAlign: "left",
}

const auditDeleteButtonStyle: CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  width: 34,
  height: 34,
  border: "1px solid rgba(248,113,113,0.28)",
  borderRadius: 12,
  background: "rgba(239,68,68,0.16)",
  color: "#fca5a5",
  fontSize: 24,
  fontWeight: 950,
  lineHeight: 1,
}

const auditPillsStyle: CSSProperties = {
  flex: "0 0 auto",
  display: "flex",
  alignItems: "center",
  gap: 6,
}

const countPillStyle: CSSProperties = {
  flex: "0 0 auto",
  border: "1px solid rgba(96,165,250,0.32)",
  borderRadius: 999,
  color: "#bfdbfe",
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 950,
}

const expiredPillStyle: CSSProperties = {
  flex: "0 0 auto",
  border: "1px solid rgba(251,191,36,0.32)",
  borderRadius: 999,
  color: "#fde68a",
  background: "rgba(113,63,18,0.22)",
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 950,
}

const auditHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  border: "1px solid rgba(96,165,250,0.24)",
  borderRadius: 18,
  background: "rgba(30,41,59,0.72)",
  padding: 16,
  marginBottom: 14,
}

const auditTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 950,
}

const auditMetaStyle: CSSProperties = {
  margin: "7px 0 0",
  color: "#94a3b8",
  fontSize: 13,
  fontWeight: 850,
}

const statusPillStyle: CSSProperties = {
  flex: "0 0 auto",
  borderRadius: 999,
  background: "rgba(96,165,250,0.16)",
  color: "#bfdbfe",
  padding: "7px 10px",
  fontSize: 12,
  fontWeight: 950,
}

const selectedProductStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 10,
  border: "1px solid rgba(96,165,250,0.28)",
  borderRadius: 16,
  background: "rgba(96,165,250,0.1)",
  padding: 14,
}

const clearButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  border: "none",
  borderRadius: 12,
  background: "rgba(255,255,255,0.08)",
  color: "#e5e7eb",
  fontSize: 24,
}

const qtyGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
}

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  color: "#cbd5e1",
  fontSize: 13,
  fontWeight: 900,
}

const itemCardStyle: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 18,
  background: "rgba(2,6,23,0.44)",
  padding: 14,
  marginBottom: 12,
}

const itemHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
}

const skuStyle: CSSProperties = {
  display: "block",
  color: "#f8fafc",
  fontSize: 18,
  fontWeight: 950,
  marginBottom: 6,
}

const nameStyle: CSSProperties = {
  color: "#e5e7eb",
  fontSize: 14,
  fontWeight: 850,
  lineHeight: 1.35,
}

const deleteButtonStyle: CSSProperties = {
  flex: "0 0 auto",
  border: "none",
  borderRadius: 12,
  background: "rgba(239,68,68,0.14)",
  color: "#fca5a5",
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 950,
}

const reviewSummaryStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
  marginBottom: 14,
}

const reviewCardStyle: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 18,
  background: "rgba(2,6,23,0.44)",
  padding: 14,
  marginBottom: 12,
}

const reviewTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 12,
}

const diffPillStyle: CSSProperties = {
  flex: "0 0 auto",
  fontSize: 12,
  fontWeight: 950,
}

const compareGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
}

const categoryFormStyle: CSSProperties = {
  display: "grid",
  gap: 9,
  border: "1px solid rgba(96,165,250,0.22)",
  borderRadius: 18,
  background: "rgba(96,165,250,0.08)",
  padding: 14,
}

const categoryButtonGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 10,
  marginTop: 4,
}

const categoryListStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 4,
}

const categoryRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 12,
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 16,
  background: "rgba(2,6,23,0.44)",
  padding: 12,
}

const categoryNameStyle: CSSProperties = {
  display: "block",
  color: "#f8fafc",
  fontSize: 16,
  fontWeight: 950,
  marginBottom: 4,
}

const categoryCodeStyle: CSSProperties = {
  display: "block",
  color: "#94a3b8",
  fontSize: 12,
  fontWeight: 850,
}

const categoryActionStyle: CSSProperties = {
  display: "flex",
  gap: 8,
}

const smallEditButtonStyle: CSSProperties = {
  border: "1px solid rgba(96,165,250,0.34)",
  borderRadius: 12,
  background: "rgba(96,165,250,0.12)",
  color: "#bfdbfe",
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 950,
}

const smallDeleteButtonStyle: CSSProperties = {
  ...smallEditButtonStyle,
  border: "1px solid rgba(248,113,113,0.28)",
  background: "rgba(239,68,68,0.12)",
  color: "#fca5a5",
}

const sheetOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 20,
  display: "flex",
  alignItems: "flex-end",
  background: "rgba(0,0,0,0.66)",
}

const dialogSheetStyle: CSSProperties = {
  width: "100%",
  display: "grid",
  gap: 12,
  borderRadius: "24px 24px 0 0",
  background: "#111827",
  border: "1px solid rgba(148,163,184,0.18)",
  padding: "20px 16px calc(env(safe-area-inset-bottom, 0px) + 22px)",
  boxSizing: "border-box",
}

const searchSheetStyle: CSSProperties = {
  ...dialogSheetStyle,
  maxHeight: "78dvh",
  overflowY: "auto",
}

const sheetHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
}

const sheetTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 950,
}

const closeButtonStyle: CSSProperties = {
  width: 42,
  height: 42,
  border: "none",
  borderRadius: 16,
  background: "rgba(255,255,255,0.08)",
  color: "#f8fafc",
  fontSize: 26,
}

const searchResultListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  marginTop: 10,
}

const searchResultStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  border: "none",
  borderBottom: "1px solid rgba(148,163,184,0.14)",
  background: "transparent",
  color: "#f8fafc",
  padding: "12px 0",
  textAlign: "left",
}
