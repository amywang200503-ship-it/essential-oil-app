import type { AppState, Customer, InventoryRecord, Order, Product } from './AppStore'

export const isSameMonth = (date: string, today: string) => date.slice(0, 7) === today.slice(0, 7)
export const currentStock = (item: InventoryRecord) => item.inbound - item.outbound
export const availableStock = (item: InventoryRecord) => currentStock(item) - item.reserved

/** 库存默认计量单位：无 unit 的历史数据按此解释（不改变旧函数行为）。 */
export const DEFAULT_INVENTORY_UNIT = 'KG'
/** 批次计量单位：缺失时回退默认单位，兼容历史数据。 */
export const recordUnit = (item: InventoryRecord): string => item.unit || DEFAULT_INVENTORY_UNIT
/** 单位化库存文案，如 "72 KG"、"500 ML"、"20 桶"；unit 缺失时按默认单位展示。 */
export const formatInventoryAmount = (amount: number, unit?: string): string => `${amount} ${unit || DEFAULT_INVENTORY_UNIT}`

/**
 * FIFO 候选批次（单位感知）：按 productId 过滤 →（可选）按计量单位过滤 → 按 inboundDate 升序。
 * 传入 unit 时只返回同单位批次，杜绝 KG / ML / 桶 混入同一次数量分配；unit 缺省时等同于旧行为。
 */
export const getFifoInventoryRecords = (inventory: InventoryRecord[], productId: string, unit?: string): InventoryRecord[] =>
  inventory
    .filter((item) => item.productId === productId && (!unit || recordUnit(item) === unit))
    .sort((a, b) => a.inboundDate.localeCompare(b.inboundDate))

/** 单位感知 FIFO 分配结果（只使用同一单位的批次）。 */
export type InventoryAllocation = { inventoryId: string; batch: string; quantity: number }

/**
 * 单位感知 FIFO 分配：只在 recordUnit 等于 unit 的批次之间按入库日期分配。
 * remaining > 0 表示该单位库存不足，调用方必须提示并放弃（严禁用其它单位批次补足）。
 */
export const planFifoAllocation = (inventory: InventoryRecord[], productId: string, quantity: number, unit: string): { allocations: InventoryAllocation[]; remaining: number } => {
  let remaining = quantity
  const allocations: InventoryAllocation[] = []
  for (const record of getFifoInventoryRecords(inventory, productId, unit)) {
    if (remaining <= 0) break
    const available = availableStock(record)
    if (available <= 0) continue
    const take = Math.min(available, remaining)
    allocations.push({ inventoryId: record.id, batch: record.batch, quantity: take })
    remaining -= take
  }
  return { allocations, remaining }
}

/** 预占单位校验：返回第一个与目标单位不一致的预占批次（无 unit 的历史批次按默认单位解释）。 */
export const findReservationUnitMismatch = (inventory: InventoryRecord[], reservations: { inventoryId: string }[], unit: string): { batch: string; unit: string } | undefined => {
  for (const reservation of reservations) {
    const record = inventory.find((item) => item.id === reservation.inventoryId)
    if (!record) continue
    if (recordUnit(record) !== unit) return { batch: record.batch, unit: recordUnit(record) }
  }
  return undefined
}
const daysUntil = (date: string, today: string) => Math.ceil((new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000)

/** 数据中心统一日期区间（YYYY-MM-DD，闭区间，包含 start 与 end）。 */
export type DateRange = { start: string; end: string }
/** 数据中心统计周期选项（与 DataCenter 顶部 6 个按钮一致，单一来源）。 */
export type AnalyticsPeriod = '今日' | '本周' | '本月' | '本季度' | '今年' | '自定义'
const pad2 = (value: number) => String(value).padStart(2, '0')
const toLocalDate = (date: string) => new Date(`${date}T00:00:00`)
const formatDate = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
const isValidDateString = (date: string | undefined): date is string => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  return !Number.isNaN(toLocalDate(date).getTime())
}
const shiftDays = (date: string, days: number) => { const value = toLocalDate(date); value.setDate(value.getDate() + days); return formatDate(value) }

