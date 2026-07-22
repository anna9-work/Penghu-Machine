//app.tsx
import { useState } from "react"

import Home from "./pages/Home"
import AuditPage from "./pages/AuditPage"
import AuditHistory from "./pages/AuditHistory"
import MachineManage from "./pages/MachineManage"
import MachineDetail from "./pages/MachineDetail"
import MachineProfitPage from "./pages/MachineProfitPage"
import MachineInnerAdjustPage from "./pages/MachineInnerAdjustPage"
import ProductManage from "./pages/ProductManage"
import InboundPage from "./pages/InboundPage"
import AdjustmentPage from "./pages/AdjustmentPage"
import LineBotPage from "./pages/LineBotPage"
import InventoryAuditPage from "./pages/InventoryAuditPage"
import { supabase } from "./lib/supabase"

type Page =
  | "home"
  | "audit"
  | "history"
  | "machines"
  | "machineDetail"
  | "machineProfit"
  | "machineInnerAdjust"
  | "products"
  | "inbound"
  | "adjustment"
  | "lineBot"
  | "inventoryAudit"

const GROUP_CODE = "catch_0001"

function App() {
  const [page, setPage] = useState<Page>("home")
  const [auditId, setAuditId] = useState<number | null>(null)
  const [selectedMachineNo, setSelectedMachineNo] = useState("")
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [error, setError] = useState("")

  async function openTodayAudit() {
    try {
      setLoadingAudit(true)
      setError("")

      const { data, error } = await supabase.rpc(
        "machine_create_or_get_today_audit",
        {
          p_group: GROUP_CODE,
        }
      )

      if (error) throw error

      setAuditId(Number(data))
      setPage("audit")
    } catch (err: any) {
      console.error(err)
      setError(err.message ?? "取得今日盤點單失敗")
    } finally {
      setLoadingAudit(false)
    }
  }

  if (loadingAudit) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#050913",
          color: "#fff",
          padding: 24,
          boxSizing: "border-box",
        }}
      >
        載入今日盤點單...
      </div>
    )
  }

  if (page === "audit") {
    return <AuditPage auditId={auditId} onBack={() => setPage("home")} />
  }

  if (page === "history") {
    return <AuditHistory onBack={() => setPage("home")} />
  }

  if (page === "machines") {
    return (
      <MachineManage
        onBack={() => setPage("home")}
        onAuditClick={openTodayAudit}
        onOpenMachine={(machineNo) => {
          setSelectedMachineNo(machineNo)
          setPage("machineDetail")
        }}
      />
    )
  }

  if (page === "machineDetail") {
    return (
      <MachineDetail
        machineNo={selectedMachineNo}
        onBack={() => setPage("machines")}
      />
    )
  }

  if (page === "machineProfit") {
    return (
      <MachineProfitPage
        onBack={() => setPage("home")}
        onInnerAdjustClick={() => setPage("machineInnerAdjust")}
      />
    )
  }

  if (page === "machineInnerAdjust") {
    return <MachineInnerAdjustPage onBack={() => setPage("machineProfit")} />
  }

  if (page === "products") {
    return <ProductManage onBack={() => setPage("home")} />
  }

  if (page === "inbound") {
    return <InboundPage onBack={() => setPage("home")} />
  }

  if (page === "adjustment") {
    return <AdjustmentPage onBack={() => setPage("home")} />
  }

  if (page === "lineBot") {
    return <LineBotPage onBack={() => setPage("home")} />
  }

  if (page === "inventoryAudit") {
    return <InventoryAuditPage onBack={() => setPage("home")} />
  }

  return (
    <>
      {error && (
        <div
          style={{
            background: "#2a0f14",
            color: "#ff9999",
            padding: 12,
            fontSize: 15,
          }}
        >
          {error}
        </div>
      )}

      <Home
        onAuditClick={openTodayAudit}
        onHistoryClick={() => setPage("history")}
        onMachineClick={() => setPage("machines")}
        onMachineProfitClick={() => setPage("machineProfit")}
        onProductClick={() => setPage("products")}
        onInboundClick={() => setPage("inbound")}
        onAdjustmentClick={() => setPage("adjustment")}
        onLineBotClick={() => setPage("lineBot")}
        onInventoryAuditClick={() => setPage("inventoryAudit")}
      />
    </>
  )
}

export default App
