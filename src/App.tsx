import { useState } from "react"

import Home from "./pages/Home"
import ProductManage from "./pages/ProductManage"
import InboundPage from "./pages/InboundPage"
import AdjustmentPage from "./pages/AdjustmentPage"
import LineBotPage from "./pages/LineBotPage"
import InventoryAuditPage from "./pages/InventoryAuditPage"

type Page =
  | "home"
  | "products"
  | "inbound"
  | "adjustment"
  | "lineBot"
  | "inventoryAudit"

function App() {
  const [page, setPage] = useState<Page>("home")

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
    <Home
      onAuditClick={() => setPage("inventoryAudit")}
      onHistoryClick={() => setPage("inventoryAudit")}
      onMachineClick={() => setPage("inventoryAudit")}
      onMachineProfitClick={() => setPage("inventoryAudit")}
      onProductClick={() => setPage("products")}
      onInboundClick={() => setPage("inbound")}
      onAdjustmentClick={() => setPage("adjustment")}
      onLineBotClick={() => setPage("lineBot")}
      onInventoryAuditClick={() => setPage("inventoryAudit")}
    />
  )
}

export default App