/** 按统计周期计算闭区间 [start, end]；end 统一为 today，自定义无合法区间或 today 非法时安全回退为 [today, today]。 */
export const getAnalyticsDateRange = (period: AnalyticsPeriod, today: string, customRange?: DateRange): DateRange => {
  if (period === '自定义' && isValidDateString(customRange?.start) && isValidDateString(customRange?.end)) return { start: customRange.start, end: customRange.end }
  if (!isValidDateString(today)) return { start: today, end: today }
  switch (period) {
    case '今日': return { start: today, end: today }
    case '本周': return { start: shiftDays(today, -((toLocalDate(today).getDay() + 6) % 7)), end: today }
    case '本月': return { start: `${today.slice(0, 7)}-01`, end: today }
    case '本季度': return { start: `${today.slice(0, 4)}-${pad2(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1)}-01`, end: today }
    case '今年': return { start: `${today.slice(0, 4)}-01-01`, end: today }
    default: return { start: today, end: today }
  }
}

/** 判断 YYYY-MM-DD 是否落在闭区间内（字符串比较，不依赖系统当前时间，缺失/非法日期返回 false）。 */
export const isWithinDateRange = (date: string | undefined, range: DateRange): boolean => isValidDateString(date) && isValidDateString(range.start) && isValidDateString(range.end) && date >= range.start && date <= range.end
const orderTotal = (order: Order) => order.quantity * order.price + order.freight + order.tax

export const selectTotalCustomers = (state: AppState) => state.customers.length
export const selectNewCustomers = (state: AppState) => state.customers.filter((customer) => isSameMonth(customer.lastContact, state.settings.simulatedToday)).length
export const selectHighIntentCustomers = (state: AppState) => state.customers.filter((customer) => customer.status === '高意向')
export const selectPendingFollowUps = (state: AppState) => state.followUps.filter((followUp) => followUp.status !== '已完成')
const parseSafetyText = (safety: string | undefined): number | undefined => {
  if (!safety) return undefined
  const match = String(safety).match(/\d+(\.\d+)?/)
  return match ? Number(match[0]) : undefined
}

const productSafetyStock = (records: InventoryRecord[], products: Product[]): number => {
  const productId = records[0].productId
  const fromProduct = parseSafetyText(products.find((product) => product.id === productId)?.safety)
  if (fromProduct !== undefined) return fromProduct
  const counts = new Map<number, number>()
  for (const record of records) counts.set(record.safetyStock, (counts.get(record.safetyStock) ?? 0) + 1)
  let mode: number | undefined
  let maxCount = 0
  for (const [value, count] of counts) {
    if (count > maxCount) { mode = value; maxCount = count }
  }
  return mode ?? 0
}

export const selectLowStockProducts = (state: AppState): InventoryRecord[] => {
  const groups = new Map<string, InventoryRecord[]>()
  for (const record of state.inventory) {
    const list = groups.get(record.productId) ?? []
    list.push(record)
    groups.set(record.productId, list)
  }
  return Array.from(groups.values()).map((records): InventoryRecord => {
    const first = records[0]
    const latest = records.reduce((a, b) => (b.inboundDate > a.inboundDate ? b : a), first)
    const earliestExpiry = records.reduce((a, b) => (!a.expiry || (b.expiry && b.expiry < a.expiry) ? b : a), first)
    return {
      id: first.id,
      productId: first.productId,
      productName: first.productName,
      category: first.category,
      inbound: records.reduce((sum, record) => sum + record.inbound, 0),
      outbound: records.reduce((sum, record) => sum + record.outbound, 0),
      reserved: records.reduce((sum, record) => sum + record.reserved, 0),
      safetyStock: productSafetyStock(records, state.products),
      batch: latest.batch,
      inboundDate: latest.inboundDate,
      outboundDate: records.reduce((max, record) => (record.outboundDate > max ? record.outboundDate : max), ''),
      expiry: earliestExpiry.expiry,
    }
  }).filter((item) => currentStock(item) < item.safetyStock)
}
export const selectExpiringProducts = (state: AppState) => state.inventory.filter((item) => item.expiry && daysUntil(item.expiry, state.settings.simulatedToday) >= 0 && daysUntil(item.expiry, state.settings.simulatedToday) <= 30)
export const selectTotalInventory = (state: AppState) => state.inventory.reduce((sum, item) => sum + currentStock(item), 0)
export const selectAvailableStock = (state: AppState) => state.inventory.reduce((sum, item) => sum + availableStock(item), 0)

/**
 * 单位感知库存统计（按 unit 分组，不修改旧的 selectTotalInventory / selectAvailableStock 签名与行为）。
 * 跨单位不做直接相加，避免 KG / ML / 桶 混算。
 */
export type InventoryUnitTotal = {
  unit: string
  currentStock: number
  availableStock: number
  batches: number
}

