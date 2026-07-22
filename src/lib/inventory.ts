import { GROUP_CODE, supabase } from "./supabase"
import type { LedgerRow, Product, StockRow, WarehouseKind } from "../types"

export async function loadWarehouses() {
  const { data, error } = await supabase
    .from("warehouse_kinds")
    .select("warehouse_code, warehouse_name, sort_order, enabled")
    .eq("enabled", true)
    .order("sort_order", { ascending: true })

  if (error) throw error
  return (data || []) as WarehouseKind[]
}

export async function loadProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("product_sku, product_name, units_per_box, enabled, category, tags")
    .order("product_sku", { ascending: true })

  if (error) throw error
  return (data || []) as Product[]
}

export async function saveProduct(input: {
  product_sku: string
  product_name: string
  units_per_box: number
  category: string
  tags: string[]
  enabled: boolean
  barcode: string
}) {
  const productSku = input.product_sku.trim().toLowerCase()

  if (!productSku) throw new Error("請輸入商品編號")
  if (!input.product_name.trim()) throw new Error("請輸入商品名稱")
  if (input.units_per_box <= 0) throw new Error("每箱數量必須大於 0")

  const { error: productError } = await supabase.from("products").upsert({
    product_sku: productSku,
    product_name: input.product_name.trim(),
    units_per_box: input.units_per_box,
    category: input.category.trim() || null,
    tags: input.tags,
    enabled: input.enabled,
  })

  if (productError) throw productError

  const { error: deleteBarcodeError } = await supabase
    .from("product_barcodes")
    .delete()
    .eq("product_sku", productSku)

  if (deleteBarcodeError) throw deleteBarcodeError

  const barcode = input.barcode.trim()
  if (barcode) {
    const { error: barcodeError } = await supabase.from("product_barcodes").insert({
      product_sku: productSku,
      barcode,
      enabled: true,
    })

    if (barcodeError) throw barcodeError
  }
}

export async function loadStock(bizDate: string) {
  const { data, error } = await supabase.rpc("get_business_day_stock", {
    p_group: GROUP_CODE,
    p_biz_date: bizDate,
  })

  if (error) throw error
  return (data || []) as StockRow[]
}

export async function inbound(input: {
  product_sku: string
  warehouse_code: string
  in_box: number
  in_piece: number
  unit_cost_piece: number
  expiry_date: string
}) {
  const { error } = await supabase.rpc("app_inbound_min_v2", {
    p_group: GROUP_CODE,
    p_sku: input.product_sku,
    p_wh_code: input.warehouse_code,
    p_in_box: input.in_box,
    p_in_piece: input.in_piece,
    p_unit_cost_piece: input.unit_cost_piece,
    p_at: new Date().toISOString(),
    p_source: "penghu_frontend_inbound",
    p_expiry_date: input.expiry_date || null,
  })

  if (error) throw error
}

export async function outbound(input: {
  product_sku: string
  warehouse_code: string
  out_box: number
  out_piece: number
}) {
  const { error } = await supabase.rpc("rpc_outbound_min", {
    p_group_code: GROUP_CODE,
    p_warehouse_code: input.warehouse_code,
    p_product_sku: input.product_sku,
    p_out_box: input.out_box,
    p_out_piece: input.out_piece,
    p_source: "penghu_frontend_outbound",
    p_at: new Date().toISOString(),
  })

  if (error) throw error
}

export async function loadRecentLedger() {
  const { data, error } = await supabase
    .from("inventory_ledger")
    .select(
      "id, warehouse_code, product_sku, in_box, in_piece, out_box, out_piece, unit_cost_piece, source, expiry_date, created_at",
    )
    .eq("group_code", GROUP_CODE)
    .order("created_at", { ascending: false })
    .limit(30)

  if (error) throw error
  return (data || []) as LedgerRow[]
}