import type { SupabaseClient } from "@supabase/supabase-js"

export type WarehouseKind = {
  warehouse_code: string
  warehouse_name: string
  enabled?: boolean | null
}

export const DEFAULT_WAREHOUSE_ORDER = ["main", "withdraw", "swap", "onsite"]
export const WAREHOUSE_FALLBACK: WarehouseKind[] = [
  { warehouse_code: "main", warehouse_name: "總倉", enabled: true },
]

export function isWarehouseEnabled(row: WarehouseKind) {
  return row.enabled !== false
}

export function sortWarehouseKinds<T extends WarehouseKind>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const aIndex = DEFAULT_WAREHOUSE_ORDER.indexOf(a.warehouse_code)
    const bIndex = DEFAULT_WAREHOUSE_ORDER.indexOf(b.warehouse_code)

    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex
    if (aIndex >= 0) return -1
    if (bIndex >= 0) return 1
    return a.warehouse_code.localeCompare(b.warehouse_code)
  })
}

export async function loadEnabledWarehouseKinds(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("warehouse_kinds")
    .select("warehouse_code,warehouse_name")
    .eq("enabled", true)
    .order("warehouse_code", { ascending: true })

  if (error) {
    console.error(error)
    return WAREHOUSE_FALLBACK
  }

  return sortWarehouseKinds((data ?? []) as WarehouseKind[])
}

export async function loadAllWarehouseKinds(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("warehouse_kinds")
    .select("warehouse_code,warehouse_name,enabled")
    .order("warehouse_code", { ascending: true })

  if (error) {
    console.error(error)
    return WAREHOUSE_FALLBACK
  }

  return sortWarehouseKinds((data ?? []) as WarehouseKind[])
}

export function getWarehouseName(value: string, warehouses: WarehouseKind[]) {
  return warehouses.find((row) => row.warehouse_code === value)?.warehouse_name ?? value
}