export const selectInventoryTotalsByUnit = (state: AppState): InventoryUnitTotal[] => {
  const groups = new Map<string, InventoryUnitTotal>()
  for (const item of state.inventory) {
    const unit = recordUnit(item)
    const group = groups.get(unit) ?? { unit, currentStock: 0, availableStock: 0, batches: 0 }
    group.currentStock += currentStock(item)
    group.availableStock += availableStock(item)
    group.batches += 1
    groups.set(unit, group)
  }
  return Array.from(groups.values()).sort((a, b) => b.currentStock - a.currentStock || a.unit.localeCompare(b.unit))
}

/** 库存总量文案（按单位分列，如 "100 KG · 500 ML"）；无库存记录时回退 "0 KG"。 */
export const selectInventoryTotalLabel = (state: AppState): string => {
  const totals = selectInventoryTotalsByUnit(state)
  return totals.length ? totals.map((total) => formatInventoryAmount(total.currentStock, total.unit)).join(' · ') : formatInventoryAmount(0)
}

/**
 * 某产品当前批次的计量单位：全部批次单位一致时返回该单位；
 * 多批次单位混合时返回 '多单位'（不做跨单位换算）；无库存记录时回退默认单位。
 */
export const selectProductUnit = (state: AppState, productId: string): string => {
  const units = Array.from(new Set(state.inventory.filter((item) => item.productId === productId).map((item) => recordUnit(item))))
  if (!units.length) return DEFAULT_INVENTORY_UNIT
  return units.length === 1 ? units[0] : '多单位'
}

/** 某产品各批次计量单位汇总（按单位分组，用于产品级单位感知展示）。 */
export const selectProductTotalsByUnit = (state: AppState, productId: string): InventoryUnitTotal[] => {
  const groups = new Map<string, InventoryUnitTotal>()
  for (const item of state.inventory) {
    if (item.productId !== productId) continue
    const unit = recordUnit(item)
    const group = groups.get(unit) ?? { unit, currentStock: 0, availableStock: 0, batches: 0 }
    group.currentStock += currentStock(item)
    group.availableStock += availableStock(item)
    group.batches += 1
    groups.set(unit, group)
  }
  return Array.from(groups.values()).sort((a, b) => b.currentStock - a.currentStock || a.unit.localeCompare(b.unit))
}

/** 业务计量单位白名单（仅用于校验与表单选项渲染；本轮不做任何单位换算）。 */
export const BUSINESS_UNITS = ['KG', 'ML', '桶'] as const
/** 是否为受支持的计量单位（区别于包装规格自由文本）。 */
export const isValidBusinessUnit = (unit: string): boolean => (BUSINESS_UNITS as readonly string[]).includes(unit)

/**
 * 报价库存判断（单位一致性前置）：
 * - comparable=true 时 stock 为「与报价单位一致」的库存数量（同一单位内比较，永不跨单位、不换算）；
 * - comparable=false 时不进行数值比较，reason 说明原因：
 *   unit-mismatch = 产品库存单位与报价单位不一致；no-unit-stock = 该单位下没有库存。
 */
export type QuoteStockStatus = {
  stockUnit: string
  comparable: boolean
  stock?: number
  reason?: 'unit-mismatch' | 'no-unit-stock'
}

