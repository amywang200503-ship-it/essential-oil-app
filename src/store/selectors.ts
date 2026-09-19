import type { AppState, Customer, InventoryRecord, Order, Product } from './AppStore'

export const isSameMonth = (date: string, today: string) => date.slice(0, 7) === today.slice(0, 7)
export const currentStock = (item: InventoryRecord) => item.inbound - item.outbound
export const availableStock = (item: InventoryRecord) => currentStock(item) - item.reserved
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