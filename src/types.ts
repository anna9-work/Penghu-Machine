export type Product = {
  product_sku: string
  product_name: string | null
  units_per_box: number
  enabled: boolean
  category: string | null
  tags: string[]
}

export type WarehouseKind = {
  warehouse_code: string
  warehouse_name: string
  sort_order: number
  enabled: boolean
}

export type StockRow = {
  warehouse_code: string
  warehouse_name: string
  product_sku: string
  product_name: string
  units_per_box: number
  box: number
  piece: number
  amount: number
  latest_expiry_date: string | null
}

export type LedgerRow = {
  id: number
  warehouse_code: string
  product_sku: string
  in_box: number
  in_piece: number
  out_box: number
  out_piece: number
  unit_cost_piece: number | null
  source: string
  expiry_date: string | null
  created_at: string
}