export const selectQuoteStockStatus = (state: AppState, productId: string, unit: string): QuoteStockStatus => {
  const stockUnit = selectProductUnit(state, productId)
  const group = selectProductTotalsByUnit(state, productId).find((item) => item.unit === unit)
  if (group) return { stockUnit, comparable: true, stock: group.currentStock }
  const mismatched = stockUnit !== '多单位' && stockUnit !== unit
  return { stockUnit, comparable: false, reason: mismatched ? 'unit-mismatch' : 'no-unit-stock' }
}
export const selectInventoryByProduct = (state: AppState, productId: string) => state.inventory.filter((item) => item.productId === productId)
export const selectInventoryByBatch = (state: AppState, batch: string) => state.inventory.filter((item) => item.batch === batch)
export const selectPendingSamples = (state: AppState) => state.samples.filter((sample) => ['等待反馈', '已寄出', '已签收', '测试中'].includes(sample.status))
export const selectPendingQuotes = (state: AppState) => state.quotes.filter((quote) => ['已发送', '客户查看', '待确认'].includes(quote.status))
export const selectExpiringQuotes = (state: AppState) => state.quotes.filter((quote) => { const days = (new Date(`${quote.validUntil}T00:00:00`).getTime() - new Date(`${state.settings.simulatedToday}T00:00:00`).getTime()) / 86400000; return days >= 0 && days <= 7 })
export const selectTotalOrders = (state: AppState) => state.orders.length
export const selectCompletedOrders = (state: AppState) => state.orders.filter((order) => order.status === '已完成')
export const selectPendingPayments = (state: AppState) => state.orders.filter((order) => order.payment !== '已付款')
export const selectPendingShipments = (state: AppState) => state.orders.filter((order) => order.shipped < order.quantity && order.status !== '已取消')
export const selectMonthlySales = (state: AppState) => state.orders.filter((order) => isSameMonth(order.orderDate, state.settings.simulatedToday) && order.status === '已完成').reduce((sum, order) => sum + orderTotal(order), 0)
export const selectDailySales = (state: AppState, days = 7): { date: string; amount: number }[] => {
  const today = state.settings.simulatedToday
  const dates: string[] = []
  for (let i = days - 1; i >= 0; i -= 1) {
    const current = new Date(`${today}T00:00:00`)
    current.setDate(current.getDate() - i)
    dates.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`)
  }
  const byDate = new Map<string, number>()
  for (const order of state.orders) {
    if (order.status !== '已完成') continue
    byDate.set(order.orderDate, (byDate.get(order.orderDate) ?? 0) + orderTotal(order))
  }
  return dates.map((date) => ({ date, amount: byDate.get(date) ?? 0 }))
}
export const selectAverageOrderValue = (state: AppState) => { const validOrders = state.orders.filter((order) => order.status !== '已取消'); return validOrders.length ? validOrders.reduce((sum, order) => sum + orderTotal(order), 0) / validOrders.length : 0 }

export const selectTopCustomers = (state: AppState) => state.customers.map((customer) => ({ ...customer, orderCount: state.orders.filter((order) => order.customerId === customer.id).length })).sort((a, b) => b.amount - a.amount)

/** 客户订单统计（P1：统一从 state.orders / quotes / samples 派生，复用 isSameMonth 即 monthlyKey 口径）。 */
export type CustomerOrderStats = {
  orderCount: number
  monthlyOrderCount: number
  completedCount: number
  totalSpent: number
  lastOrderDate: string
  quoteCount: number
  sampleCount: number
}

export const selectCustomerStats = (state: AppState, customerId: string): CustomerOrderStats => {
  const orders = state.orders.filter((order) => order.customerId === customerId)
  const today = state.settings.simulatedToday
  return {
    orderCount: orders.length,
    monthlyOrderCount: orders.filter((order) => isSameMonth(order.orderDate, today)).length,
    completedCount: orders.filter((order) => order.status === '已完成').length,
    totalSpent: orders.filter((order) => order.status === '已完成').reduce((sum, order) => sum + orderTotal(order), 0),
    lastOrderDate: orders.reduce((max, order) => (order.orderDate > max ? order.orderDate : max), ''),
    quoteCount: state.quotes.filter((quote) => quote.customerId === customerId).length,
    sampleCount: state.samples.filter((sample) => sample.customerId === customerId).length,
  }
}
export const selectTopProducts = (state: AppState) => state.products.map((product) => { const orders = state.orders.filter((order) => order.productId === product.id); return { ...product, orderCount: orders.length, quantity: orders.reduce((sum, order) => sum + order.quantity, 0), sales: orders.reduce((sum, order) => sum + orderTotal(order), 0) } }).sort((a, b) => b.sales - a.sales)
/** 销售漏斗：系统没有独立可靠的“询价记录”数据源，故不提供 inquiries（不使用报价数 + 样品数伪造询价数量）。 */
export const selectSalesFunnel = (state: AppState) => ({ customers: state.customers.length, samples: state.samples.length, quotes: state.quotes.length, orders: state.orders.length, completedOrders: selectCompletedOrders(state).length })
export const selectProductDocumentCompleteness = (state: AppState, productId: string) => { const required = ['COA', 'SDS', 'TDS', '规格书', '批次资料']; const available = state.productDocuments.filter((document) => document.productId === productId).map((document) => document.type); return Math.round(required.filter((type) => available.includes(type)).length / required.length * 100) }
export const selectPendingTasks = (state: AppState) => ({ followUps: selectPendingFollowUps(state), lowStock: selectLowStockProducts(state), samples: selectPendingSamples(state), quotes: selectPendingQuotes(state), payments: selectPendingPayments(state), shipments: selectPendingShipments(state) })

export const selectCustomersByStatus = (state: AppState, status: string): Customer[] => state.customers.filter((customer) => customer.status === status)
export const selectProductsWithStock = (state: AppState): (Product & { currentStock: number })[] => state.products.map((product) => ({ ...product, currentStock: state.inventory.filter((item) => item.productId === product.id).reduce((sum, item) => sum + currentStock(item), 0) }))