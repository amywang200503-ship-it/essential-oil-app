import { useEffect, useState } from 'react'
import { useAppStore, type Customer as StoreCustomer, type Formula as StoreFormula, type InventoryRecord as StoreInventoryRecord, type LeadCandidate as StoreLeadCandidate, type Order as StoreOrder, type Product as StoreProduct, type ProductDraft as StoreProductDraft, type Quote as StoreQuote, type Sample as StoreSample } from './store/AppStore'
import { type AnalyticsPeriod as StoreAnalyticsPeriod, type DateRange, getAnalyticsDateRange, isSameMonth, isWithinDateRange, selectAverageOrderValue, selectCompletedOrders, selectCustomerStats, selectDailySales, selectExpiringProducts, selectExpiringQuotes, selectHighIntentCustomers, selectLowStockProducts, selectMonthlySales, selectNewCustomers, selectPendingPayments, selectPendingQuotes, selectPendingSamples, selectPendingShipments, selectPendingTasks, selectProductsWithStock, selectSalesFunnel, selectTotalInventory } from './store/selectors'
import { generateLeadCandidate, generateProductDraft } from './services/templateGenerator'
import { aiStructureProduct, researchProductUrl, type UrlResearchResult } from './services/productResearch'
import './App.css'

/* eslint-disable no-irregular-whitespace */

const navItems = [
  ['⌂', '工作台'], ['✦', '产品中心'], ['▣', '库存管理'], ['♙', '客户 CRM'],
  ['◌', '客户跟进'], ['♧', '样品管理'], ['¥', '报价管理'], ['▰', '订单管理'],
  ['⌬', '配方实验室'], ['▤', '产品资料'], ['▥', '数据中心'], ['✧', 'AI 助手'], ['✎', 'AI 采集'], ['⚙', '系统设置'],
]

// 产品销量/询价已改为从 orders/quotes 派生（P2-5-3）

const quickActions = ['新客户', '新产品', '新跟进', '新样品', '新报价', '新订单']

type Product = StoreProduct

const productCategories = ['全部', '精油', '植物油', '纯露', '天然泥粉', '其他原料']

type InventoryItem = {
  name: string
  category: string
  inbound: number
  outbound: number
  safety: number
  batch: string
  inboundDate: string
  outboundDate: string
  expiry: string
  tone: string
}

const inventoryData: InventoryItem[] = [
  { name: '摩洛哥阿甘油', category: '植物油', inbound: 100, outbound: 28, safety: 10, batch: 'ARG20260801', inboundDate: '2026-08-01', outboundDate: '2026-08-20', expiry: '2028-08-01', tone: 'amber' },
  { name: '摩洛哥仙人掌籽油', category: '植物油', inbound: 20, outbound: 12, safety: 10, batch: 'CPS20260718', inboundDate: '2026-07-18', outboundDate: '2026-08-18', expiry: '2026-09-12', tone: 'sage' },
  { name: '摩洛哥熔岩泥', category: '天然泥粉', inbound: 150, outbound: 30, safety: 20, batch: 'RHL20260805', inboundDate: '2026-08-05', outboundDate: '2026-08-15', expiry: '2028-08-05', tone: 'clay' },
]

const mapInventoryItems = (inventory: StoreInventoryRecord[], products: StoreProduct[]): InventoryItem[] => {
  const groups = new Map<string, StoreInventoryRecord[]>()
  for (const record of inventory) {
    const list = groups.get(record.productId) ?? []
    list.push(record)
    groups.set(record.productId, list)
  }
  return Array.from(groups.values()).map((records) => {
    const first = records[0]
    const latest = records.reduce((a, b) => (b.inboundDate > a.inboundDate ? b : a), first)
    const earliestExpiry = records.reduce((a, b) => (!a.expiry || (b.expiry && b.expiry < a.expiry) ? b : a), first)
    return {
      name: first.productName,
      category: first.category,
      inbound: records.reduce((sum, record) => sum + record.inbound, 0),
      outbound: records.reduce((sum, record) => sum + record.outbound, 0),
      safety: productSafetyStock(records, products),
      batch: latest.batch,
      inboundDate: latest.inboundDate,
      outboundDate: records.reduce((max, record) => (record.outboundDate > max ? record.outboundDate : max), ''),
      expiry: earliestExpiry.expiry,
      tone: products.find((product) => product.id === first.productId)?.tone ?? '',
    }
  })
}

const parseSafetyText = (safety: string | undefined): number | undefined => {
  if (!safety) return undefined
  const match = String(safety).match(/\d+(\.\d+)?/)
  return match ? Number(match[0]) : undefined
}

const productSafetyStock = (records: StoreInventoryRecord[], products: StoreProduct[]): number => {
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

const inventoryFilters = ['全部', '正常库存', '低库存', '临期', '缺货']

type Customer = StoreCustomer

const customerFilters = ['全部', '高意向', '跟进中', '待跟进', '已成交', '长期客户']
const customerStatuses = ['新客户', '跟进中', '高意向', '待报价', '待样品反馈', '已成交', '长期客户', '暂缓', '流失']
const customerTags = ['化妆品工厂', '化妆品品牌', '美容院', 'SPA', '芳疗师', '芳疗工作室', '贸易商', '采购', '配方师', '品牌方']

type Sample = StoreSample

const sampleFilters = ['全部', '申请中', '准备中', '已寄出', '已签收', '等待反馈', '已完成']

type Quote = StoreQuote

type Order = StoreOrder

const orderFilters = ['全部', '待付款', '已付款', '待发货', '部分发货', '已发货', '已完成', '已取消']

function OrderManagement({ onBack, onCustomer, onProduct }: { onBack: () => void; onCustomer: () => void; onProduct: () => void }) {
  const { state, dispatch } = useAppStore()
  const orders = state.orders
  const today = state.settings.simulatedToday
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('全部')
  const [selected, setSelected] = useState<Order | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [shipping, setShipping] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [relinkOpen, setRelinkOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const showNotice = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2300) }
  const total = (order: Order) => order.quantity * order.price + order.freight + order.tax
  const available = (order: Order) =>
    order.status === '已取消'
      ? (order.stock ?? 0)
      : (order.stock ?? 0) - order.quantity + order.shipped
  const visible = orders.filter((order) => { const text = `${order.id} ${order.customer} ${order.contact ?? ''} ${order.product} ${order.tracking ?? ''}`.toLowerCase(); return text.includes(query.toLowerCase()) && (filter === '全部' || (filter === '已付款' ? order.payment === '已付款' : filter === '部分发货' ? order.status === '部分发货' : order.status === filter)) })
  const saveOrder = (order: Order) => {
    if (!order.quantity || order.quantity <= 0) return
    const productRecords = state.inventory
      .filter((item) => item.productId === order.productId)
      .sort((a, b) => a.inboundDate.localeCompare(b.inboundDate))
    let remaining = order.quantity
    const reservations: { inventoryId: string; batch: string; quantity: number }[] = []
    for (const record of productRecords) {
      if (remaining <= 0) break
      const availableBatch = record.inbound - record.outbound - record.reserved
      if (availableBatch <= 0) continue
      const take = Math.min(availableBatch, remaining)
      reservations.push({ inventoryId: record.id, batch: record.batch, quantity: take })
      remaining -= take
    }
    if (remaining > 0) {
      showNotice(`可用库存不足，无法确认订单（缺 ${remaining} KG）`)
      return
    }
    reservations.forEach((reservation) => dispatch({ type: 'RESERVE_STOCK', payload: { inventoryId: reservation.inventoryId, quantity: reservation.quantity } }))
    dispatch({ type: 'CREATE_ORDER', payload: { ...order, reservations } })
    setFormOpen(false)
    showNotice('订单已创建，库存已按 FIFO 预占')
  }
  const confirmPayment = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    if (selected.status === '已取消') {
      showNotice('订单已取消，不能付款')
      return
    }
    if (selected.status === '已完成') {
      showNotice('订单已完成，不能重复付款')
      return
    }
    const amount = Number(new FormData(event.currentTarget).get('amount')) || 0
    const newPaid = Math.min(total(selected), selected.paid + amount)
    const fullyPaid = newPaid >= total(selected)
    const updated = { ...selected, paid: newPaid, payment: fullyPaid ? '已付款' : '部分付款', status: selected.status === '待付款' ? (fullyPaid ? '待发货' : '待付款') : selected.status, timeline: [...(selected.timeline ?? []), { date: today, event: '收到付款' }] }
    dispatch({ type: 'UPDATE_ORDER', payload: { id: selected.id, changes: updated } })
    setSelected(updated)
    setPaymentOpen(false)
    showNotice('付款记录已更新')
  }
  const confirmShipping = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    if (selected.status === '已取消') {
      showNotice('订单已取消，不能发货')
      return
    }
    if (selected.status === '已完成' || selected.shipped >= selected.quantity) {
      showNotice('订单已完成，不能重复发货')
      return
    }
    const data = new FormData(event.currentTarget)
    const amount = Number(data.get('amount')) || 0
    if (amount <= 0) {
      showNotice('发货数量必须大于 0')
      return
    }
    if (amount > selected.quantity - selected.shipped) {
      showNotice('发货数量不能超过订单剩余数量')
      return
    }
    let remaining = amount
    const consumption: { inventoryId: string; quantity: number }[] = []
    const reservationsLeft: { inventoryId: string; batch: string; quantity: number }[] = []
    for (const reservation of selected.reservations ?? []) {
      if (remaining <= 0) {
        reservationsLeft.push(reservation)
        continue
      }
      const take = Math.min(reservation.quantity, remaining)
      if (take > 0) consumption.push({ inventoryId: reservation.inventoryId, quantity: take })
      remaining -= take
      if (reservation.quantity > take) reservationsLeft.push({ ...reservation, quantity: reservation.quantity - take })
    }
    if (remaining > 0) {
      showNotice('预占库存不足，无法完成本次发货')
      return
    }
    consumption.forEach((item) => {
      dispatch({ type: 'STOCK_OUT', payload: { inventoryId: item.inventoryId, quantity: item.quantity } })
      dispatch({ type: 'RELEASE_STOCK', payload: { inventoryId: item.inventoryId, quantity: item.quantity } })
    })
    const shipped = selected.shipped + amount
    const updated = {
      ...selected,
      shipped,
      reservations: reservationsLeft,
      status: shipped >= selected.quantity ? '已完成' : '部分发货',
      stock: Math.max(0, (selected.stock ?? 0) - amount),
      logistics: String(data.get('logistics') || ''),
      tracking: String(data.get('tracking') || ''),
      timeline: [...(selected.timeline ?? []), { date: today, event: shipped >= selected.quantity ? '完成发货' : '部分发货' }],
    }
    dispatch({ type: 'UPDATE_ORDER', payload: { id: selected.id, changes: updated } })
    setSelected(updated)
    setShipping(false)
    showNotice(`已发货 ${amount} KG，库存已扣减`)
  }
  const cancelOrder = (order: Order) => {
    if (order.status === '已取消') {
      showNotice('订单已取消，不能重复取消')
      return
    }
    if (order.shipped > 0 || order.status === '已完成' || order.status === '已发货' || order.status === '部分发货') {
      showNotice('订单已发货或已完成，不能取消')
      return
    }
    ;(order.reservations ?? []).forEach((reservation) => dispatch({ type: 'RELEASE_STOCK', payload: { inventoryId: reservation.inventoryId, quantity: reservation.quantity } }))
    dispatch({ type: 'CANCEL_ORDER', payload: { id: order.id } })
    setSelected({ ...order, status: '已取消', reservations: [] })
    showNotice('订单已取消，库存预占已逐批释放')
  }
  const buildRelinkPlan = (order: Order) => {
    const remaining = order.quantity - order.shipped
    const productRecords = state.inventory
      .filter((item) => item.productId === order.productId)
      .sort((a, b) => a.inboundDate.localeCompare(b.inboundDate))
    let need = remaining
    const reservations: { inventoryId: string; batch: string; quantity: number }[] = []
    for (const record of productRecords) {
      if (need <= 0) break
      const available = record.inbound - record.outbound - record.reserved
      if (available <= 0) continue
      const take = Math.min(available, need)
      reservations.push({ inventoryId: record.id, batch: record.batch, quantity: take })
      need -= take
    }
    return { remaining, reservations, insufficient: need > 0 }
  }
  const confirmRelink = () => {
    if (!selected) return
    const plan = buildRelinkPlan(selected)
    if (plan.insufficient) {
      showNotice('可用库存不足，无法完成库存补关联')
      return
    }
    plan.reservations.forEach((reservation) => dispatch({ type: 'RESERVE_STOCK', payload: { inventoryId: reservation.inventoryId, quantity: reservation.quantity } }))
    dispatch({ type: 'UPDATE_ORDER', payload: { id: selected.id, changes: { reservations: plan.reservations } } })
    setSelected({ ...selected, reservations: plan.reservations })
    setRelinkOpen(false)
    showNotice('库存补关联完成，请再次点击发货')
  }
  if (selected) return <><OrderDetail order={selected} total={total(selected)} available={available(selected)} onBack={() => setSelected(null)} onCustomer={onCustomer} onProduct={onProduct} onPay={() => setPaymentOpen(true)} onShip={() => { if ((selected.reservations ?? []).length > 0) { setShipping(true) } else { setRelinkOpen(true) } }} onAction={showNotice} onCancel={() => cancelOrder(selected)} />{shipping && <ShippingForm onClose={() => setShipping(false)} onSubmit={confirmShipping} max={selected.quantity - selected.shipped} />}{paymentOpen && <PaymentForm onClose={() => setPaymentOpen(false)} onSubmit={confirmPayment} total={total(selected) - selected.paid} />}{relinkOpen && <RelinkForm order={selected} plan={buildRelinkPlan(selected)} onClose={() => setRelinkOpen(false)} onConfirm={confirmRelink} />}</>
  return <div className="order-page"><div className="order-head"><div><button className="back-link" onClick={onBack}>← 返回工作台</button><div className="eyebrow">商业资产 · ORDER MANAGEMENT</div><h1>订单管理</h1><p>从客户确认到交付，完整记录订单流程。</p></div><button className="primary-button" onClick={() => setFormOpen(true)}>＋ 新建订单</button></div><div className="order-metrics"><div><span>本月订单</span><b>{orders.filter((order) => isSameMonth(order.orderDate, today)).length}</b><em>本月已创建</em></div><div><span>待处理</span><b>{orders.filter((o) => ['草稿', '待确认'].includes(o.status)).length}</b><em>需要确认</em></div><div className="order-warm"><span>待付款</span><b>{orders.filter((o) => o.payment === '待付款' || o.payment === '部分付款').length}</b><em>等待客户付款</em></div><div className="order-alert"><span>待发货</span><b>{orders.filter((o) => ['待发货', '部分发货'].includes(o.status)).length}</b><em>安排物流</em></div><div className="order-done"><span>已完成</span><b>{orders.filter((o) => o.status === '已完成').length}</b><em>已交付订单</em></div><div><span>已取消</span><b>{orders.filter((o) => o.status === '已取消').length}</b><em>已取消订单</em></div></div><div className="order-advice"><span>✦</span><div><b>今日订单提醒</b><small>有 {orders.filter((o) => o.payment === '待付款' || o.payment === '部分付款').length} 个订单等待付款。　有 {orders.filter((o) => ['待发货', '部分发货'].includes(o.status)).length} 个订单等待发货。　订单创建后先预占库存，确认发货时才扣减实际库存。</small></div><button onClick={() => setFilter('待付款')}>查看待付款 →</button></div><div className="order-toolbar"><label className="catalog-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索订单编号、客户、产品、联系人、物流单号..." /></label><div className="order-tabs">{orderFilters.map((item) => <button className={filter === item ? 'order-tab active' : 'order-tab'} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div></div><div className="order-summary"><span>订单列表 <b>{visible.length}</b></span><span>模拟日期：{today}</span></div><div className="order-table"><div className="order-table-head"><span>订单信息</span><span>客户</span><span>产品</span><span>数量 / 金额</span><span>付款状态</span><span>订单状态</span><span>预占库存</span><span>操作</span></div>{visible.length ? visible.map((order) => <article className="order-row" key={order.id}><div className="order-id"><b>{order.id}</b><small>{order.orderDate}</small></div><div className="order-customer"><b>{order.customer}</b><small>{order.contact}</small></div><div className="order-product"><b>{order.product}</b><small>{order.quote}</small></div><div className="order-amount"><b>{order.quantity} {order.unit}</b><small>{money(total(order))}</small></div><span className={`order-payment ${order.payment === '已付款' ? 'paid' : 'unpaid'}`}><i />{order.payment}</span><span className={`order-status ${order.status === '已完成' ? 'done' : order.status === '待付款' ? 'pay' : 'ship'}`}><i />{order.status}</span><div className="reserved-stock"><b>{order.status === '已取消' ? 0 : order.quantity - order.shipped} KG</b><small>可用 {available(order)} KG</small></div><button className="order-detail-button" onClick={() => setSelected(order)}>查看详情　→</button></article>) : <div className="empty-catalog"><span>⌕</span><b>没有找到匹配的订单</b><small>试试订单编号、客户或产品关键词</small></div>}</div>{formOpen && <OrderForm onClose={() => setFormOpen(false)} onSubmit={saveOrder} />}{notice && <div className="toast">✓ {notice}</div>}</div>
}

function OrderDetail({ order, total, available, onBack, onCustomer, onProduct, onPay, onShip, onAction, onCancel }: { order: Order; total: number; available: number; onBack: () => void; onCustomer: () => void; onProduct: () => void; onPay: () => void; onShip: () => void; onAction: (text: string) => void; onCancel: () => void }) { const reserved = order.status === '已取消' ? 0 : order.quantity - order.shipped; return <div className="order-page order-detail-page"><button className="back-link" onClick={onBack}>← 返回订单管理</button><div className="order-detail-hero"><div className={`order-mark ${order.tone}`}>SO</div><div><div className="eyebrow">订单档案 · {order.id}</div><h1>{order.id}</h1><p><button onClick={onCustomer}>{order.customer}</button>　·　{order.contact}</p><div className="order-tags"><span className={`order-status ${order.status === '已完成' ? 'done' : 'ship'}`}><i />{order.status}</span><span>来源报价 {order.quote}</span></div></div><div className="order-detail-buttons">{order.payment !== '已付款' && order.status !== '已取消' && order.status !== '已完成' && <button className="secondary-button" onClick={onPay}>记录付款</button>}{reserved > 0 && <button className="primary-button" onClick={onShip}>发货　→</button>}</div></div><div className="order-detail-grid"><section className="order-card"><div className="order-card-head"><span className="section-kicker">01 · BASIC</span><h2>订单信息</h2></div><div className="order-fields"><OrderField label="订单编号" value={order.id} /><OrderField label="客户" value={order.customer} clickable={onCustomer} /><OrderField label="联系人" value={order.contact ?? ''} /><OrderField label="来源报价" value={order.quote ?? ''} /><OrderField label="订单日期" value={order.orderDate} /><OrderField label="预计交付" value={order.expected ?? ''} /></div></section><section className="order-card"><div className="order-card-head"><span className="section-kicker">02 · PRODUCT</span><h2>产品与金额</h2></div><div className="order-product-detail"><div><b>{order.product}</b><small>{order.batch} · {order.unit}</small></div><button onClick={onProduct}>查看产品详情 →</button></div><div className="order-fields"><OrderField label="数量" value={`${order.quantity} ${order.unit}`} /><OrderField label="单价" value={`${money(order.price)} / ${order.unit}`} /><OrderField label="商品金额" value={money(order.quantity * order.price)} /><OrderField label="运费 / 税费" value={`${money(order.freight)} / ${money(order.tax)}`} /><OrderField label="订单总额" value={money(total)} /></div></section><section className="order-card"><div className="order-card-head"><span className="section-kicker">03 · STOCK</span><h2>库存预占</h2></div><div className="stock-reservation"><div><span>实际库存</span><b>{order.stock} KG</b></div><div><span>已预占库存</span><b>{reserved} KG</b></div><div><span>可用库存</span><b>{available} KG</b></div></div><p className="stock-help">订单创建与付款不会扣库存，只有确认发货后才会扣减实际库存。</p></section><section className="order-card"><div className="order-card-head"><span className="section-kicker">04 · DELIVERY</span><h2>付款与物流</h2></div><div className="order-fields"><OrderField label="付款状态" value={`${order.payment} · ${money(order.paid)}`} /><OrderField label="付款方式" value="T/T 预付" /><OrderField label="发货状态" value={`${order.shipped} / ${order.quantity} KG`} /><OrderField label="物流公司" value={order.logistics || '待发货'} /><OrderField label="物流单号" value={order.tracking || '待生成'} /><OrderField label="交货方式" value={order.delivery ?? ''} /></div></section><section className="order-card timeline-card"><div className="order-card-head"><span className="section-kicker">05 · ACTIVITY</span><h2>订单时间轴</h2></div><div className="order-timeline">{(order.timeline ?? []).map((item, index) => <div key={`${item.date}-${item.event}-${index}`}><time>{item.date}</time><i className={index === (order.timeline ?? []).length - 1 ? 'current' : ''} /><b>{item.event}</b></div>)}</div></section></div><div className="order-next-actions"><b>下一步操作</b><button onClick={() => onAction('订单编辑已开启')}>编辑订单</button><button onClick={() => onAction('订单已复制')}>复制订单</button><button onClick={onCancel}>取消订单</button></div></div> }

function OrderField({ label, value, clickable }: { label: string; value: string; clickable?: () => void }) { return <div><small>{label}</small>{clickable ? <button onClick={clickable}>{value}　↗</button> : <b>{value}</b>}</div> }

function OrderForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (order: Order) => void }) { const { state } = useAppStore(); const today = state.settings.simulatedToday; const [form, setForm] = useState({ customer: 'XX化妆品有限公司', contact: '李女士', product: '摩洛哥阿甘油', batch: 'ARG20260801', quantity: '20', unit: 'KG', price: '380', freight: '0', tax: '0', payment: 'T/T 预付', delivery: '款到发货', expected: '2026-08-30', note: '' }); const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value })); const productsWithStock = selectProductsWithStock(state); const currentProduct = productsWithStock.find((item) => item.name === form.product); const quantity = Number(form.quantity) || 0; const price = Number(form.price) || 0; const freight = Number(form.freight) || 0; const tax = Number(form.tax) || 0; const stock = currentProduct?.currentStock ?? 0; const save = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const id = `SO${today.replace(/-/g, '')}${String(Date.now()).slice(-3)}`; const customerId = state.customers.find((item) => item.company === form.customer)?.id ?? ''; const productId = state.products.find((item) => item.name === form.product)?.id ?? ''; onSubmit({ id, orderNo: id, customerId, customer: form.customer, contact: form.contact, quoteId: '', quote: '手动创建', productId, product: form.product, batch: form.batch, quantity, shipped: 0, unit: form.unit, price, freight, tax, status: '待付款', payment: '待付款', paid: 0, orderDate: today, delivery: form.delivery, expected: form.expected, logistics: '', tracking: '', stock, tone: 'sage', createdAt: today, updatedAt: today, totalAmount: quantity * price + freight + tax, paidAmount: 0, items: [{ productId, productName: form.product, quantity, unit: form.unit, price, amount: quantity * price, shippedQuantity: 0 }], timeline: [{ date: today, event: '创建订单' }] }) }; return <div className="modal-backdrop"><form className="order-form" onSubmit={save}><div className="form-head"><div><span className="section-kicker">NEW ORDER</span><h2>新建订单</h2><p>订单创建后先预占库存，发货时才扣减实际库存。</p></div><button type="button" onClick={onClose}>×</button></div><div className="form-body"><div className="form-grid"><label className="form-field"><span>客户<i>*</i></span><select value={form.customer} onChange={(event) => update('customer', event.target.value)}><option>XX化妆品有限公司</option><option>XX美容院</option><option>XX芳疗工作室</option></select></label><label className="form-field"><span>联系人</span><input value={form.contact} onChange={(event) => update('contact', event.target.value)} /></label><label className="form-field"><span>产品<i>*</i></span><select value={form.product} onChange={(event) => { const name = event.target.value; update('product', name); const product = state.products.find((item) => item.name === name); if (product) update('price', String(product.price)) }}><option>摩洛哥阿甘油</option><option>摩洛哥熔岩泥</option><option>摩洛哥仙人掌籽油</option></select></label><label className="form-field"><span>批次</span><input value={form.batch} onChange={(event) => update('batch', event.target.value)} /></label><label className="form-field"><span>数量<i>*</i></span><input type="number" min="0.01" step="0.01" value={form.quantity} onChange={(event) => update('quantity', event.target.value)} /></label><label className="form-field"><span>单位</span><select value={form.unit} onChange={(event) => update('unit', event.target.value)}><option>KG</option><option>ML</option></select></label><label className="form-field"><span>单价<i>*</i></span><input type="number" min="0" value={form.price} onChange={(event) => update('price', event.target.value)} /></label><label className="form-field"><span>运费</span><input type="number" min="0" value={form.freight} onChange={(event) => update('freight', event.target.value)} /></label><label className="form-field"><span>税费</span><input type="number" min="0" value={form.tax} onChange={(event) => update('tax', event.target.value)} /></label><label className="form-field"><span>付款方式</span><select value={form.payment} onChange={(event) => update('payment', event.target.value)}><option>T/T 预付</option><option>月结</option></select></label><label className="form-field"><span>交货方式</span><select value={form.delivery} onChange={(event) => update('delivery', event.target.value)}><option>款到发货</option><option>工厂交货</option></select></label><label className="form-field"><span>预计交付日期</span><input type="date" value={form.expected} onChange={(event) => update('expected', event.target.value)} /></label></div><div className="order-calculator"><div><span>商品金额</span><b>{money(quantity * price)}</b></div><div><span>订单总金额</span><b>{money(quantity * price + freight + tax)}</b></div><div><span>预占库存</span><b>{quantity} KG</b></div></div>{quantity > stock && <div className="stock-warning">! 库存不足，无法确认订单。当前可用库存 {stock} KG。</div>}<label className="form-field full-field"><span>备注</span><textarea value={form.note} onChange={(event) => update('note', event.target.value)} placeholder="补充订单要求..." /></label></div><div className="form-foot"><button type="button" className="cancel-button" onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={quantity > stock}>保存订单　→</button></div></form></div> }

function RelinkForm({ order, plan, onClose, onConfirm }: { order: Order; plan: { remaining: number; reservations: { inventoryId: string; batch: string; quantity: number }[]; insufficient: boolean }; onClose: () => void; onConfirm: () => void }) { return <div className="modal-backdrop"><form className="small-form" onSubmit={(event) => { event.preventDefault(); onConfirm() }}><div className="form-head"><div><span className="section-kicker">STOCK RELINK</span><h2>库存补关联</h2><p>该订单未建立库存预占，发货前需补关联库存。</p></div><button type="button" onClick={onClose}>×</button></div><div className="form-body"><div className="batch-detail-list"><p><span>订单号</span><b>{order.id}</b></p><p><span>产品</span><b>{order.product}</b></p><p><span>订单数量</span><b>{order.quantity} {order.unit}</b></p><p><span>已发货</span><b>{order.shipped} {order.unit}</b></p><p><span>待补关联数量</span><b>{plan.remaining} {order.unit}</b></p></div>{plan.insufficient ? <div className="stock-warning">可用库存不足，无法补关联（缺 {plan.remaining} KG）。</div> : <div className="batch-detail-list">{plan.reservations.map((reservation) => <p key={reservation.inventoryId}><span>批次 {reservation.batch}</span><b>{reservation.quantity} KG</b></p>)}</div>}</div><div className="form-foot"><button type="button" className="cancel-button" onClick={onClose}>取消</button><button type="submit" className="primary-button" disabled={plan.insufficient}>确认补关联　→</button></div></form></div> }

function ShippingForm({ onClose, onSubmit, max }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; max: number }) { const { state } = useAppStore(); return <div className="modal-backdrop"><form className="small-form" onSubmit={onSubmit}><div className="form-head"><div><span className="section-kicker">SHIPMENT</span><h2>确认发货</h2><p>确认后将从实际库存扣减发货数量。</p></div><button type="button" onClick={onClose}>×</button></div><div className="form-body"><label className="form-field"><span>发货数量（最多 {max} KG）<i>*</i></span><input name="amount" type="number" min="0.01" max={max} step="0.01" defaultValue={max} required /></label><label className="form-field"><span>物流公司</span><input name="logistics" placeholder="如：顺丰速运" /></label><label className="form-field"><span>物流单号</span><input name="tracking" placeholder="请输入物流单号" /></label><label className="form-field"><span>发货日期</span><input type="date" defaultValue={state.settings.simulatedToday} /></label></div><div className="form-foot"><button type="button" className="cancel-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">确认发货　→</button></div></form></div> }

function PaymentForm({ onClose, onSubmit, total }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; total: number }) { const { state } = useAppStore(); return <div className="modal-backdrop"><form className="small-form" onSubmit={onSubmit}><div className="form-head"><div><span className="section-kicker">PAYMENT</span><h2>记录付款</h2><p>待收款金额 {money(total)}。</p></div><button type="button" onClick={onClose}>×</button></div><div className="form-body"><label className="form-field"><span>付款金额<i>*</i></span><input name="amount" type="number" min="0.01" max={total} step="0.01" defaultValue={total} required /></label><label className="form-field"><span>付款日期</span><input type="date" defaultValue={state.settings.simulatedToday} /></label><label className="form-field"><span>备注</span><textarea placeholder="补充付款信息..." /></label></div><div className="form-foot"><button type="button" className="cancel-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">保存付款　→</button></div></form></div> }

const quoteFilters = ['全部', '草稿', '待发送', '待确认', '已接受', '已拒绝', '已过期', '已转订单']

type FormulaIngredient = { id: number; name: string; category: string; ratio: number; unit: string; price: number; stock: number; tone: string }
type Formula = { id: string; name: string; purpose: string; total: number; unit: string; status: string; version: string; updated: string; ingredients: FormulaIngredient[] }

const toAppFormulas = (formulas: StoreFormula[], products: Product[]): Formula[] =>
  formulas.map((formula) => ({
    ...formula,
    ingredients: formula.ingredients.map((ingredient, index) => {
      const product = products.find((p) => p.id === ingredient.productId)
      return {
        id: index + 1,
        name: ingredient.name,
        category: product?.category ?? '其他',
        ratio: ingredient.ratio,
        unit: 'g',
        price: ingredient.price,
        stock: product?.stock ?? 0,
        tone: product?.tone ?? 'sage',
      }
    }),
  }))

const toStoreFormula = (formula: Formula, products: Product[]): StoreFormula => ({
  id: formula.id,
  name: formula.name,
  purpose: formula.purpose,
  total: formula.total,
  unit: formula.unit,
  status: formula.status,
  version: formula.version,
  updated: formula.updated,
  ingredients: formula.ingredients.map((ingredient) => ({
    id: `ingredient-${ingredient.id}`,
    productId: products.find((p) => p.name === ingredient.name)?.id ?? '',
    name: ingredient.name,
    ratio: ingredient.ratio,
    price: ingredient.price,
  })),
})
const formulaPurposes = ['全部', '面部护理', '身体护理', '头皮护理', '芳香护理', '清洁', '其他']

type AiMessage = { role: 'user' | 'assistant'; text: string; source?: string; target?: string }
const initialAiMessages: AiMessage[] = [{ role: 'assistant', text: '早上好，管理员。\n我是你的精油行业助手，已经帮你整理好今天最值得处理的业务。你可以直接问我客户、库存、样品、报价或销售情况。' }]
function AiAssistant({ onBack, navigate }: { onBack: () => void; navigate: (target: string) => void }) {
  const { state } = useAppStore()
  const [messages, setMessages] = useState<AiMessage[]>(() => { try { return JSON.parse(localStorage.getItem('essential-oil-ai-chat') || 'null') || initialAiMessages } catch { return initialAiMessages } })
  const [input, setInput] = useState('')
  const quickQuestions = ['今天该做什么？', '哪些客户要跟进？', '库存有问题吗？', '哪些样品没反馈？', '哪些报价快过期？', '本月销售怎么样？', '热门产品是什么？']
  const today = state.settings.simulatedToday
  const monthlySales = selectMonthlySales(state)
  const averageOrder = selectAverageOrderValue(state)
  const funnel = selectSalesFunnel(state)
  const pendingQuotes = selectPendingQuotes(state)
  const expiringQuotes = selectExpiringQuotes(state)
  const pendingSamples = selectPendingSamples(state)
  const lowStock = selectLowStockProducts(state)
  const highIntent = selectHighIntentCustomers(state)
  const pendingFollowUps = selectPendingTasks(state).followUps
  const productStats = state.products.map((product) => ({ name: product.name, orders: state.orders.filter((order) => order.productId === product.id).length, quantity: state.orders.filter((order) => order.productId === product.id).reduce((sum, order) => sum + order.quantity, 0), sales: state.orders.filter((order) => order.productId === product.id && order.status === '已完成').reduce((sum, order) => sum + order.quantity * order.price + order.freight + order.tax, 0), quotes: state.quotes.filter((quote) => quote.productId === product.id).length })).sort((a, b) => b.sales - a.sales)
  const topProduct = productStats[0]
  const customerLines = highIntent.slice(0, 3).map((customer) => `${customer.company}：${customer.next || '建议尽快跟进'}`).join('\n')
  const sampleLines = pendingSamples.slice(0, 3).map((sample) => `${sample.customer}（${sample.product}）：${sample.status === '等待反馈' ? `已于 ${sample.signedDate || sample.sendDate || today} 签收，建议在 3-5 天后主动询问` : `已于 ${sample.sendDate || today} 寄出，等待客户签收`}`).join('\n')
  const quoteLines = expiringQuotes.slice(0, 3).map((quote) => `${quote.id}（${quote.product}）将在 7 天内到期`).join('，')
  const tasks = [
    ...(highIntent.slice(0, 1).map((customer) => ({ title: `跟进 ${customer.company}`, desc: customer.next || '建议优先跟进', priority: '高', action: '客户跟进' }))),
    ...(lowStock.slice(0, 1).map((item) => ({ title: `检查 ${item.productName} 库存`, desc: `${item.inbound - item.outbound} KG 低于安全库存 ${item.safetyStock} KG`, priority: '高', action: '库存管理' }))),
    ...(pendingSamples.slice(0, 1).map((sample) => ({ title: `联系 ${sample.customer} 确认样品反馈`, desc: `${sample.product} 样品${sample.status === '等待反馈' ? '已签收，建议主动跟进' : '已寄出，等待签收'}`, priority: '中', action: '样品管理' }))),
  ]
  const highCount = tasks.filter((task) => task.priority === '高').length
  const focusCount = pendingSamples.length + expiringQuotes.length
  const normalCount = pendingFollowUps.length
  const taskTotal = highCount + focusCount + normalCount
  const todayLabel = `${Number(today.slice(0, 4))}年${Number(today.slice(5, 7))}月${Number(today.slice(8, 10))}日`
  const suggestions = [
    ['客户建议', highIntent[0] ? `${highIntent[0].company}近期需优先跟进。` : '暂无高意向客户待跟进。', '客户 CRM'],
    ['库存建议', lowStock[0] ? `${lowStock[0].productName}库存低于安全库存，建议关注补货。` : '当前库存充足。', '库存管理'],
    ['样品建议', `有 ${pendingSamples.length} 个样品等待客户反馈。`, '样品管理'],
    ['报价建议', `有 ${expiringQuotes.length} 份报价将在 7 天内到期。`, '报价管理'],
  ]
  useEffect(() => { localStorage.setItem('essential-oil-ai-chat', JSON.stringify(messages)) }, [messages])
  const answer = (question: string): AiMessage => { const q = question.toLowerCase(); if (q.includes('今天') || q.includes('工作')) return { role: 'assistant', text: `今天建议按这个顺序处理：\n\n1. ${highIntent[0] ? `跟进 ${highIntent[0].company}，${highIntent[0].next || '确认业务进展'}` : '暂无高意向客户待跟进'}。\n2. ${lowStock[0] ? `检查 ${lowStock[0].productName} 库存，当前 ${lowStock[0].inbound - lowStock[0].outbound} KG 低于安全库存 ${lowStock[0].safetyStock} KG` : '库存目前正常'}。\n3. ${pendingSamples[0] ? `联系 ${pendingSamples[0].customer} 确认样品反馈` : expiringQuotes[0] ? `跟进 ${expiringQuotes.length} 份 7 天内到期的报价` : '暂无待跟进样品或报价'}。`, source: '客户跟进 · 库存管理 · 样品管理 · 报价管理', target: '客户跟进' }; if (q.includes('客户') || q.includes('跟进')) return { role: 'assistant', text: customerLines ? `目前有 ${highIntent.length} 个高意向客户建议跟进：\n\n${customerLines}` : '目前没有需要跟进的高意向客户。', source: '客户 CRM · 客户跟进', target: '客户 CRM' }; if (q.includes('库存') || q.includes('补货')) return { role: 'assistant', text: lowStock.length ? lowStock.slice(0, 3).map((item) => `${item.productName} 当前库存 ${item.inbound - item.outbound} KG，低于安全库存 ${item.safetyStock} KG，建议关注补货。`).join('\n') : '当前没有低库存产品，库存充足。', source: '库存管理', target: '库存管理' }; if (q.includes('样品') || q.includes('反馈')) return { role: 'assistant', text: sampleLines ? `目前有 ${pendingSamples.length} 个样品需要关注：\n\n${sampleLines}` : '目前没有需要关注的样品。', source: '样品管理 · 客户跟进', target: '样品管理' }; if (q.includes('报价') || q.includes('过期')) return { role: 'assistant', text: pendingQuotes.length ? `目前有 ${pendingQuotes.length} 份报价待跟进${quoteLines ? `，其中 ${quoteLines}` : ''}。` : '目前没有待跟进的报价。', source: '报价管理', target: '报价管理' }; if (q.includes('销售') || q.includes('订单') || q.includes('金额')) return { role: 'assistant', text: `本月销售额 ${money(monthlySales)}，共 ${funnel.orders} 个订单，平均订单金额 ${money(Math.round(averageOrder))}，已完成订单 ${funnel.completedOrders} 笔。${topProduct && topProduct.sales > 0 ? `当前销售金额最高的产品是 ${topProduct.name}。` : ''}`, source: '数据中心 · 订单管理', target: '数据中心' }; if (q.includes('热门') || q.includes('产品') || q.includes('卖得')) return { role: 'assistant', text: topProduct && topProduct.sales > 0 ? `当前最热门的产品是 ${topProduct.name}：订单 ${topProduct.orders} 笔、询价 ${topProduct.quotes} 次、销售 ${topProduct.quantity} KG、销售金额 ${money(topProduct.sales)}。` : '目前还没有已完成的销售记录，暂无热门产品数据。', source: '产品中心 · 数据中心', target: '产品中心' }; return { role: 'assistant', text: '我可以帮你查看客户跟进、库存风险、样品反馈、报价有效期、订单销售和热门产品。试试问我“哪些产品库存不足？”', source: '数据中心', target: '数据中心' } }
  const ask = (question = input) => { const value = question.trim(); if (!value) return; setMessages((current) => [...current, { role: 'user', text: value }, answer(value)]); setInput('') }
  const clearChat = () => { setMessages(initialAiMessages); localStorage.removeItem('essential-oil-ai-chat') }
  return <div className="ai-page"><div className="ai-head"><div><button className="back-link" onClick={onBack}>← 返回工作台</button><div className="eyebrow">智能业务 · AI WORK ASSISTANT</div><h1>AI 精油助手</h1><p>帮你看客户、看库存、看订单，也帮你安排今天的工作。</p></div><div className="ai-date"><span>早上好，管理员</span><b>{todayLabel}</b></div></div><div className="ai-layout"><main><section className="ai-summary"><div className="ai-summary-title"><div><span className="section-kicker">TODAY · {today.slice(5).replace('-', '/')}</span><h2>今天有 {taskTotal} 件事情值得处理</h2></div><button onClick={clearChat}>清空对话</button></div><div className="ai-priority-grid"><div className="ai-priority high"><span>高优先级</span><b>{highCount}</b><small>今天建议优先处理</small></div><div className="ai-priority focus"><span>需要关注</span><b>{focusCount}</b><small>库存、样品与报价提醒</small></div><div className="ai-priority normal"><span>普通任务</span><b>{normalCount}</b><small>可以稍后安排</small></div></div></section><section className="ai-tasks"><div className="ai-section-title"><div><span className="section-kicker">SMART ACTIONS</span><h2>今天最应该做什么？</h2></div><span>按优先级排序</span></div><div className="ai-task-list">{tasks.map((task) => <article className="ai-task" key={task.title}><div className={`ai-task-mark ${task.priority === '高' ? 'high' : 'medium'}`}>✦</div><div><div className="ai-task-meta"><b>{task.priority}优先级</b><span>建议今天处理</span></div><h3>{task.title}</h3><p>{task.desc}</p></div><button onClick={() => navigate(task.action)}>{task.action === '客户跟进' ? '立即跟进' : task.action === '库存管理' ? '查看库存' : '查看样品'}　→</button></article>)}</div></section><section className="ai-chat"><div className="ai-section-title"><div><span className="section-kicker">ASK YOUR WORK ASSISTANT</span><h2>问问你的业务助手</h2></div><span className="ai-online"><i />规则引擎已就绪</span></div><div className="ai-quick">{quickQuestions.map((question) => <button key={question} onClick={() => ask(question)}>{question}</button>)}</div><div className="ai-messages">{messages.map((message, index) => <div className={`ai-message ${message.role}`} key={`${message.role}-${index}`}><span className="ai-message-icon">{message.role === 'assistant' ? '✦' : '管'}</span><div><p>{message.text}</p>{message.source && <div className="ai-reference"><span>数据来源：{message.source}</span>{message.target && <button onClick={() => navigate(message.target!)}>查看详情 →</button>}</div>}</div></div>)}</div><form className="ai-input" onSubmit={(event) => { event.preventDefault(); ask() }}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="问我：哪些客户需要跟进？" /><button aria-label="发送">↑</button></form></section></main><aside className="ai-sidebar"><div className="ai-sidebar-head"><span className="ai-orb">✦</span><div><b>AI 业务建议</b><small>基于当前模拟数据</small></div></div>{suggestions.map(([label, text]) => <button className="ai-suggestion" key={label} onClick={() => ask(text)}><span>{label}</span><p>{text}</p><b>查看详情　→</b></button>)}<div className="ai-quote"><span>◎</span><p>你的数据只在当前浏览器中处理，暂不连接真实 AI API。</p></div></aside></div></div>
}

type AnalyticsPeriod = StoreAnalyticsPeriod
function DataCenter({ onBack, navigate }: { onBack: () => void; navigate: (target: string) => void }) {
  const [period, setPeriod] = useState<AnalyticsPeriod>('本月')
  const [customRange] = useState<DateRange | undefined>()
  const { state } = useAppStore()
  const today = state.settings.simulatedToday
  const range = getAnalyticsDateRange(period, today, customRange)
  const customers = state.customers
  const periodCompletedOrders = state.orders.filter((order) => order.status === '已完成' && isWithinDateRange(order.orderDate, range))
  const sales = periodCompletedOrders.reduce((sum, order) => sum + order.quantity * order.price + order.freight + order.tax, 0)
  const orderCount = periodCompletedOrders.length
  const customerTotal = customers.length
  const newCustomers = state.customers.filter((customer) => isWithinDateRange(customer.createdAt ?? '', range)).length
  const completed = selectCompletedOrders(state).length
  const completedCustomers = new Set(periodCompletedOrders.map((order) => order.customerId)).size
  const conversion = newCustomers ? `${((completedCustomers / newCustomers) * 100).toFixed(1)}%` : '—'
  const quoteCount = state.quotes.length
  const periodQuoteCount = state.quotes.filter((quote) => isWithinDateRange(quote.quoteDate, range)).length
  const totalSamples = state.samples.length
  const sampleCount = state.samples.filter((sample) => isWithinDateRange(sample.applyDate, range)).length
  const awaitingFeedbackSamples = state.samples.filter((sample) => isWithinDateRange(sample.applyDate, range) && sample.status === '等待反馈').length
  const funnel = { customers: newCustomers, samples: sampleCount, quotes: periodQuoteCount, completedOrders: orderCount }
  const pendingQuotes = selectPendingQuotes(state).length
  const expiringQuotes = selectExpiringQuotes(state).length
  const pendingSamples = selectPendingSamples(state).length
  const periodValidOrders = state.orders.filter((order) => order.status !== '已取消' && isWithinDateRange(order.orderDate, range))
  const averageOrder = periodValidOrders.length ? periodValidOrders.reduce((sum, order) => sum + order.quantity * order.price + order.freight + order.tax, 0) / periodValidOrders.length : 0
  const highIntent = selectHighIntentCustomers(state).length
  const pendingCustomerCount = customers.filter((customer) => customer.status === '待跟进').length
  const longTerm = customers.filter((customer) => customer.status === '长期客户').length
  const totalInventory = selectTotalInventory(state)
  const lowStock = selectLowStockProducts(state).length
  const outOfStock = state.inventory.filter((item) => item.inbound - item.outbound === 0).length
  const lowStockFirst = selectLowStockProducts(state)[0]
  const acceptedQuotes = state.quotes.filter((quote) => quote.status === '已接受').length
  const sampleQuoteRate = totalSamples ? ((quoteCount / totalSamples) * 100).toFixed(1) : '0.0'
  const sampleOrderRate = totalSamples ? ((completed / totalSamples) * 100).toFixed(1) : '0.0'
  const sourceGroups = [...new Set(customers.map((customer) => customer.source || '未知'))].map((source) => {
    const group = customers.filter((customer) => (customer.source || '未知') === source)
    const doneCount = group.filter((customer) => state.orders.some((order) => order.customerId === customer.id && order.status === '已完成')).length
    const amount = group.reduce((sum, customer) => sum + selectCustomerStats(state, customer.id).totalSpent, 0)
    return [source, group.length, doneCount, money(amount)] as [string, number, number, string]
  })
  const typeGroups = [...new Set(customers.map((customer) => customer.type || '其他'))].map((type) => [type, customers.filter((customer) => (customer.type || '其他') === type).length] as [string, number]).sort((a, b) => b[1] - a[1])
  const typeMax = typeGroups.reduce((max, [, n]) => Math.max(max, n), 1)
  const productAnalysis = state.products.map((product) => {
    const quoteN = state.quotes.filter((quote) => quote.productId === product.id && isWithinDateRange(quote.quoteDate, range)).length
    const sampleN = state.samples.filter((sample) => sample.productId === product.id && isWithinDateRange(sample.applyDate, range)).length
    const orderN = state.orders.filter((order) => order.productId === product.id && order.quoteId && order.status !== '已取消' && isWithinDateRange(order.orderDate, range)).length
    const completedOrders = state.orders.filter((order) => order.productId === product.id && order.status === '已完成' && isWithinDateRange(order.orderDate, range))
    const doneN = completedOrders.length
    const qty = completedOrders.reduce((sum, order) => sum + order.quantity, 0)
    const amount = completedOrders.reduce((sum, order) => sum + order.quantity * order.price + order.freight + order.tax, 0)
    return [product.name, quoteN, sampleN, orderN, doneN, `${qty} KG`, money(amount)] as [string, number, number, number, number, string, string]
  })
  const topCustomers = customers.map((customer) => {
    const completedOrders = state.orders.filter((order) => order.customerId === customer.id && order.status === '已完成' && isWithinDateRange(order.orderDate, range))
    return { customer, completedCount: completedOrders.length, totalSpent: completedOrders.reduce((sum, order) => sum + order.quantity * order.price + order.freight + order.tax, 0), lastCompletedDate: completedOrders.reduce((max, order) => (order.orderDate > max ? order.orderDate : max), '') }
  }).filter((row) => row.completedCount > 0).sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 5)
  const topProducts = state.products.map((product) => {
    const completedOrders = state.orders.filter((order) => order.productId === product.id && order.status === '已完成' && isWithinDateRange(order.orderDate, range))
    return { id: product.id, name: product.name, quantity: completedOrders.reduce((sum, order) => sum + order.quantity, 0), sales: completedOrders.reduce((sum, order) => sum + order.quantity * order.price + order.freight + order.tax, 0), orderCount: completedOrders.length }
  }).filter((product) => product.orderCount > 0).sort((a, b) => b.sales - a.sales).slice(0, 5)
  const dailySales = selectDailySales(state, 7)
  const salesTrendTotal = dailySales.reduce((sum, item) => sum + item.amount, 0)
  const salesMax = Math.max(...dailySales.map((item) => item.amount), 1)
  const salesPoints = dailySales.map((item, index) => { const x = 10 + (index / (dailySales.length - 1 || 1)) * 480; const y = 160 - (item.amount / salesMax) * 130; return { x, y } })
  const salesLinePath = `M ${salesPoints.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')}`
  const salesAreaPath = `${salesLinePath} L ${salesPoints[salesPoints.length - 1].x.toFixed(1)} 170 L 10 170 Z`
  return <div className="analytics-page"><div className="analytics-head"><div><button className="back-link" onClick={onBack}>← 返回工作台</button><div className="eyebrow">经营分析 · BUSINESS INTELLIGENCE</div><h1>数据中心</h1><p>从客户、产品、库存和订单中发现业务机会。</p></div><div className="analytics-periods">{(['今日', '本周', '本月', '本季度', '今年', '自定义'] as AnalyticsPeriod[]).map((item) => <button className={period === item ? 'active' : ''} key={item} onClick={() => setPeriod(item)}>{item}</button>)}</div></div><div className="analytics-snapshot"><span>当前视图：{period}</span><small>数据更新于 {state.settings.simulatedToday}</small></div><section className="analytics-metrics"><Metric label="销售额" value={money(sales)} change="—" tone="warm" /><Metric label="成交订单" value={String(orderCount)} change="—" /><Metric label="新增客户" value={String(newCustomers)} change="—" /><Metric label="成交客户" value={String(completedCustomers)} change={conversion === '—' ? '—' : `${conversion} 转化率`} /><Metric label="报价数量" value={String(periodQuoteCount)} change="—" /><Metric label="样品数量" value={String(sampleCount)} change={`${awaitingFeedbackSamples} 份等待反馈`} /><Metric label="客户转化率" value={conversion} change="客户 → 成交" tone="green" /><Metric label="平均订单金额" value={money(averageOrder)} change="有效订单均值" /></section><div className="analytics-advice"><span>✦</span><div><b>业务建议</b><p>摩洛哥仙人掌籽油近期询价增加，但库存低于安全库存，建议关注补货。</p><p>XX化妆品有限公司近期连续询价，建议优先跟进。</p></div><button onClick={() => navigate('库存管理')}>查看库存 →</button></div><div className="analytics-grid"><section className="analytics-card sales-chart-card"><CardTitle kicker="01 · SALES" title="销售趋势" action={<select defaultValue="销售额"><option>销售额</option><option>订单数量</option></select>} /><div className="chart-legend"><span><i />销售额</span><b>{money(salesTrendTotal)} <small>最近7天</small></b></div><div className="analytics-chart"><div className="analytics-y">{[salesMax, salesMax * 0.75, salesMax * 0.5, salesMax * 0.25, 0].map((value, index) => <span key={index}>{value.toFixed(0)}</span>)}</div><div className="analytics-chart-area"><div className="analytics-grid-lines"><i /><i /><i /><i /><i /></div><svg viewBox="0 0 600 190" preserveAspectRatio="none" aria-label="销售趋势图"><path d={salesAreaPath} fill="#b8c8a244" /><path d={salesLinePath} fill="none" stroke="#6f8a59" strokeWidth="3" /></svg><div className="analytics-x">{dailySales.map((item) => <span key={item.date}>{item.date.slice(5)}</span>)}</div></div></div></section><section className="analytics-card funnel-card"><CardTitle kicker="02 · FUNNEL" title="销售漏斗" /><div className="funnel">{[['客户', funnel.customers, 'funnel-one'], ['询价', '—', 'funnel-two'], ['样品', funnel.samples, 'funnel-three'], ['报价', funnel.quotes, 'funnel-four'], ['成交', funnel.completedOrders, 'funnel-five']].map(([label, value, tone], index) => <div key={label}><span className={tone as string} style={{ width: `${100 - index * 14}%` }}><b>{label}</b><strong>{value}</strong></span><small>{index === 0 ? '基准客户' : '暂无数据'}</small></div>)}</div><div className="funnel-rates"><span>询价率 <b>—</b></span><span>样品转化 <b>—</b></span><span>报价转化 <b>—</b></span><span>整体成交 <b>{conversion}</b></span></div></section></div><div className="analytics-grid second"><section className="analytics-card"><CardTitle kicker="03 · CUSTOMERS" title="客户分析" action={<button className="analytics-link" onClick={() => navigate('客户 CRM')}>客户 CRM →</button>} /><div className="analysis-numbers"><div><b>{customerTotal}</b><span>客户总数</span></div><div><b>{highIntent}</b><span>高意向</span></div><div><b>{pendingCustomerCount}</b><span>待跟进</span></div><div><b>{longTerm}</b><span>长期客户</span></div></div><div className="bar-list">{typeGroups.map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${Number(value) / typeMax * 100}%` }} /></i><strong>{value}</strong></div>)}</div></section><section className="analytics-card"><CardTitle kicker="04 · SOURCES" title="客户来源分析" /><div className="source-table"><div className="source-head"><span>渠道</span><span>客户</span><span>成交</span><span>金额</span></div>{sourceGroups.map(([source, count, done, amount]) => <div key={source}><span>{source}</span><span>{count}</span><span>{done}</span><b>{amount}</b></div>)}</div></section></div><div className="analytics-card product-analysis"><CardTitle kicker="05 · PRODUCTS" title="产品分析" action={<button className="analytics-link" onClick={() => navigate('产品中心')}>产品中心 →</button>} /><div className="product-analysis-table"><div className="product-analysis-head"><span>产品名称</span><span>报价单数</span><span>样品次数</span><span>转订单数</span><span>成交次数</span><span>销售数量</span><span>销售金额</span></div>{productAnalysis.map((row) => <div key={row[0]}><b>{row[0]}</b>{row.slice(1).map((value, index) => <span key={`${row[0]}-${index}`}>{value}</span>)}</div>)}</div></div><div className="analytics-grid third"><section className="analytics-card inventory-analysis"><CardTitle kicker="06 · INVENTORY" title="库存分析" action={<button className="analytics-link" onClick={() => navigate('库存管理')}>库存管理 →</button>} /><div className="inventory-kpis"><div><span>库存总量</span><b>{totalInventory} KG</b></div><div><span>低库存</span><b className="warn">{lowStock}</b></div><div><span>缺货</span><b>{outOfStock}</b></div></div><div className="inventory-risk"><span className="risk-icon">!</span><div><b>{lowStockFirst?.productName ?? '无'}</b><p>当前库存 {lowStockFirst ? lowStockFirst.inbound - lowStockFirst.outbound : 0} KG · 安全库存 {lowStockFirst?.safetyStock ?? 0} KG</p><small>库存偏低，可能影响近期交付。</small></div></div></section><section className="analytics-card quote-analysis"><CardTitle kicker="07 · QUOTES / SAMPLES" title="报价与样品" /><div className="dual-kpis"><div><span>报价数量</span><b>{periodQuoteCount}</b><small>已接受 {acceptedQuotes}（累计） · 待确认 {pendingQuotes}（累计） · 7天内到期 {expiringQuotes}</small></div><div><span>样品→报价（累计）</span><b>{sampleQuoteRate}%</b><small>累计 {totalSamples} 份样品 · {quoteCount} 份报价</small></div><div><span>样品→订单（累计）</span><b>{sampleOrderRate}%</b><small>累计 {completed} 个成交订单</small></div><div><span>待处理样品</span><b className="warn">{pendingSamples}</b><small>建议主动跟进</small></div></div></section></div><div className="analytics-grid last"><section className="analytics-card ranking-card"><CardTitle kicker="08 · TOP CUSTOMERS" title="客户销售排行榜" action={<button className="analytics-link" onClick={() => navigate('客户 CRM')}>客户 CRM →</button>} />{topCustomers.map(({ customer, completedCount, totalSpent, lastCompletedDate }, index) => <div className="rank-row" key={customer.id}><strong>0{index + 1}</strong><b>{customer.company}</b><span>订单 {completedCount}<small>{money(totalSpent)}</small></span><em>{lastCompletedDate || '—'}</em></div>)}</section><section className="analytics-card ranking-card"><CardTitle kicker="09 · TOP PRODUCTS" title="产品销售排行榜" action={<button className="analytics-link" onClick={() => navigate('产品中心')}>产品中心 →</button>} />{topProducts.map((product, index) => <div className="rank-row" key={product.id}><strong>0{index + 1}</strong><b>{product.name}</b><span>{product.quantity} KG<small>{money(product.sales)}</small></span><em>{product.orderCount} 单</em></div>)}</section></div></div>
}
function Metric({ label, value, change, tone = '' }: { label: string; value: string; change: string; tone?: string }) { return <div className={`analytics-metric ${tone}`}><span>{label}</span><b>{value}</b><small>{change}</small></div> }
function CardTitle({ kicker, title, action }: { kicker: string; title: string; action?: React.ReactNode }) { return <div className="analytics-card-title"><div><span className="section-kicker">{kicker}</span><h2>{title}</h2></div>{action}</div> }

type DocumentItem = { id: string; name: string; type: string; product: string; batch: string; version: string; publish: string; expiry: string; status: string; tone: string }
const documentTypes = ['全部', 'COA', 'SDS', 'TDS', '检测报告', '规格书', '批次资料', '即将到期', '已过期']
const requiredDocs = ['COA', 'SDS', 'TDS', '规格书', '批次资料']

function ProductDocuments({ onBack }: { onBack: () => void }) {
  const { state, dispatch } = useAppStore()
  const [documents, setDocuments] = useState<DocumentItem[]>(() => state.productDocuments.map((doc) => ({ ...doc, tone: state.products.find((p) => p.id === doc.productId)?.tone ?? 'sage' })))
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('全部'); const [product, setProduct] = useState<string | null>(null); const [showForm, setShowForm] = useState(false); const [sendList, setSendList] = useState<string[]>([]); const [notice, setNotice] = useState('')
  const notify = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2200) }
  const expired = (doc: DocumentItem) => doc.expiry && new Date(doc.expiry) < new Date(state.settings.simulatedToday)
  const expiring = (doc: DocumentItem) => doc.expiry && !expired(doc) && (new Date(doc.expiry).getTime() - new Date(state.settings.simulatedToday).getTime()) / 86400000 <= 30
  const visible = documents.filter((doc) => { const text = `${doc.name} ${doc.type} ${doc.product} ${doc.batch} ${doc.id}`.toLowerCase(); const matches = filter === '全部' || (filter === '即将到期' ? expiring(doc) : filter === '已过期' ? expired(doc) : doc.type === filter); return text.includes(query.toLowerCase()) && matches })
  const completeness = (name: string) => { const found = documents.filter((doc) => doc.product === name).map((doc) => doc.type); return Math.round(requiredDocs.filter((type) => found.includes(type)).length / requiredDocs.length * 100) }
  const incompleteProducts = state.products.filter((p) => completeness(p.name) < 100)
  const completeProducts = state.products.filter((p) => completeness(p.name) === 100)
  const saveDocument = (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); const newDoc: DocumentItem = { id: `DOC-${state.productDocuments.length + 1}`, name: String(data.get('name')), type: String(data.get('type')), product: String(data.get('product')), batch: String(data.get('batch') || '-'), version: String(data.get('version') || 'V1.0'), publish: String(data.get('publish') || state.settings.simulatedToday), expiry: String(data.get('expiry') || ''), status: '已上传', tone: 'sage' }; dispatch({ type: 'ADD_DOCUMENT', payload: { id: newDoc.id, name: newDoc.name, type: newDoc.type, productId: state.products.find((p) => p.name === newDoc.product)?.id ?? '', product: newDoc.product, batch: newDoc.batch, version: newDoc.version, publish: newDoc.publish, expiry: newDoc.expiry, status: newDoc.status } }); setDocuments((current) => [newDoc, ...current]); setShowForm(false); notify('资料已添加') }
  if (product) return <DocumentProductDetail product={product} documents={documents} completeness={completeness(product)} onBack={() => setProduct(null)} sendList={sendList} setSendList={setSendList} notify={notify} />
  return <div className="document-page"><div className="document-head"><div><button className="back-link" onClick={onBack}>← 返回工作台</button><div className="eyebrow">资料资产 · PRODUCT DOCUMENTS</div><h1>产品资料</h1><p>统一管理产品技术文件、批次资料和客户资料。</p></div><button className="primary-button" onClick={() => setShowForm(true)}>＋ 新增资料</button></div><div className="document-metrics"><div><span>产品总数</span><b>{state.products.length}</b><em>已建立资料档案</em></div><div><span>资料完整</span><b>{completeProducts.length}</b><em>资料齐全产品</em></div><div className="document-warm"><span>资料待完善</span><b>{incompleteProducts.length}</b><em>需要补齐文件</em></div><div className="document-alert"><span>即将过期</span><b>{documents.filter(expiring).length}</b><em>30天内需要关注</em></div><div><span>批次资料</span><b>{documents.filter((doc) => doc.type === '批次资料').length}</b><em>关联具体批次</em></div></div><div className="document-advice"><span>✦</span><div><b>资料提醒</b><small>有 {incompleteProducts.length} 个产品资料尚未完善。　有 {documents.filter(expiring).length} 份 COA 将在30天内到期。　{incompleteProducts[0] ? `${incompleteProducts[0].name}目前资料完整度${completeness(incompleteProducts[0].name)}%` : '所有产品资料均已完善'}。</small></div><button onClick={() => setFilter('即将到期')}>查看提醒 →</button></div><div className="document-toolbar"><label className="catalog-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索产品、INCI、批次、文件名称..." /></label><div className="document-tabs">{documentTypes.map((item) => <button className={filter === item ? 'document-tab active' : 'document-tab'} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div></div><div className="document-summary"><span>资料列表 <b>{visible.length}</b></span><span>暂无真实文件上传，当前为模拟资料</span></div><div className="document-table"><div className="document-table-head"><span>文件名称</span><span>资料类型</span><span>关联产品</span><span>关联批次</span><span>版本</span><span>发布日期</span><span>有效期</span><span>操作</span></div>{visible.map((doc) => <article className="document-row" key={doc.id}><div className="document-name"><div className={`document-icon ${doc.tone}`}>▤</div><div><b>{doc.name}</b><small>{doc.id}</small></div></div><span className="document-type">{doc.type}</span><button className="document-product" onClick={() => setProduct(doc.product)}>{doc.product}　↗</button><span className="document-batch">{doc.batch}</span><span className="document-version">{doc.version}</span><span className="document-date">{doc.publish}</span><span className={`document-expiry ${expiring(doc) || expired(doc) ? 'warning' : ''}`}>{doc.expiry || '长期有效'}{expiring(doc) && <small>即将到期</small>}{expired(doc) && <small>已过期</small>}</span><div className="document-actions"><button onClick={() => setProduct(doc.product)}>查看</button><button onClick={() => notify('资料编辑已开启')}>编辑</button><button onClick={() => { dispatch({ type: 'DELETE_DOCUMENT', payload: { id: doc.id } }); setDocuments((current) => current.filter((item) => item.id !== doc.id)) }}>删除</button></div></article>)}</div>{showForm && <DocumentForm onClose={() => setShowForm(false)} onSubmit={saveDocument} />}{notice && <div className="toast">✓ {notice}</div>}</div>
}

function DocumentProductDetail({ product, documents, completeness, onBack, sendList, setSendList, notify }: { product: string; documents: DocumentItem[]; completeness: number; onBack: () => void; sendList: string[]; setSendList: (items: string[]) => void; notify: (text: string) => void }) { const { state } = useAppStore(); const productRecord = state.products.find((p) => p.name === product); const productDocs = documents.filter((doc) => doc.product === product); const types = ['COA', 'SDS', 'TDS', '规格书', '检测报告', '原产地资料', '批次资料', '图片', '标签']; const toggle = (type: string) => setSendList(sendList.includes(type) ? sendList.filter((item) => item !== type) : [...sendList, type]); return <div className="document-page document-detail-page"><button className="back-link" onClick={onBack}>← 返回产品资料</button><div className="document-detail-hero"><div className="document-product-mark">▤</div><div><div className="eyebrow">产品资料档案</div><h1>{product}</h1><p>{productRecord?.en ?? '—'}</p><div className="document-tags"><span>{productRecord?.category ?? '—'}</span><span>{productRecord?.origin ?? '—'}</span></div></div><div className="completeness"><b>{completeness}%</b><span>资料完整度</span></div></div><div className="document-detail-layout"><section className="document-card"><div className="document-card-head"><span className="section-kicker">01 · PROFILE</span><h2>产品资料概览</h2></div><div className="document-fields"><DocField label="产品名称" value={product} /><DocField label="英文名称" value={productRecord?.en ?? '—'} /><DocField label="INCI" value={productRecord?.inci ?? '—'} /><DocField label="产品分类" value={productRecord?.category ?? '—'} /><DocField label="产地" value={productRecord?.origin ?? '—'} /><DocField label="资料完整度" value={`${completeness}% · ${completeness === 100 ? '资料完整' : '部分资料'}`} /></div></section><section className="document-card"><div className="document-card-head"><span className="section-kicker">02 · BATCH</span><h2>关联批次资料</h2></div><div className="batch-document-list">{productDocs.filter((doc) => doc.batch !== '-').map((doc) => <button key={doc.id} onClick={() => notify(`已查看 ${doc.batch} 相关资料`)}><span><b>{doc.type}</b> {doc.name}</span><small>{doc.batch}　→</small></button>)}<button onClick={() => notify('批次资料入口已打开')}><span><b>批次资料</b> 查看关联批次</span><small>{productRecord?.batch ?? '—'}　→</small></button></div></section></div><section className="document-card document-status-card"><div className="document-card-head"><span className="section-kicker">03 · DOCUMENT STATUS</span><h2>资料清单</h2><p>缺少的资料会影响客户审核和批次放行。</p></div><div className="document-checklist">{types.map((type) => { const doc = productDocs.find((item) => item.type === type); const status = doc ? (doc.expiry && new Date(doc.expiry) < new Date(state.settings.simulatedToday) ? '已过期' : doc.expiry && (new Date(doc.expiry).getTime() - new Date(state.settings.simulatedToday).getTime()) / 86400000 <= 30 ? '即将到期' : '已上传') : '未完善'; return <div key={type}><span><i className={status === '已上传' ? 'good' : status === '未完善' ? 'missing' : 'warning'} />{type}</span><b>{status}</b><button onClick={() => toggle(type)} className={sendList.includes(type) ? 'selected' : ''}>{sendList.includes(type) ? '已选择' : '发送资料'}</button></div> })}</div><div className="send-summary"><span>已选择 <b>{sendList.length}</b> 份资料</span><button className="primary-button" onClick={() => notify(`资料已加入发送清单，共 ${sendList.length} 份`)}>发送资料 →</button></div></section></div> }

function DocField({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><b>{value}</b></div> }
function DocumentForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) { const { state } = useAppStore(); return <div className="modal-backdrop"><form className="document-form" onSubmit={onSubmit}><div className="form-head"><div><span className="section-kicker">NEW DOCUMENT</span><h2>新增资料</h2><p>暂不上传真实文件，先建立资料索引。</p></div><button type="button" onClick={onClose}>×</button></div><div className="form-body"><div className="form-grid"><label className="form-field"><span>资料名称<i>*</i></span><input name="name" required placeholder="如：阿甘油检测报告" /></label><label className="form-field"><span>资料类型<i>*</i></span><select name="type"><option>COA</option><option>SDS</option><option>TDS</option><option>规格书</option><option>检测报告</option><option>原产地资料</option><option>批次资料</option></select></label><label className="form-field"><span>关联产品<i>*</i></span><select name="product">{state.products.map((item) => <option key={item.id}>{item.name}</option>)}</select></label><label className="form-field"><span>关联批次</span><input name="batch" placeholder="如：ARG20260801" /></label><label className="form-field"><span>文件编号</span><input name="fileNo" placeholder="如：COA-20260801" /></label><label className="form-field"><span>版本号</span><input name="version" defaultValue="V1.0" /></label><label className="form-field"><span>发布日期</span><input name="publish" type="date" defaultValue={state.settings.simulatedToday} /></label><label className="form-field"><span>有效期</span><input name="expiry" type="date" /></label><label className="form-field"><span>资料状态</span><select name="status"><option>已上传</option><option>待完善</option></select></label></div><label className="form-field full-field"><span>备注</span><textarea name="note" placeholder="补充资料说明..." /></label></div><div className="form-foot"><button type="button" className="cancel-button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存资料　→</button></div></form></div> }
function FormulaLab({ onBack }: { onBack: () => void }) {
  const { state, dispatch } = useAppStore()
  const [formulas, setFormulas] = useState<Formula[]>(() => toAppFormulas(state.formulas, state.products))
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('全部')
  const [editing, setEditing] = useState<Formula | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [notice, setNotice] = useState('')
  const notify = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2300) }
  const visible = formulas.filter((formula) => { const text = `${formula.name} ${formula.id} ${formula.purpose} ${formula.ingredients.map((item) => item.name).join(' ')}`.toLowerCase(); return text.includes(query.toLowerCase()) && (filter === '全部' || formula.purpose === filter || formula.status === filter) })
  const saveFormula = (formula: Formula) => { const storeFormula = toStoreFormula(formula, state.products); const exists = formulas.some((item) => item.id === formula.id); if (exists) dispatch({ type: 'UPDATE_FORMULA', payload: { id: formula.id, changes: storeFormula } }); else dispatch({ type: 'ADD_FORMULA', payload: storeFormula }); setFormulas((current) => exists ? current.map((item) => item.id === formula.id ? formula : item) : [formula, ...current]); setEditing(null); setShowForm(false); notify('配方已保存') }
  const copyFormula = (formula: Formula) => { const copy = { ...formula, id: `F${state.settings.simulatedToday.replace(/-/g, '')}${String(formulas.length + 1).padStart(3, '0')}`, name: `${formula.name}（副本）`, status: '草稿', version: 'V1.0', ingredients: formula.ingredients.map((item) => ({ ...item })) }; dispatch({ type: 'ADD_FORMULA', payload: toStoreFormula(copy, state.products) }); setFormulas((current) => [copy, ...current]); notify('已生成新的配方草稿') }
  const deleteFormula = (formula: Formula) => { if (window.confirm('确定删除该配方吗？')) { dispatch({ type: 'DELETE_FORMULA', payload: { id: formula.id } }); setFormulas((current) => current.filter((item) => item.id !== formula.id)); setEditing(null); notify('配方已删除') } }
  const latestFormula = [...formulas].sort((a, b) => b.updated.localeCompare(a.updated))[0]
  const stockShortCount = formulas.filter((f) => f.ingredients.some((ing) => ing.stock < 10)).length
  if (editing) return <FormulaEditor formula={editing} onBack={() => setEditing(null)} onSave={saveFormula} onCopy={() => copyFormula(editing)} onDelete={() => deleteFormula(editing)} notify={notify} />
  return <div className="formula-page"><div className="formula-head"><div><button className="back-link" onClick={onBack}>← 返回工作台</button><div className="eyebrow">研发资产 · FORMULA LAB</div><h1>配方实验室</h1><p>管理配方、原料比例、用量和成本。</p></div><button className="primary-button" onClick={() => { setShowForm(true); setEditing(null) }}>＋ 新建配方</button></div><div className="formula-metrics"><div><span>配方总数</span><b>{formulas.length}</b><em>已建立配方档案</em></div><div><span>最近编辑</span><b>{latestFormula ? (latestFormula.updated === state.settings.simulatedToday ? '今天' : latestFormula.updated) : '—'}</b><em>{latestFormula ? `${latestFormula.name} · ${latestFormula.version}` : '暂无配方'}</em></div><div className="formula-warm"><span>常用配方</span><b>{formulas.filter((f) => f.status === '已完成').length}</b><em>已完成配方</em></div><div className="formula-alert"><span>草稿配方</span><b>{formulas.filter((f) => f.status === '草稿').length}</b><em>继续完善后保存</em></div></div><div className="formula-advice"><span>✦</span><div><b>今日研发建议</b><small>今天可以继续完善 {formulas.filter((f) => f.status === '实验中').length} 个实验中的配方。　有 {stockShortCount} 个配方所需原料库存不足。</small></div><button onClick={() => setFilter('实验中')}>查看实验中 →</button></div><div className="formula-toolbar"><label className="catalog-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索配方名称、原料、用途..." /></label><div className="formula-tabs">{formulaPurposes.map((item) => <button className={filter === item ? 'formula-tab active' : 'formula-tab'} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div></div><div className="formula-summary"><span>配方列表 <b>{visible.length}</b></span><span>所有比例均需严格等于 100%</span></div><div className="formula-list">{visible.map((formula) => <article className="formula-row" key={formula.id}><div className="formula-main"><div className={`formula-icon ${formula.ingredients[0].tone}`}>⌬</div><div><b>{formula.name}</b><small>{formula.id} · {formula.version}</small><em>{formula.purpose}</em></div></div><div className="formula-ratio"><span>总比例</span><b>{formula.ingredients.reduce((sum, item) => sum + item.ratio, 0).toFixed(2).replace(/\.00$/, '')}%</b><small>{formula.ingredients.length} 种原料</small></div><div className="formula-amount"><span>总制作量</span><b>{formula.total} {formula.unit}</b><small>每100g成本 ¥{(formula.ingredients.reduce((sum, item) => sum + item.ratio * formula.total / 100 * item.price / 1000, 0) / (formula.total / 100)).toFixed(2)}</small></div><span className={`formula-status ${formula.status === '已完成' ? 'complete' : formula.status === '草稿' ? 'draft' : 'testing'}`}><i />{formula.status}</span><div className="formula-actions"><button onClick={() => setEditing(formula)}>查看配方　→</button><button onClick={() => copyFormula(formula)}>复制</button></div></article>)}</div>{showForm && <FormulaEditor formula={null} onBack={() => setShowForm(false)} onSave={saveFormula} onCopy={() => undefined} onDelete={() => undefined} notify={notify} />}{notice && <div className="toast">✓ {notice}</div>}</div>
}

function FormulaEditor({ formula, onBack, onSave, onCopy, onDelete, notify }: { formula: Formula | null; onBack: () => void; onSave: (formula: Formula) => void; onCopy: () => void; onDelete: () => void; notify: (text: string) => void }) { const { state } = useAppStore();
  const [name, setName] = useState(formula?.name || '')
  const [purpose, setPurpose] = useState(formula?.purpose || '面部护理')
  const [total, setTotal] = useState(formula?.total || 1000)
  const [unit, setUnit] = useState(formula?.unit || 'g')
  const [status, setStatus] = useState(formula?.status || '草稿')
  const [version, setVersion] = useState(formula?.version || 'V1.0')
  const [ingredients, setIngredients] = useState<FormulaIngredient[]>(formula?.ingredients ?? state.products.slice(0, 4).map((product, index) => ({ id: index + 1, name: product.name, category: product.category, ratio: [60, 30, 8, 2][index] ?? 0, unit: 'g', price: product.price, stock: product.stock, tone: product.tone })))
  const ratioTotal = ingredients.reduce((sum, item) => sum + (Number(item.ratio) || 0), 0)
  const totalCost = ingredients.reduce((sum, item) => sum + (Number(item.ratio) || 0) * total / 100 * item.price / 1000, 0)
  const valid = Boolean(name.trim()) && ingredients.length > 0 && Math.abs(ratioTotal - 100) < 0.001 && total > 0
  const addIngredient = (event: React.ChangeEvent<HTMLSelectElement>) => { const product = state.products.find((candidate) => candidate.name === event.target.value); if (product && !ingredients.some((current) => current.name === product.name)) setIngredients((current) => [...current, { id: Date.now(), name: product.name, category: product.category, ratio: 0, unit: 'g', price: product.price, stock: product.stock, tone: product.tone }]); event.target.value = '' }
  const updateRatio = (id: number, value: string) => setIngredients((current) => current.map((item) => item.id === id ? { ...item, ratio: Number(value) || 0 } : item))
  const save = () => { if (!valid) return; onSave({ id: formula?.id || `F${state.settings.simulatedToday.replace(/-/g, '')}${String(Date.now()).slice(-3)}`, name, purpose, total, unit, status, version, updated: state.settings.simulatedToday, ingredients }) }
  return <div className="formula-page formula-editor-page"><div className="editor-top"><button className="back-link" onClick={onBack}>← 返回配方列表</button><div className="editor-actions"><button className="secondary-button" onClick={onCopy}>复制配方</button>{formula && <button className="danger-text" onClick={onDelete}>删除配方</button>}<button className="primary-button" disabled={!valid} onClick={save}>保存配方　→</button></div></div><div className="editor-title"><div><div className="eyebrow">{formula ? `配方档案 · ${formula.id}` : 'NEW FORMULA · 新建配方'}</div><h1>{name || '未命名配方'}</h1><p>先定义配方信息，再通过原料比例计算重量与成本。</p></div><span className={`editor-validity ${Math.abs(ratioTotal - 100) < 0.001 ? 'valid' : 'invalid'}`}>{Math.abs(ratioTotal - 100) < 0.001 ? '✓ 配方比例正确' : `比例为 ${ratioTotal.toFixed(2).replace(/\.00$/, '')}%，${ratioTotal < 100 ? `还差 ${(100 - ratioTotal).toFixed(2).replace(/\.00$/, '')}%` : '必须调整至100%后才能保存'}`}</span></div><div className="editor-layout"><div><section className="editor-card"><div className="editor-card-head"><span className="section-kicker">01 · FORMULA INFO</span><h2>配方信息</h2></div><div className="form-grid"><label className="form-field"><span>配方名称<i>*</i></span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="如：熟龄肌护理油" /></label><label className="form-field"><span>配方编号</span><input value={formula?.id || '保存后自动生成'} readOnly /></label><label className="form-field"><span>配方用途</span><select value={purpose} onChange={(event) => setPurpose(event.target.value)}>{formulaPurposes.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label><label className="form-field"><span>当前状态</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>草稿</option><option>实验中</option><option>已完成</option><option>已停用</option></select></label><label className="form-field"><span>总制作量<i>*</i></span><input type="number" min="0" value={total} onChange={(event) => setTotal(Number(event.target.value))} /></label><label className="form-field"><span>单位</span><select value={unit} onChange={(event) => setUnit(event.target.value)}><option>g</option><option>kg</option><option>ml</option><option>%</option></select></label></div></section><section className="editor-card ingredient-card"><div className="editor-card-head ingredient-heading"><div><span className="section-kicker">02 · INGREDIENTS</span><h2>原料配比</h2></div><select className="add-ingredient" onChange={addIngredient} defaultValue=""><option value="" disabled>＋ 添加原料</option>{state.products.map((item) => <option key={item.id}>{item.name}</option>)}</select></div><div className="ingredient-head-row"><span>原料名称</span><span>分类</span><span>添加比例</span><span>计算重量</span><span>单价 / KG</span><span>原料成本</span><span /></div>{ingredients.map((item) => { const weight = total * item.ratio / 100; const cost = weight * item.price / 1000; return <div className="ingredient-row" key={item.id}><div className="ingredient-name"><div className={`mini-ingredient ${item.tone}`}>✦</div><div><b>{item.name}</b><small>库存 {item.stock} KG</small></div></div><span className="ingredient-category">{item.category}</span><label className="ratio-input"><input type="number" min="0" max="100" step="0.01" value={item.ratio} onChange={(event) => updateRatio(item.id, event.target.value)} /><b>%</b></label><strong className="ingredient-weight">{weight.toFixed(2).replace(/\.00$/, '')} {unit}</strong><span className="ingredient-price">¥{item.price.toLocaleString()} / KG</span><strong className="ingredient-cost">¥{cost.toFixed(2)}</strong><button className="remove-ingredient" onClick={() => setIngredients((current) => current.filter((candidate) => candidate.id !== item.id))}>×</button></div> })}<div className="ratio-footer"><span>当前总比例</span><b>{ratioTotal.toFixed(2).replace(/\.00$/, '')}%</b><span>剩余比例</span><b className={ratioTotal > 100 ? 'over' : ''}>{(100 - ratioTotal).toFixed(2).replace(/\.00$/, '')}%</b></div>{ingredients.some((item) => total * item.ratio / 100 > item.stock * 1000) && <div className="formula-stock-warning">! 当前库存不足，无法满足该配方用量。配方暂不扣减库存。</div>}</section></div><aside><section className="cost-card"><span className="section-kicker">03 · COST</span><h2>成本核算</h2><div className="cost-total"><small>原料总成本</small><b>¥{totalCost.toFixed(2)}</b></div><div><span>每 100g 成本</span><b>¥{(totalCost / (total / 100)).toFixed(2)}</b></div><div><span>每 1kg 成本</span><b>¥{(totalCost / (total / 1000)).toFixed(2)}</b></div><p>成本根据原料重量与采购单价实时计算。</p></section><section className="version-card"><span className="section-kicker">04 · VERSION</span><h2>配方版本</h2><div className="version-line"><b>{version}</b><span>当前版本</span></div><div className="version-options"><button className={version === 'V1.0' ? 'active' : ''} onClick={() => setVersion('V1.0')}>V1.0</button><button className={version === 'V1.1' ? 'active' : ''} onClick={() => setVersion('V1.1')}>V1.1</button><button className={version === 'V2.0' ? 'active' : ''} onClick={() => setVersion('V2.0')}>V2.0</button></div><button className="new-version" onClick={() => { setVersion('V1.1'); notify('已创建新版本 V1.1，旧版本保持不变') }}>＋ 创建新版本</button></section></aside></div></div>
}
const money = (value: number) => `¥${value.toLocaleString('zh-CN')}`

function QuoteManagement({ onBack, onCustomer, onProduct }: { onBack: () => void; onCustomer: () => void; onProduct: () => void }) {
  const { state, dispatch } = useAppStore()
  const quotes = state.quotes
  const today = state.settings.simulatedToday
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('全部')
  const [selected, setSelected] = useState<Quote | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [notice, setNotice] = useState('')
  const showNotice = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2300) }
  const daysToExpiry = (quote: Quote) => Math.ceil((new Date(`${quote.validUntil}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000)
  const expiryText = (quote: Quote) => daysToExpiry(quote) < 0 ? '报价已过期' : daysToExpiry(quote) <= 1 ? '报价明天到期' : daysToExpiry(quote) <= 7 ? '报价即将到期' : ''
  const visible = quotes.filter((quote) => { const text = `${quote.id} ${quote.customer} ${quote.contact} ${quote.product}`.toLowerCase(); const matchesFilter = filter === '全部' || (filter === '已过期' ? daysToExpiry(quote) < 0 : quote.status === filter); return text.includes(query.toLowerCase()) && matchesFilter })
  const total = (quote: Quote) => quote.quantity * quote.price + quote.freight + quote.tax
  const saveQuote = (quote: Quote) => { dispatch({ type: 'ADD_QUOTE', payload: quote }); setShowForm(false); showNotice('报价已创建') }
  const acceptQuote = (quote: Quote) => { dispatch({ type: 'UPDATE_QUOTE', payload: { id: quote.id, changes: { status: '已接受' } } }); setSelected({ ...quote, status: '已接受' }); showNotice('报价已接受，状态已更新') }
  const convertToOrder = (quote: Quote) => { const id = `SO${today.replace(/-/g, '')}${String(Date.now()).slice(-3)}`; dispatch({ type: 'CREATE_ORDER', payload: { id, orderNo: id, customerId: quote.customerId, customer: quote.customer, quoteId: quote.id, quote: quote.id, productId: quote.productId, product: quote.product, batch: quote.batch ?? '', quantity: quote.quantity, shipped: 0, unit: quote.unit, price: quote.price, freight: quote.freight, tax: quote.tax, status: '待付款', payment: '待付款', paid: 0, orderDate: today, contact: quote.contact ?? '', delivery: quote.delivery ?? '款到发货', expected: quote.validUntil, logistics: '', tracking: '', stock: quote.stock ?? 0, tone: quote.tone ?? 'sage', createdAt: today, updatedAt: today, totalAmount: total(quote), paidAmount: 0, items: [{ productId: quote.productId, productName: quote.product, quantity: quote.quantity, unit: quote.unit, price: quote.price, amount: quote.quantity * quote.price, shippedQuantity: 0 }], timeline: [{ date: today, event: '客户接受报价' }, { date: today, event: '创建订单' }] } }); dispatch({ type: 'UPDATE_QUOTE', payload: { id: quote.id, changes: { status: '已转订单' } } }); setSelected({ ...quote, status: '已转订单' }); showNotice('已转为订单，可在订单管理查看') }
  if (selected) return <QuoteDetail quote={selected} total={total(selected)} expiry={expiryText(selected)} onBack={() => setSelected(null)} onCustomer={onCustomer} onProduct={onProduct} onAction={showNotice} onAccept={() => acceptQuote(selected)} onConvertToOrder={() => convertToOrder(selected)} />
  const waitingCount = quotes.filter((q) => ['已发送', '客户查看', '待确认'].includes(q.status)).length
  return <div className="quote-page"><div className="quote-head"><div><button className="back-link" onClick={onBack}>← 返回工作台</button><div className="eyebrow">商业资产 · QUOTE MANAGEMENT</div><h1>报价管理</h1><p>统一管理报价、有效期和客户反馈。</p></div><button className="primary-button" onClick={() => setShowForm(true)}>＋ 新建报价</button></div><div className="quote-metrics"><div><span>本月报价</span><b>{quotes.length}</b><em>本月已创建</em></div><div><span>待客户确认</span><b>{waitingCount}</b><em>等待客户反馈</em></div><div className="quote-warm"><span>即将到期</span><b>{quotes.filter((q) => daysToExpiry(q) >= 0 && daysToExpiry(q) <= 7).length}</b><em>7天内需要关注</em></div><div className="quote-done"><span>已成交</span><b>{quotes.filter((q) => ['已接受', '已转订单'].includes(q.status)).length}</b><em>已接受报价</em></div><div className="quote-alert"><span>已失效</span><b>{quotes.filter((q) => daysToExpiry(q) < 0 || q.status === '已拒绝').length}</b><em>需要重新报价</em></div></div><div className="quote-advice"><span>✦</span><div><b>报价提醒</b><small>有 {waitingCount} 份报价等待客户确认。　有 {quotes.filter((q) => daysToExpiry(q) >= 0 && daysToExpiry(q) <= 7).length} 份报价将在7天内到期。</small></div><button onClick={() => setFilter('待确认')}>查看待确认 →</button></div><div className="quote-toolbar"><label className="catalog-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索报价编号、客户、产品、联系人..." /></label><div className="quote-tabs">{quoteFilters.map((item) => <button className={filter === item ? 'quote-tab active' : 'quote-tab'} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div></div><div className="quote-summary"><span>报价列表 <b>{visible.length}</b></span><span>模拟日期：{today}</span></div><div className="quote-table"><div className="quote-table-head"><span>报价单</span><span>客户</span><span>产品明细</span><span>数量 / 单价</span><span>总金额</span><span>有效期</span><span>状态</span><span>操作</span></div>{visible.length ? visible.map((quote) => <article className="quote-row" key={quote.id}><div className="quote-id"><b>{quote.id}</b><small>{quote.quoteDate}</small></div><div className="quote-customer"><b>{quote.customer}</b><small>{quote.contact ?? ''}</small></div><div className="quote-product"><b>{quote.product}</b><small>{quote.batch ?? ''}</small></div><div className="quote-quantity"><b>{quote.quantity} {quote.unit}</b><small>{money(quote.price)} / {quote.unit}</small></div><strong className="quote-total">{money(total(quote))}</strong><div className={`quote-expiry ${expiryText(quote) ? 'expiring' : ''}`}><span>{quote.validUntil}</span>{expiryText(quote) && <small>{expiryText(quote)}</small>}</div><span className={`quote-status ${quote.status === '已接受' ? 'accepted' : quote.status === '待确认' ? 'pending' : 'sent'}`}><i />{quote.status}</span><div className="quote-actions"><button onClick={() => setSelected(quote)}>查看详情　→</button><button onClick={() => showNotice('报价已复制')}>复制报价</button></div></article>) : <div className="empty-catalog"><span>⌕</span><b>没有找到匹配的报价</b><small>试试报价编号、客户或产品关键词</small></div>}</div>{showForm && <QuoteForm onClose={() => setShowForm(false)} onSubmit={saveQuote} />}{notice && <div className="toast">✓ {notice}</div>}</div>
}

function QuoteDetail({ quote, total, expiry, onBack, onCustomer, onProduct, onAction, onAccept, onConvertToOrder }: { quote: Quote; total: number; expiry: string; onBack: () => void; onCustomer: () => void; onProduct: () => void; onAction: (text: string) => void; onAccept: () => void; onConvertToOrder: () => void }) { return <div className="quote-page quote-detail-page"><button className="back-link" onClick={onBack}>← 返回报价管理</button><div className="quote-detail-hero"><div className={`quote-mark ${quote.tone ?? ''}`}>¥</div><div><div className="eyebrow">报价档案 · {quote.id}</div><h1>{quote.id}</h1><p><button onClick={onCustomer}>{quote.customer}</button>　·　{quote.contact ?? ''}</p><div className="quote-tags"><span className={`quote-status ${quote.status === '已接受' ? 'accepted' : 'pending'}`}><i />{quote.status}</span>{expiry && <span className="expiry-tag">{expiry}</span>}</div></div><div className="quote-detail-buttons"><button className="secondary-button" onClick={() => onAction('报价已复制')}>复制报价</button><button className="primary-button" onClick={() => onAction('报价已发送')}>发送报价　→</button></div></div><div className="quote-detail-grid"><section className="quote-card"><div className="quote-card-head"><span className="section-kicker">01 · BASIC</span><h2>报价信息</h2></div><div className="quote-fields"><QuoteField label="报价编号" value={quote.id} /><QuoteField label="客户" value={quote.customer} clickable={onCustomer} /><QuoteField label="联系人" value={quote.contact ?? ''} /><QuoteField label="报价日期" value={quote.quoteDate} /><QuoteField label="有效期至" value={quote.validUntil} /><QuoteField label="报价状态" value={quote.status} /></div></section><section className="quote-card"><div className="quote-card-head"><span className="section-kicker">02 · PRODUCT</span><h2>产品明细</h2></div><div className="quote-product-detail"><div><b>{quote.product}</b><small>{quote.batch ?? ''} · {quote.unit}</small></div><button onClick={onProduct}>查看产品详情 →</button></div><div className="quote-fields compact"><QuoteField label="数量" value={`${quote.quantity} ${quote.unit}`} /><QuoteField label="单价" value={`${money(quote.price)} / ${quote.unit}`} clickable={onProduct} /><QuoteField label="MOQ" value={`${quote.moq ?? 0} ${quote.unit}`} /><QuoteField label="商品金额" value={money(quote.quantity * quote.price)} /></div>{quote.quantity < (quote.moq ?? 0) && <div className="moq-warning">! 当前数量低于 MOQ，请确认采购数量。</div>}{quote.quantity > (quote.stock ?? 0) && <div className="stock-warning">! 当前库存不足，无法满足本次报价数量，请确认采购计划。</div>}</section><section className="quote-card amount-card"><div className="quote-card-head"><span className="section-kicker">03 · AMOUNT</span><h2>金额汇总</h2></div><div className="amount-lines"><p><span>商品金额</span><b>{money(quote.quantity * quote.price)}</b></p><p><span>运费</span><b>{money(quote.freight)}</b></p><p><span>税费</span><b>{money(quote.tax)}</b></p><p className="amount-total"><span>报价总金额</span><b>{money(total)}</b></p></div></section><section className="quote-card"><div className="quote-card-head"><span className="section-kicker">04 · TERMS</span><h2>交易条款</h2></div><div className="quote-fields compact"><QuoteField label="付款方式" value={quote.payment ?? '—'} /><QuoteField label="交货方式" value={quote.delivery ?? '—'} /><QuoteField label="备注" value={quote.note ?? '—'} /></div></section></div><div className="quote-next-actions"><b>下一步操作</b><button onClick={() => onAction('报价编辑已开启')}>编辑报价</button><button onClick={() => onAccept()}>客户接受</button><button onClick={() => onAction('报价已重新创建')}>重新报价</button><button onClick={() => onConvertToOrder()}>转为订单</button></div></div> }

function QuoteField({ label, value, clickable }: { label: string; value: string; clickable?: () => void }) { return <div><small>{label}</small>{clickable ? <button onClick={clickable}>{value}　↗</button> : <b>{value}</b>}</div> }

function QuoteForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (quote: Quote) => void }) { const { state } = useAppStore(); const [form, setForm] = useState({ customer: 'XX化妆品有限公司', product: '摩洛哥阿甘油', batch: 'ARG20260801', quantity: '20', unit: 'KG', price: '380', moq: '10', freight: '0', tax: '0', quoteDate: state.settings.simulatedToday, validUntil: '2026-08-30', payment: 'T/T 预付', delivery: '款到发货', note: '' }); const update = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value })); const quantity = Number(form.quantity) || 0; const price = Number(form.price) || 0; const freight = Number(form.freight) || 0; const tax = Number(form.tax) || 0; const moq = Number(form.moq) || 0; const itemTotal = quantity * price; const productsWithStock = selectProductsWithStock(state); const currentProduct = productsWithStock.find((item) => item.name === form.product); const stock = currentProduct?.currentStock ?? 0; const save = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const customerId = state.customers.find((item) => item.company === form.customer)?.id ?? ''
    const productId = state.products.find((item) => item.name === form.product)?.id ?? ''
    const customerContact = state.customers.find((item) => item.company === form.customer)?.contact ?? '待补充'
    onSubmit({ ...form, id: `Q20260823${String(Date.now()).slice(-3)}`, customerId, productId, contact: customerContact, quantity, price, moq, freight, tax, status: '草稿', stock, tone: 'sage' })
  }; return <div className="modal-backdrop"><form className="quote-form" onSubmit={save}><div className="form-head"><div><span className="section-kicker">NEW QUOTE</span><h2>新建报价</h2><p>报价金额会随数量、单价和费用自动计算。</p></div><button type="button" onClick={onClose}>×</button></div><div className="form-body"><div className="form-grid"><label className="form-field"><span>客户<i>*</i></span><select value={form.customer} onChange={(event) => update('customer', event.target.value)}><option>XX化妆品有限公司</option><option>XX美容院</option><option>XX芳疗工作室</option></select></label><label className="form-field"><span>报价日期<i>*</i></span><input type="date" value={form.quoteDate} onChange={(event) => update('quoteDate', event.target.value)} /></label><label className="form-field"><span>有效期<i>*</i></span><input type="date" value={form.validUntil} onChange={(event) => update('validUntil', event.target.value)} /></label><label className="form-field"><span>产品<i>*</i></span><select value={form.product} onChange={(event) => { const name = event.target.value; update('product', name); const product = state.products.find((item) => item.name === name); if (product) update('price', String(product.price)) }}><option>摩洛哥阿甘油</option><option>摩洛哥熔岩泥</option><option>摩洛哥仙人掌籽油</option></select></label><label className="form-field"><span>批次</span><input value={form.batch} onChange={(event) => update('batch', event.target.value)} /></label><label className="form-field"><span>包装规格</span><input value={form.unit} onChange={(event) => update('unit', event.target.value)} /></label><label className="form-field"><span>数量<i>*</i></span><input type="number" min="0" step="0.01" value={form.quantity} onChange={(event) => update('quantity', event.target.value)} /></label><label className="form-field"><span>单位</span><select value={form.unit} onChange={(event) => update('unit', event.target.value)}><option>KG</option><option>ML</option><option>桶</option></select></label><label className="form-field"><span>单价<i>*</i></span><input type="number" min="0" value={form.price} onChange={(event) => update('price', event.target.value)} /></label><label className="form-field"><span>MOQ</span><input type="number" min="0" value={form.moq} onChange={(event) => update('moq', event.target.value)} /></label><label className="form-field"><span>运费</span><input type="number" min="0" value={form.freight} onChange={(event) => update('freight', event.target.value)} /></label><label className="form-field"><span>税费</span><input type="number" min="0" value={form.tax} onChange={(event) => update('tax', event.target.value)} /></label><label className="form-field"><span>付款方式</span><select value={form.payment} onChange={(event) => update('payment', event.target.value)}><option>T/T 预付</option><option>月结</option><option>款到发货</option></select></label><label className="form-field"><span>交货方式</span><select value={form.delivery} onChange={(event) => update('delivery', event.target.value)}><option>款到发货</option><option>工厂交货</option><option>快递到付</option></select></label></div><div className="quote-calculator"><div><span>商品金额</span><b>{money(itemTotal)}</b></div><div><span>报价总金额</span><b>{money(itemTotal + freight + tax)}</b></div></div>{quantity < moq && <div className="moq-warning">! 当前数量低于 MOQ，请确认采购数量。</div>}{quantity > stock && <div className="stock-warning">! 当前库存不足，无法满足本次报价数量，请确认采购计划。</div>}<label className="form-field full-field"><span>备注</span><textarea value={form.note} onChange={(event) => update('note', event.target.value)} placeholder="补充报价条件或客户需求..." /></label></div><div className="form-foot"><button type="button" className="cancel-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">保存报价　→</button></div></form></div> }

function SampleManagement({ onBack }: { onBack: () => void }) {
  const { state, dispatch } = useAppStore()
  const samples = state.samples
  const today = state.settings.simulatedToday
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('全部')
  const [selected, setSelected] = useState<Sample | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const counts = { pending: samples.filter((sample) => ['申请中', '待准备'].includes(sample.status)).length, preparing: samples.filter((sample) => ['准备中', '待寄出'].includes(sample.status)).length, sent: samples.filter((sample) => ['已寄出', '已签收', '测试中', '等待反馈'].includes(sample.status)).length, feedback: samples.filter((sample) => sample.status === '等待反馈').length, done: samples.filter((sample) => sample.status === '已完成').length }
  const visible = samples.filter((sample) => { const text = `${sample.id} ${sample.customer} ${sample.product} ${sample.batch} ${sample.tracking}`.toLowerCase(); return text.includes(query.toLowerCase()) && (filter === '全部' || sample.status === filter) })
  const showNotice = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2300) }
  const addTimeline = (sample: Sample, status: string, event: string) => ({ ...sample, status, timeline: [...(sample.timeline ?? []), { date: today, event }] })
  const changeStatus = (sample: Sample, status: string, event: string) => {
    if (status === '已寄出' && sample.status !== '已寄出') {
      const exactMatch = sample.batch ? state.inventory.find((record) => record.productId === sample.productId && record.batch === sample.batch) : undefined
      const fifoRecord = sample.batch ? undefined : state.inventory.filter((record) => record.productId === sample.productId).sort((a, b) => a.inboundDate.localeCompare(b.inboundDate)).find((record) => record.inbound - record.outbound - record.reserved > 0)
      const record = exactMatch ?? fifoRecord
      if (!record) {
        showNotice(sample.batch ? `批次 ${sample.batch} 不存在，无法寄出样品` : '未找到可用库存批次，无法寄出样品')
        return
      }
      if (record.inbound - record.outbound < sample.quantity) {
        showNotice(`批次 ${record.batch} 库存不足（可用 ${record.inbound - record.outbound} KG），无法寄出样品`)
        return
      }
      dispatch({ type: 'STOCK_OUT', payload: { inventoryId: record.id, quantity: sample.quantity } })
    }
    const updated = { ...addTimeline(sample, status, event), stock: status === '已寄出' && sample.status !== '已寄出' ? Math.max(0, (sample.stock ?? 0) - sample.quantity) : sample.stock, sendDate: status === '已寄出' ? today : sample.sendDate, signedDate: status === '已签收' ? today : sample.signedDate }
    dispatch({ type: 'UPDATE_SAMPLE', payload: { id: sample.id, changes: updated } })
    setSelected(updated)
    showNotice(status === '已寄出' ? `样品已寄出，库存扣减 ${sample.quantity} KG` : `状态已更新为${status}`)
  }
  const statusAction = (sample: Sample) => { const actions: Record<string, [string, string]> = { '待准备': ['开始准备', '准备中'], '准备中': ['准备完成', '待寄出'], '待寄出': ['确认寄出', '已寄出'], '已寄出': ['确认签收', '已签收'], '已签收': ['开始测试', '测试中'], '测试中': ['记录反馈', '等待反馈'], '等待反馈': ['立即跟进', '等待反馈'] }; return actions[sample.status] }
  const saveSample = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const customerName = String(data.get('customer'))
    const productName = String(data.get('product'))
    const customerRecord = state.customers.find((item) => item.company === customerName)
    const customerId = customerRecord?.id ?? ''
    const productId = state.products.find((item) => item.name === productName)?.id ?? ''
    const productStock = state.inventory.filter((item) => item.productId === productId).reduce((sum, item) => sum + (item.inbound - item.outbound), 0)
    const applyDate = String(data.get('applyDate')) || today
    const newSample: Sample = { id: `sample-${Date.now()}`, customerId, customer: customerName, contact: String(data.get('contact')) || customerRecord?.contact || '', phone: String(data.get('phone')) || customerRecord?.phone || '', productId, product: productName, spec: String(data.get('spec')), quantity: Number(data.get('quantity')) || 0, batch: String(data.get('batch')), status: '申请中', applyDate, sendDate: '', signedDate: '', feedbackDate: '', expectedFeedback: '', address: String(data.get('address')), carrier: String(data.get('carrier')), tracking: String(data.get('tracking')), stock: productStock, tone: 'sage', timeline: [{ date: applyDate, event: '客户申请样品' }] }
    dispatch({ type: 'ADD_SAMPLE', payload: newSample })
    setFormOpen(false)
    showNotice('样品申请已创建')
  }
  const saveFeedback = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const data = new FormData(event.currentTarget)
    const feedback = { date: String(data.get('date')), rating: String(data.get('rating')), trial: String(data.get('trial')), scent: String(data.get('scent')), feel: String(data.get('feel')), result: String(data.get('result')), need: String(data.get('need')), next: String(data.get('next')), note: String(data.get('note')) }
    const updated = { ...selected, status: '已完成', feedbackDate: feedback.date, feedback, timeline: [...(selected.timeline ?? []), { date: feedback.date, event: '客户反馈已记录', detail: feedback.rating }] }
    dispatch({ type: 'UPDATE_SAMPLE', payload: { id: selected.id, changes: updated } })
    setSelected(updated)
    setFeedbackOpen(false)
    showNotice('客户反馈已记录，并同步 CRM')
  }
  if (selected) return <><SampleDetail sample={selected} onBack={() => setSelected(null)} onStatus={(status, event) => changeStatus(selected, status, event)} onFeedback={() => setFeedbackOpen(true)} onAction={showNotice} />{feedbackOpen && <FeedbackForm onClose={() => setFeedbackOpen(false)} onSubmit={saveFeedback} />}</>
  return <div className="sample-page"><div className="sample-head"><div><button className="back-link" onClick={onBack}>← 返回工作台</button><div className="eyebrow">样品资产 · SAMPLE WORKFLOW</div><h1>样品管理</h1><p>从申请到反馈，完整记录每一个样品。</p></div><button className="primary-button" onClick={() => setFormOpen(true)}>＋ 新建样品</button></div><div className="sample-metrics"><div><span>待处理样品</span><b>{counts.pending}</b><em>需要开始准备</em></div><div><span>准备中</span><b>{counts.preparing}</b><em>即将安排寄出</em></div><div><span>已寄出</span><b>{counts.sent}</b><em>在途样品</em></div><div className="sample-alert"><span>等待反馈</span><b>{counts.feedback}</b><em>建议主动跟进</em></div><div className="sample-done"><span>已完成</span><b>{counts.done}</b><em>已沉淀反馈</em></div></div><div className="sample-advice"><span>✦</span><div><b>今日工作建议</b><small>有 {counts.sent} 个样品等待客户反馈。　有 {counts.pending + counts.preparing} 个客户等待样品处理。　建议优先跟进已签收样品。</small></div><button onClick={() => setFilter('等待反馈')}>查看待反馈 →</button></div><div className="sample-toolbar"><label className="catalog-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索样品编号、客户、产品、批次、物流单号..." /></label><div className="sample-tabs">{sampleFilters.map((item) => <button className={filter === item ? 'sample-tab active' : 'sample-tab'} key={item} onClick={() => setFilter(item)}>{item}{item === '等待反馈' && counts.feedback > 0 && <small>{counts.feedback}</small>}</button>)}</div></div><div className="sample-summary"><span>样品列表 <b>{visible.length}</b></span><span>当前模拟库存扣减已启用</span></div><div className="sample-table"><div className="sample-table-head"><span>样品信息</span><span>客户</span><span>产品 / 批次</span><span>规格</span><span>状态</span><span>寄出 / 反馈</span><span>操作</span></div>{visible.length ? visible.map((sample) => { const action = statusAction(sample); return <article className="sample-row" key={sample.id}><div className="sample-main"><div className={`sample-number ${sample.tone ?? ''}`}>{sample.id.replace('样品', '')}</div><div><b>{sample.id}</b><small>{sample.customer}</small></div></div><span className="sample-customer">{sample.contact ?? ''}<small>{sample.phone ?? ''}</small></span><span className="sample-product"><b>{sample.product}</b><small>{sample.batch ?? ''}</small></span><span className="sample-spec">{sample.spec ?? ''} × {sample.quantity} KG</span><span className={`sample-status status-${sample.status === '等待反馈' ? 'feedback' : sample.status === '已完成' ? 'done' : sample.status === '已寄出' ? 'sent' : 'prepare'}`}><i />{sample.status}</span><div className="sample-date"><span>{sample.sendDate ? `寄出 ${sample.sendDate}` : '尚未寄出'}</span><small>{sample.expectedFeedback ? `预计 ${sample.expectedFeedback}` : '等待安排'}</small></div><div className="sample-actions"><button onClick={() => setSelected(sample)}>查看详情　→</button>{action && <button onClick={() => action[1] === '等待反馈' ? showNotice('已创建跟进任务') : changeStatus(sample, action[1], action[0])}>{action[0]}</button>}</div></article> }) : <div className="empty-catalog"><span>⌕</span><b>没有找到匹配的样品</b><small>试试客户、产品或批次关键词</small></div>}</div>{formOpen && <SampleForm onClose={() => setFormOpen(false)} onSubmit={saveSample} />}{notice && <div className="toast">✓ {notice}</div>}</div>
}

function SampleDetail({ sample, onBack, onStatus, onFeedback, onAction }: { sample: Sample; onBack: () => void; onStatus: (status: string, event: string) => void; onFeedback: () => void; onAction: (text: string) => void }) { const action = ({ '待准备': ['开始准备', '准备中'], '准备中': ['准备完成', '待寄出'], '待寄出': ['确认寄出', '已寄出'], '已寄出': ['确认签收', '已签收'], '已签收': ['开始测试', '测试中'], '测试中': ['记录反馈', '等待反馈'], '等待反馈': ['立即跟进', '等待反馈'] } as Record<string, [string, string]>)[sample.status]; return <div className="sample-page sample-detail-page"><button className="back-link" onClick={onBack}>← 返回样品管理</button><div className="sample-detail-hero"><div className={`sample-number large ${sample.tone ?? ''}`}>{sample.id.replace('样品', '')}</div><div><div className="eyebrow">样品档案 · {sample.batch ?? ''}</div><h1>{sample.id} · {sample.product}</h1><p>{sample.customer}　<span>{sample.contact ?? ''} · {sample.phone ?? ''}</span></p><div className="sample-tags"><span>{sample.spec ?? ''}</span><span>{sample.batch ?? ''}</span><strong className={`sample-detail-status ${sample.status === '等待反馈' ? 'feedback' : 'sent'}`}><i />{sample.status}</strong></div></div><div className="sample-detail-actions">{action && <button className="primary-button" onClick={() => action[1] === '等待反馈' ? onAction('已创建跟进任务') : onStatus(action[1], action[0])}>{action[0]}</button>}{sample.status === '等待反馈' && <button className="secondary-button" onClick={onFeedback}>＋ 添加反馈</button>}</div></div><div className="sample-detail-grid"><section className="sample-card"><div className="sample-card-head"><span className="section-kicker">01 · CUSTOMER</span><h2>客户信息</h2></div><div className="sample-fields"><SampleField label="客户名称" value={sample.customer} /><SampleField label="联系人" value={sample.contact ?? '待补充'} /><SampleField label="联系方式" value={sample.phone ?? '待补充'} /><SampleField label="收货地址" value={sample.address ?? '待补充'} /></div></section><section className="sample-card"><div className="sample-card-head"><span className="section-kicker">02 · PRODUCT</span><h2>产品信息</h2></div><div className="sample-fields"><SampleField label="产品名称" value={sample.product} /><SampleField label="样品规格" value={sample.spec ?? '待补充'} /><SampleField label="产品批次" value={sample.batch ?? '待补充'} /><SampleField label="当前库存" value={`${sample.stock ?? 0} KG（模拟）`} /></div></section><section className="sample-card"><div className="sample-card-head"><span className="section-kicker">03 · SAMPLE</span><h2>样品信息</h2></div><div className="sample-fields"><SampleField label="样品编号" value={sample.id} /><SampleField label="样品数量" value={`${sample.quantity} KG`} /><SampleField label="申请日期" value={sample.applyDate} /><SampleField label="寄出日期" value={sample.sendDate || '尚未寄出'} /><SampleField label="签收日期" value={sample.signedDate || '尚未签收'} /><SampleField label="预计反馈日期" value={sample.expectedFeedback || '待安排'} /><SampleField label="当前状态" value={sample.status} /></div></section><section className="sample-card"><div className="sample-card-head"><span className="section-kicker">04 · DELIVERY</span><h2>物流信息</h2></div><div className="sample-fields"><SampleField label="物流公司" value={sample.carrier || '待安排'} /><SampleField label="物流单号" value={sample.tracking || '待生成'} /><SampleField label="物流状态" value={sample.status === '已寄出' ? '运输中，等待客户签收' : sample.signedDate ? '客户已签收' : '尚未发出'} /></div></section><section className="sample-card feedback-card"><div className="sample-card-head"><span className="section-kicker">05 · FEEDBACK</span><h2>客户反馈</h2></div>{sample.feedback ? <div className="sample-fields"><SampleField label="反馈日期" value={sample.feedback.date} /><SampleField label="客户评价" value={sample.feedback.rating} /><SampleField label="试用结果" value={sample.feedback.trial} /><SampleField label="气味 / 肤感" value={`${sample.feedback.scent} · ${sample.feedback.feel}`} /><SampleField label="配方测试结果" value={sample.feedback.result} /><SampleField label="客户需求" value={sample.feedback.need} /><SampleField label="下一步" value={sample.feedback.next} /></div> : <div className="feedback-empty"><span>◌</span><b>等待客户完成试用</b><p>{sample.signedDate ? '客户已签收，建议在 3-5 天后主动询问试用反馈。' : '样品寄出后，客户反馈会记录在这里。'}</p><button onClick={onFeedback}>＋ 添加反馈</button></div>}</section><section className="sample-card timeline-card"><div className="sample-card-head"><span className="section-kicker">06 · ACTIVITY</span><h2>样品时间轴</h2></div><div className="sample-timeline">{(sample.timeline ?? []).map((item, index) => <div key={`${item.date}-${item.event}-${index}`}><time>{item.date}</time><i className={index === (sample.timeline?.length ?? 0) - 1 ? 'current' : ''} /><div><b>{item.event}</b>{item.detail && <small>{item.detail}</small>}</div></div>)}</div></section></div><div className="sample-sync"><span>✓</span><div><b>已同步客户 CRM</b><small>客户的样品状态与反馈会显示在客户档案和跟进中心。</small></div><button onClick={() => onAction('已创建客户跟进任务')}>去创建跟进 →</button></div></div> }

function SampleField({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><b>{value}</b></div> }

function SampleForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) { const { state } = useAppStore(); return <div className="modal-backdrop"><form className="sample-form" onSubmit={onSubmit}><div className="form-head"><div><span className="section-kicker">NEW SAMPLE</span><h2>新建样品</h2><p>创建一条从申请开始的样品流程。</p></div><button type="button" onClick={onClose}>×</button></div><div className="form-body"><div className="form-grid"><label className="form-field"><span>客户<i>*</i></span><select name="customer" required><option>XX化妆品有限公司</option><option>XX美容院</option><option>XX芳疗工作室</option></select></label><label className="form-field"><span>产品<i>*</i></span><select name="product" required><option>摩洛哥阿甘油</option><option>摩洛哥熔岩泥</option><option>摩洛哥仙人掌籽油</option></select></label><label className="form-field"><span>批次<i>*</i></span><input name="batch" required placeholder="如：ARG20260801" /></label><label className="form-field"><span>样品规格<i>*</i></span><input name="spec" required placeholder="如：100ml" /></label><label className="form-field"><span>样品数量</span><input name="quantity" type="number" step="0.01" min="0" defaultValue="0.1" /></label><label className="form-field"><span>申请日期</span><input name="applyDate" type="date" defaultValue={state.settings.simulatedToday} /></label><label className="form-field"><span>预计寄出日期</span><input name="sendDate" type="date" /></label><label className="form-field"><span>收货地址</span><input name="address" placeholder="请输入收货地址" /></label><label className="form-field"><span>联系人</span><input name="contact" placeholder="如：李女士" /></label><label className="form-field"><span>联系电话</span><input name="phone" placeholder="请输入联系电话" /></label><label className="form-field"><span>物流公司</span><input name="carrier" placeholder="如：顺丰速运" /></label><label className="form-field"><span>物流单号</span><input name="tracking" placeholder="寄出后填写" /></label></div><label className="form-field full-field"><span>备注</span><textarea name="note" placeholder="补充样品用途、储存条件等信息..." /></label></div><div className="form-foot"><button type="button" className="cancel-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">创建样品　→</button></div></form></div> }

function FeedbackForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) { const { state } = useAppStore(); return <div className="modal-backdrop"><form className="feedback-form" onSubmit={onSubmit}><div className="form-head"><div><span className="section-kicker">SAMPLE FEEDBACK</span><h2>添加客户反馈</h2><p>将试用结果沉淀为下一步业务机会。</p></div><button type="button" onClick={onClose}>×</button></div><div className="form-body"><div className="form-grid"><label className="form-field"><span>反馈日期<i>*</i></span><input name="date" type="date" defaultValue={state.settings.simulatedToday} required /></label><label className="form-field"><span>客户评价</span><input name="rating" placeholder="如：整体满意" /></label><label className="form-field"><span>试用情况</span><input name="trial" placeholder="如：已完成一周试用" /></label><label className="form-field"><span>气味评价</span><input name="scent" placeholder="如：气味自然" /></label><label className="form-field"><span>肤感评价</span><input name="feel" placeholder="如：吸收较快" /></label><label className="form-field"><span>配方测试结果</span><input name="result" placeholder="如：小样测试通过" /></label><label className="form-field"><span>客户需求</span><input name="need" placeholder="客户后续需求" /></label><label className="form-field"><span>下一步</span><input name="next" placeholder="如：发送正式报价" /></label></div><label className="form-field full-field"><span>备注</span><textarea name="note" placeholder="补充客户原话或跟进重点..." /></label></div><div className="form-foot"><button type="button" className="cancel-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">保存反馈　→</button></div></form></div> }

function CustomerCRM({ onBack }: { onBack: () => void }) {
  const { state, dispatch } = useAppStore()
  const customers = state.customers
  const today = state.settings.simulatedToday
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('全部')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showFollow, setShowFollow] = useState(false)
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ company: '', contact: '', title: '', phone: '', wechat: '', email: '', region: '', type: '化妆品品牌', source: '', business: '', products: '', scale: '', cycle: '', note: '', tag: '品牌方', status: '新客户' })
  const updateForm = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const showNotice = (text: string) => { setNotice(text); window.setTimeout(() => setNotice(''), 2200) }
  const visibleCustomers = customers
    .filter((customer) => {
      const text = `${customer.company} ${customer.contact} ${customer.phone} ${customer.products} ${customer.tag} ${customer.type}`.toLowerCase()
      return text.includes(query.toLowerCase()) && (filter === '全部' || customer.status === filter)
    })
    .sort((a, b) => b.lastContact.localeCompare(a.lastContact))
  const monthlyNewCount = customers.filter((customer) => isSameMonth(customer.createdAt ?? '', today)).length
  const saveCustomer = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.company || !form.contact) return
    dispatch({
      type: 'ADD_CUSTOMER',
      payload: {
        id: `customer-${Date.now()}`,
        company: form.company,
        contact: form.contact,
        title: form.title || '待补充',
        phone: form.phone || '待补充',
        wechat: form.wechat || '待补充',
        email: form.email || '待补充',
        region: form.region || '待补充',
        type: form.type,
        source: form.source || '自主开发',
        business: form.business || '待补充',
        products: form.products || '待补充',
        scale: form.scale || '待确认',
        cycle: form.cycle || '待确认',
        grade: 'C',
        status: form.status,
        tag: form.tag,
        lastContact: '尚未联系',
        amount: 0,
        next: '新客户，建议尽快完成首次沟通。',
        tone: 'sage',
        createdAt: today,
        updatedAt: today,
        timeline: [{ date: today, event: '新增客户' }],
      },
    })
    setShowForm(false)
    showNotice('客户已添加到 CRM')
    setForm({ company: '', contact: '', title: '', phone: '', wechat: '', email: '', region: '', type: '化妆品品牌', source: '', business: '', products: '', scale: '', cycle: '', note: '', tag: '品牌方', status: '新客户' })
  }
  const saveFollow = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selected) return
    const data = new FormData(event.currentTarget); const date = String(data.get('date')); const content = String(data.get('content')); const method = String(data.get('method') || '电话'); const nextDate = String(data.get('nextDate') || ''); const owner = String(data.get('owner') || '管理员')
    dispatch({ type: 'ADD_FOLLOW_UP', payload: { id: `follow-up-${Date.now()}`, customerId: selected.id, date, method, content, status: '待跟进', nextDate, owner } })
    const updated = { ...selected, lastContact: date, timeline: [...(selected.timeline ?? []), { date, event: '新增跟进', detail: content }] }
    dispatch({ type: 'UPDATE_CUSTOMER', payload: { id: selected.id, changes: { lastContact: date, timeline: updated.timeline } } })
    setSelected(updated); setShowFollow(false); showNotice('跟进记录已加入时间轴')
  }
  if (selected) return <><CustomerDetail customer={selected} onBack={() => setSelected(null)} onFollow={() => setShowFollow(true)} onAction={showNotice} />{showFollow && <FollowForm onClose={() => setShowFollow(false)} onSubmit={saveFollow} />}</>
  return <div className="crm-page"><div className="crm-head"><div><button className="back-link" onClick={onBack}>← 返回工作台</button><div className="eyebrow">客户资产 · CUSTOMER RELATIONSHIP</div><h1>客户 CRM</h1><p>把每一次业务往来，沉淀为更好的客户关系。</p></div><button className="primary-button" onClick={() => setShowForm(true)}>＋ 新客户</button></div><div className="crm-metrics"><div><span>客户总数</span><b>{customers.length}</b><em>全部客户档案</em></div><div><span>本月新增</span><b>{monthlyNewCount}</b><em>较上月 <strong>↑ 20%</strong></em></div><div className="crm-warm"><span>高意向客户</span><b>{customers.filter((c) => c.status === '高意向').length}</b><em>建议优先跟进</em></div><div className="crm-alert"><span>待跟进客户</span><b>{customers.filter((c) => c.status === '待跟进').length}</b><em>其中 1 位超过15天</em></div></div><div className="crm-toolbar"><label className="catalog-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索公司、联系人、电话、产品需求..." /></label><div className="crm-tabs">{customerFilters.map((item) => <button className={filter === item ? 'crm-tab active' : 'crm-tab'} key={item} onClick={() => setFilter(item)}>{item}{item === '全部' && <small>{customers.length}</small>}</button>)}</div></div><div className="crm-summary"><span>客户列表 <b>{visibleCustomers.length}</b></span><span>按最近跟进时间排序　⌄</span></div><div className="customer-table"><div className="customer-table-head"><span>客户信息</span><span>客户类型</span><span>关注产品</span><span>采购规模</span><span>客户状态</span><span>最近联系</span><span>操作</span></div>{visibleCustomers.length ? visibleCustomers.map((customer) => <article className="customer-row" key={customer.id}><div className="customer-main"><div className={`customer-avatar ${customer.tone ?? ''}`}>{customer.company.slice(0, 1)}</div><div><b>{customer.company}</b><small>{customer.contact} · {customer.title ?? ''}</small><em>{customer.phone}</em></div></div><span className="customer-type">{customer.type}</span><span className="customer-products">{customer.products}</span><span className="customer-scale">{customer.scale ?? '—'}</span><span className={`customer-status status-${customer.status === '高意向' ? 'hot' : customer.status === '已成交' ? 'done' : customer.status === '待跟进' ? 'wait' : 'progress'}`}><i />{customer.status}</span><div className="customer-last"><span>{customer.lastContact}</span>{customer.status === '待跟进' && <small>超过15天未跟进</small>}{customer.company === 'XX美容院' && <small>等待样品反馈</small>}</div><button className="customer-detail-button" onClick={() => setSelected(customer)}>查看详情　→</button></article>) : <div className="empty-catalog"><span>⌕</span><b>没有找到匹配的客户</b><small>试试公司、联系人、产品或标签关键词</small></div>}</div>{showForm && <CustomerForm form={form} updateForm={updateForm} onClose={() => setShowForm(false)} onSubmit={saveCustomer} />}{notice && <div className="toast">✓ {notice}</div>}</div>
}

function CustomerDetail({ customer, onBack, onFollow, onAction }: { customer: Customer; onBack: () => void; onFollow: () => void; onAction: (text: string) => void }) {
  const { state } = useAppStore()
  const stats = selectCustomerStats(state, customer.id)
  return <div className="crm-page crm-detail-page"><button className="back-link" onClick={onBack}>← 返回客户 CRM</button><div className="customer-detail-hero"><div className={`customer-avatar large ${customer.tone ?? ''}`}>{customer.company.slice(0, 1)}</div><div><div className="eyebrow">客户档案 · {customer.grade ?? 'C'} 级客户</div><h1>{customer.company}</h1><p>{customer.contact} · {customer.title ?? ''}　<span>{customer.type}</span></p><div className="customer-tags"><span>{customer.tag}</span><span>{customer.region ?? ''}</span><strong className={`detail-status ${customer.status === '高意向' ? 'hot' : 'progress'}`}><i />{customer.status}</strong></div></div><button className="primary-button" onClick={onFollow}>＋ 新跟进</button></div><div className="crm-detail-grid"><section className="crm-card"><div className="crm-card-head"><span className="section-kicker">01 · PROFILE</span><h2>基础信息</h2></div><div className="crm-fields"><CrmField label="公司名称" value={customer.company} /><CrmField label="联系人" value={customer.contact} /><CrmField label="职位" value={customer.title ?? '待补充'} /><CrmField label="手机号" value={customer.phone} /><CrmField label="微信" value={customer.wechat ?? '待补充'} /><CrmField label="邮箱" value={customer.email ?? '待补充'} /><CrmField label="所在地区" value={customer.region ?? '待补充'} /><CrmField label="客户类型" value={customer.type} /><CrmField label="客户来源" value={customer.source} /><CrmField label="客户标签" value={customer.tag} /></div></section><section className="crm-card"><div className="crm-card-head"><span className="section-kicker">02 · BUSINESS</span><h2>业务信息</h2></div><div className="crm-fields"><CrmField label="主营业务" value={customer.business ?? '待补充'} /><CrmField label="关注产品" value={customer.products} /><CrmField label="采购规模" value={customer.scale ?? '待确认'} /><CrmField label="采购周期" value={customer.cycle ?? '待确认'} /><CrmField label="预计采购时间" value="2026年09月" /><CrmField label="客户等级" value={`${customer.grade ?? 'C'} 级`} /><CrmField label="客户状态" value={customer.status} /></div><div className="next-step"><span>✦</span><div><b>下一步建议</b><p>{customer.next ?? ''}</p></div></div></section><section className="crm-card sales-card"><div className="crm-card-head"><span className="section-kicker">03 · SALES</span><h2>销售信息</h2></div><div className="sales-stats"><CrmField label="历史询价" value={`${stats.quoteCount} 次`} /><CrmField label="历史报价" value={`${stats.quoteCount} 份`} /><CrmField label="历史样品" value={`${stats.sampleCount} 次`} /><CrmField label="历史订单" value={`${stats.orderCount} 单`} /><CrmField label="本月订单" value={`${stats.monthlyOrderCount} 单`} /><CrmField label="已完成订单" value={`${stats.completedCount} 单`} /><CrmField label="累计采购金额" value={money(stats.totalSpent)} /><CrmField label="最近采购时间" value={stats.lastOrderDate || '—'} /></div></section><section className="crm-card timeline-card"><div className="crm-card-head"><span className="section-kicker">04 · ACTIVITY</span><h2>客户时间轴</h2></div><div className="customer-timeline">{(customer.timeline ?? []).map((item, index) => <div key={`${item.date}-${item.event}-${index}`}><time>{item.date}</time><i className={index === (customer.timeline?.length ?? 0) - 1 ? 'current' : ''} /><div><b>{item.event}</b>{item.detail && <small>{item.detail}</small>}</div></div>)}</div></section></div><div className="next-actions"><b>下一步行动</b><button onClick={() => onAction('已创建跟进任务')}>立即跟进</button><button onClick={() => onAction('提醒已设置')}>设置提醒</button><button onClick={() => onAction('资料发送任务已创建')}>发送资料</button><button onClick={() => onAction('寄样任务已创建')}>寄样</button><button onClick={() => onAction('报价草稿已创建')}>创建报价</button><button onClick={() => onAction('订单草稿已创建')}>创建订单</button></div></div>
}

function CrmField({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><b>{value}</b></div> }

function CustomerForm({ form, updateForm, onClose, onSubmit }: { form: Record<string, string>; updateForm: (key: string, value: string) => void; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) { const fields: [string, string, string][] = [['company', '公司名称', '请输入公司名称'], ['contact', '联系人', '如：李女士'], ['title', '职位', '如：采购经理'], ['phone', '手机号', '请输入手机号'], ['wechat', '微信', '请输入微信号'], ['email', '邮箱', '请输入邮箱'], ['region', '地区', '如：上海市'], ['source', '客户来源', '如：行业展会'], ['business', '主营业务', '请输入主营业务'], ['products', '关注产品', '如：阿甘油、仙人掌籽油'], ['scale', '采购规模', '如：20-50 KG'], ['cycle', '采购周期', '如：每季度']]; return <div className="modal-backdrop"><form className="customer-form" onSubmit={onSubmit}><div className="form-head"><div><span className="section-kicker">NEW CUSTOMER</span><h2>新增客户</h2><p>建立一份完整的客户档案。</p></div><button type="button" onClick={onClose}>×</button></div><div className="form-body"><div className="form-grid">{fields.map(([key, label, placeholder]) => <label className="form-field" key={key}><span>{label}{(key === 'company' || key === 'contact') && <i>*</i>}</span><input required={key === 'company' || key === 'contact'} value={form[key]} onChange={(event) => updateForm(key, event.target.value)} placeholder={placeholder} /></label>)}<label className="form-field"><span>客户类型</span><select value={form.type} onChange={(event) => updateForm('type', event.target.value)}><option>化妆品品牌</option><option>化妆品工厂</option><option>美容院</option><option>SPA</option><option>芳疗工作室</option><option>贸易商</option></select></label><label className="form-field"><span>客户标签</span><select value={form.tag} onChange={(event) => updateForm('tag', event.target.value)}>{customerTags.map((tag) => <option key={tag}>{tag}</option>)}</select></label><label className="form-field"><span>客户状态</span><select value={form.status} onChange={(event) => updateForm('status', event.target.value)}>{customerStatuses.map((status) => <option key={status}>{status}</option>)}</select></label></div><label className="form-field full-field"><span>备注</span><textarea value={form.note} onChange={(event) => updateForm('note', event.target.value)} placeholder="记录客户偏好、合作注意事项..." /></label></div><div className="form-foot"><button type="button" className="cancel-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">保存客户　→</button></div></form></div> }

function FollowForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) { const { state } = useAppStore(); return <div className="modal-backdrop"><form className="follow-form" onSubmit={onSubmit}><div className="form-head"><div><span className="section-kicker">CUSTOMER FOLLOW-UP</span><h2>新增跟进</h2><p>记录一次沟通，让客户关系持续向前。</p></div><button type="button" onClick={onClose}>×</button></div><div className="form-body"><div className="form-grid"><label className="form-field"><span>跟进日期<i>*</i></span><input name="date" type="date" defaultValue={state.settings.simulatedToday} required /></label><label className="form-field"><span>沟通方式</span><select name="method"><option>电话</option><option>微信</option><option>邮件</option><option>线下拜访</option></select></label><label className="form-field"><span>沟通内容<i>*</i></span><input name="content" required placeholder="记录本次沟通内容" /></label><label className="form-field"><span>客户需求</span><input name="need" placeholder="客户提到的需求" /></label><label className="form-field"><span>客户反馈</span><input name="feedback" placeholder="客户的反馈" /></label><label className="form-field"><span>下一步</span><input name="next" placeholder="下一步行动" /></label><label className="form-field"><span>下次跟进时间</span><input name="nextDate" type="date" /></label><label className="form-field"><span>跟进负责人</span><input name="owner" defaultValue="管理员" /></label></div></div><div className="form-foot"><button type="button" className="cancel-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">保存跟进　→</button></div></form></div> }

function InventoryManagement({ onBack }: { onBack: () => void }) {
  const { state, dispatch } = useAppStore()
  const items = mapInventoryItems(state.inventory, state.products)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('全部')
  const [transaction, setTransaction] = useState<'inbound' | 'outbound' | null>(null)
  const [selected, setSelected] = useState<InventoryItem | null>(null)
  const [safetyItem, setSafetyItem] = useState<InventoryItem | null>(null)
  const [notice, setNotice] = useState('')

  const currentStock = (item: InventoryItem) => item.inbound - item.outbound
  const isExpiring = (item: InventoryItem) => {
    if (!item.expiry) return false
    const days = Math.ceil((new Date(`${item.expiry}T00:00:00`).getTime() - new Date(`${state.settings.simulatedToday}T00:00:00`).getTime()) / 86400000)
    return days >= 0 && days <= 30
  }
  const statusFor = (item: InventoryItem) => currentStock(item) === 0 ? '缺货' : currentStock(item) < item.safety ? '低库存' : isExpiring(item) ? '临期' : '正常库存'
  const visibleItems = items.filter((item) => {
    const text = `${item.name} ${item.batch} ${item.category}`.toLowerCase()
    const matchesFilter = filter === '全部' || (filter === '临期' ? isExpiring(item) : statusFor(item) === filter)
    return text.includes(query.toLowerCase()) && matchesFilter
  })
  const totalStock = items.reduce((sum, item) => sum + currentStock(item), 0)
  const lowCount = items.filter((item) => statusFor(item) === '低库存').length
  const lowStockNames = items.filter((item) => statusFor(item) === '低库存').map((item) => item.name)
  const expiryCount = items.filter(isExpiring).length
  const showNotice = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2400) }
  const applyTransaction = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('product'))
    const amount = Number(data.get('amount')) || 0
    if (!name || amount <= 0) return
    const batch = String(data.get('batch') || '')
    const productId = state.inventory.find((item) => item.productName === name)?.productId
      ?? state.products.find((item) => item.name === name)?.id
    const productRecords = productId ? state.inventory.filter((item) => item.productId === productId) : []
    const existingBatch = productRecords.find((item) => item.batch === batch)
    const date = String(data.get('date') || '')
    if (transaction === 'inbound') {
      if (existingBatch) {
        dispatch({ type: 'STOCK_IN', payload: { inventoryId: existingBatch.id, quantity: amount, date: date || undefined } })
      } else if (productId) {
        dispatch({
          type: 'ADD_INVENTORY_BATCH',
          payload: {
            productId,
            productName: name,
            category: state.products.find((item) => item.id === productId)?.category ?? productRecords[0]?.category ?? '',
            batch,
            inbound: amount,
            inboundDate: date || state.settings.simulatedToday,
            expiry: String(data.get('expiry') || ''),
          },
        })
      }
      setTransaction(null)
      showNotice(`已入库 ${amount} KG，库存已更新`)
      return
    }
    if (transaction === 'outbound') {
      if (batch && !existingBatch) {
        showNotice(`批次 ${batch} 不存在，出库已取消`)
        return
      }
      const record = existingBatch ?? productRecords.reduce((a, b) => (b.inboundDate > a.inboundDate ? b : a), productRecords[0])
      if (!record) {
        showNotice('未找到可出库的库存')
        return
      }
      if (record.inbound - record.outbound < amount) {
        showNotice(`批次 ${record.batch} 库存不足，当前 ${record.inbound - record.outbound} KG`)
        return
      }
      dispatch({ type: 'STOCK_OUT', payload: { inventoryId: record.id, quantity: amount, date: date || undefined } })
      setTransaction(null)
      showNotice(`已出库 ${amount} KG，库存已更新`)
    }
  }
  const saveSafety = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const amount = Number(new FormData(event.currentTarget).get('safety')) || 0
    if (safetyItem) {
      const productId = state.inventory.find((item) => item.productName === safetyItem.name)?.productId
      const productRecords = productId ? state.inventory.filter((item) => item.productId === productId) : []
      const record = productRecords.reduce((a, b) => (b.inboundDate > a.inboundDate ? b : a), productRecords[0])
      if (record) dispatch({ type: 'SET_SAFETY_STOCK', payload: { inventoryId: record.id, safetyStock: amount } })
    }
    setSafetyItem(null)
    showNotice('安全库存已更新')
  }

  const selectedProductId = selected ? state.inventory.find((item) => item.productName === selected.name)?.productId : undefined
  const selectedBatches = selectedProductId ? state.inventory.filter((item) => item.productId === selectedProductId) : []

  return <div className="inventory-page">
    <div className="inventory-head"><div><button className="back-link" onClick={onBack}>← 返回工作台</button><div className="eyebrow">库存资产 · INVENTORY CONTROL</div><h1>库存管理</h1><p>掌握每一批原料的库存变化，及时补货与安排交付。</p></div><div className="inventory-head-actions"><button className="secondary-button" onClick={() => setTransaction('outbound')}>＋ 出库</button><button className="primary-button" onClick={() => setTransaction('inbound')}>＋ 入库</button></div></div>
    <div className="inventory-metrics"><div><span>库存总量</span><b>{totalStock} <small>KG</small></b><em>当前所有可用库存</em></div><div><span>库存产品数</span><b>{items.length}</b><em>已建立库存档案</em></div><div className={lowCount ? 'metric-alert' : ''}><span>低库存产品</span><b>{lowCount}</b><em>{lowCount ? '建议及时补货' : '库存状态良好'}</em></div><div className={expiryCount ? 'metric-expiry' : ''}><span>临近保质期产品</span><b>{expiryCount}</b><em>{expiryCount ? '请优先安排出库' : '暂无临期产品'}</em></div></div>
    <div className="inventory-note"><span>◉</span><div><b>{lowCount ? '有产品需要补货关注' : '库存状态整体良好'}</b><small>{lowCount ? `${lowStockNames.join('、')}当前库存低于安全库存，建议及时补充。` : '目前没有低于安全库存的产品。'}</small></div><button onClick={() => setFilter('低库存')}>查看低库存 →</button></div>
    <div className="inventory-toolbar"><label className="catalog-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索产品、批次..." /></label><div className="inventory-tabs">{inventoryFilters.map((item) => <button className={filter === item ? 'inventory-tab active' : 'inventory-tab'} key={item} onClick={() => setFilter(item)}>{item}{item === '低库存' && lowCount > 0 && <small>{lowCount}</small>}</button>)}</div></div>
    <div className="inventory-summary"><span>库存列表 <b>{visibleItems.length}</b></span><span>数据更新于 {state.settings.simulatedToday}</span></div>
    <div className="inventory-table"><div className="inventory-table-head"><span>产品信息</span><span>分类</span><span>当前库存</span><span>安全库存</span><span>状态</span><span>最近入 / 出库</span><span>操作</span></div>{visibleItems.length ? visibleItems.map((item) => { const stock = currentStock(item); const status = statusFor(item); return <article className="inventory-row" key={item.name}><div className="inventory-product"><div className={`product-thumb ${item.tone}`}>✦</div><div><b>{item.name}</b><small>批次 · {item.batch}</small></div></div><span className="inventory-category">{item.category}</span><span className={`inventory-stock ${stock < item.safety ? 'low-number' : ''}`}><b>{stock}</b> KG</span><span className="safety-stock">{item.safety} KG</span><span className={`inventory-status status-${status === '正常库存' ? 'good' : status === '临期' ? 'expiry' : 'low'}`}><i />{status}</span><div className="inventory-dates"><span>入 {item.inboundDate}</span><span>出 {item.outboundDate}</span></div><div className="inventory-actions"><button onClick={() => setSelected(item)}>批次详情</button><button onClick={() => setSafetyItem(item)}>设安全库存</button></div></article> }) : <div className="empty-catalog"><span>⌕</span><b>没有找到匹配的库存</b><small>试试其他产品名称或批次号</small></div>}</div>
    <div className="inventory-footer">显示 1 - {visibleItems.length} 条，共 {visibleItems.length} 条</div>
    {selected && <BatchDetail item={selected} batches={selectedBatches} stock={currentStock(selected)} onClose={() => setSelected(null)} />}
    {transaction && <InventoryForm type={transaction} onClose={() => setTransaction(null)} onSubmit={applyTransaction} />}
    {safetyItem && <SafetyForm item={safetyItem} onClose={() => setSafetyItem(null)} onSubmit={saveSafety} />}
    {notice && <div className="toast">✓ {notice}</div>}
  </div>
}

function InventoryForm({ type, onClose, onSubmit }: { type: 'inbound' | 'outbound'; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  const { state } = useAppStore()
  const inbound = type === 'inbound'
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="inventory-form" onSubmit={onSubmit}><div className="form-head"><div><span className="section-kicker">{inbound ? 'STOCK IN' : 'STOCK OUT'}</span><h2>{inbound ? '产品入库' : '产品出库'}</h2><p>{inbound ? '记录一笔新的原料入库，库存将自动增加。' : '记录一笔原料出库，库存将自动扣减。'}</p></div><button type="button" onClick={onClose}>×</button></div><div className="form-body"><div className="form-grid"><label className="form-field"><span>产品<i>*</i></span><select name="product" required>{(state.products.length ? state.products : inventoryData).map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label className="form-field"><span>{inbound ? '批次号' : '批次'}<i>*</i></span><input name="batch" defaultValue={inbound ? 'ARG20260823' : 'ARG20260801'} required /></label><label className="form-field"><span>{inbound ? '入库数量' : '出库数量'}<i>*</i></span><input name="amount" type="number" min="0.01" step="0.01" placeholder="请输入数量" required /></label>{inbound && <label className="form-field"><span>单位</span><select name="unit"><option>KG</option><option>ML</option><option>桶</option></select></label>}<label className="form-field"><span>{inbound ? '入库日期' : '出库日期'}</span><input name="date" type="date" defaultValue={state.settings.simulatedToday} /></label><label className="form-field"><span>{inbound ? '供应商' : '客户'}</span><input name="partner" placeholder={inbound ? '请输入供应商名称' : '请输入客户名称'} /></label>{inbound && <label className="form-field"><span>采购成本</span><input name="cost" placeholder="如：680 / KG" /> </label>}{!inbound && <label className="form-field"><span>订单号</span><input name="order" placeholder="如：SO20260823" /></label>}{inbound && <label className="form-field"><span>保质期</span><input name="expiry" type="date" /></label>}</div><label className="form-field full-field"><span>备注</span><textarea name="note" placeholder="补充本次业务的信息..." /></label></div><div className="form-foot"><button type="button" className="cancel-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">确认{inbound ? '入库' : '出库'}　→</button></div></form></div>
}

function SafetyForm({ item, onClose, onSubmit }: { item: InventoryItem; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) { return <div className="modal-backdrop"><form className="small-form" onSubmit={onSubmit}><div className="form-head"><div><span className="section-kicker">SAFETY STOCK</span><h2>设置安全库存</h2><p>{item.name} · 当前库存 {item.inbound - item.outbound} KG</p></div><button type="button" onClick={onClose}>×</button></div><div className="form-body"><label className="form-field"><span>安全库存数量（KG）<i>*</i></span><input name="safety" type="number" min="0" defaultValue={item.safety} required /></label></div><div className="form-foot"><button type="button" className="cancel-button" onClick={onClose}>取消</button><button type="submit" className="primary-button">保存设置　→</button></div></form></div> }

function BatchDetail({ item, batches, stock, onClose }: { item: InventoryItem; batches: StoreInventoryRecord[]; stock: number; onClose: () => void }) {
  const { state } = useAppStore()
  const batchStock = (record: StoreInventoryRecord) => record.inbound - record.outbound
  const batchExpiring = (record: StoreInventoryRecord) => {
    if (!record.expiry) return false
    const days = Math.ceil((new Date(`${record.expiry}T00:00:00`).getTime() - new Date(`${state.settings.simulatedToday}T00:00:00`).getTime()) / 86400000)
    return days >= 0 && days <= 30
  }
  const batchStatus = (record: StoreInventoryRecord) => {
    const current = batchStock(record)
    if (current === 0) return '缺货'
    if (current < record.safetyStock) return '低库存'
    if (batchExpiring(record)) return '临期'
    return '正常库存'
  }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="batch-detail"><div className="form-head"><div><span className="section-kicker">BATCH RECORDS</span><h2>{item.name}</h2><p>{item.category} · 总库存 {stock} KG · 共 {batches.length} 个批次</p></div><button onClick={onClose}>×</button></div>{batches.map((record) => { const current = batchStock(record); const status = batchStatus(record); return <div key={record.id}><div className="batch-numbers"><div><span>批次号</span><b>{record.batch}</b></div><div><span>当前库存</span><b className={current < record.safetyStock ? 'warning-number' : ''}>{current} <small>KG</small></b></div><div><span>状态</span><b>{status}</b></div></div><div className="batch-detail-list"><p><span>入库数量</span><b>{record.inbound} KG</b></p><p><span>已出库</span><b>{record.outbound} KG</b></p><p><span>入库日期</span><b>{record.inboundDate}</b></p><p><span>最近出库</span><b>{record.outboundDate || '—'}</b></p><p><span>到期日期</span><b>{record.expiry || '—'}</b></p><p><span>安全库存</span><b>{record.safetyStock} KG</b></p></div></div> })}<button className="primary-button batch-close" onClick={onClose}>完成　✓</button></section></div>
}

function ProductCenter({ onBack }: { onBack: () => void }) {
  const { state, dispatch } = useAppStore()
  const products = state.products
  const productsWithStock = selectProductsWithStock(state)
  const [category, setCategory] = useState('全部')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ name: '', en: '', inci: '', category: '精油', source: '', part: '', method: '', origin: '', spec: '', moq: '', safety: '', note: '' })

  const filteredProducts = products.filter((product) => {
    const matchesCategory = category === '全部' || product.category === category
    const text = `${product.name} ${product.en} ${product.inci} ${product.origin}`.toLowerCase()
    return matchesCategory && text.includes(query.toLowerCase())
  })
  const updateForm = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }))
  const saveProduct = (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name || !form.en) return
    const product = { name: form.name, en: form.en, inci: form.inci || form.en, category: form.category, source: form.source || '待补充', part: form.part || '待补充', method: form.method || '待补充', origin: form.origin || '待补充', spec: form.spec || '待补充', moq: form.moq || '待补充', safety: form.safety || '0 KG', stock: 0, batch: '待生成', price: 0, tone: 'sage' }
    if (editingId) dispatch({ type: 'UPDATE_PRODUCT', payload: { id: editingId, changes: product } })
    else dispatch({ type: 'ADD_PRODUCT', payload: { ...product, id: `product-${Date.now()}` } })
    setShowForm(false)
    setEditingId(null)
    setSaved(true)
    setForm({ name: '', en: '', inci: '', category: '精油', source: '', part: '', method: '', origin: '', spec: '', moq: '', safety: '', note: '' })
    window.setTimeout(() => setSaved(false), 2400)
  }

  const selected = products.find((product) => product.id === selectedId)
  if (selected) return <ProductDetail product={selected} currentStock={productsWithStock.find((p) => p.id === selected.id)?.currentStock ?? 0} onBack={() => setSelectedId(null)} onEdit={() => { setEditingId(selected.id); setForm({ name: selected.name, en: selected.en, inci: selected.inci, category: selected.category, source: selected.source, part: selected.part, method: selected.method, origin: selected.origin, spec: selected.spec, moq: selected.moq, safety: selected.safety, note: '' }); setShowForm(true) }} onDelete={() => { if (window.confirm('确定删除该产品吗？')) { dispatch({ type: 'DELETE_PRODUCT', payload: { id: selected.id } }); setSelectedId(null) } }} />

  return <div className="product-page">
    <div className="product-page-head"><div><button className="back-link" onClick={onBack}>← 返回工作台</button><div className="eyebrow">产品资产 · PRODUCT CATALOG</div><h1>产品中心</h1><p>统一管理原料信息、库存状态与商业资料。</p></div><button className="primary-button" onClick={() => { setEditingId(null); setForm({ name: '', en: '', inci: '', category: '精油', source: '', part: '', method: '', origin: '', spec: '', moq: '', safety: '', note: '' }); setShowForm(true) }}>＋ 新增产品</button></div>
    <div className="product-toolbar"><label className="catalog-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索产品名称、INCI、产地..." /></label><div className="category-tabs">{productCategories.map((item) => <button className={category === item ? 'category-tab active' : 'category-tab'} key={item} onClick={() => setCategory(item)}>{item}{item === '全部' && <small>{products.length}</small>}</button>)}</div></div>
    <div className="catalog-summary"><span>共 <b>{filteredProducts.length}</b> 个产品</span><span className="summary-note"><i />库存状态实时同步（模拟数据）</span></div>
    <div className="catalog-table"><div className="catalog-table-head"><span>产品信息</span><span>分类</span><span>产地</span><span>库存</span><span>库存状态</span><span>操作</span></div>{filteredProducts.length ? filteredProducts.map((product) => { const stock = productsWithStock.find((p) => p.id === product.id)?.currentStock ?? 0; return <article className="catalog-row" key={product.id}><div className="catalog-product"><div className={`product-thumb ${product.tone}`}><span>{product.category === '天然泥粉' ? '◈' : '✦'}</span></div><div><b>{product.name}</b><small>{product.en}</small><em>INCI · {product.inci}</em></div></div><span className="catalog-category">{product.category}</span><span className="catalog-origin"><i />{product.origin}</span><span className="catalog-stock"><b>{stock}</b> KG</span><span className={`stock-status ${stock <= 10 ? 'stock-low' : 'stock-good'}`}><i />{stock <= 10 ? '库存不足' : '库存充足'}</span><div className="catalog-actions"><button onClick={() => setSelectedId(product.id)}>查看详情 <span>→</span></button><button onClick={() => onBack()}>创建报价</button></div></article>}) : <div className="empty-catalog"><span>⌕</span><b>没有找到匹配的产品</b><small>试试其他名称、INCI 或产地关键词</small></div>}</div>
    <div className="catalog-footer"><span>显示 1 - {filteredProducts.length} 条，共 {filteredProducts.length} 条</span><div><button disabled>‹</button><button className="page-current">1</button><button disabled>›</button></div></div>
    {saved && <div className="toast">✓ 产品已添加到产品中心</div>}
    {showForm && <ProductForm form={form} updateForm={updateForm} onClose={() => setShowForm(false)} onSubmit={saveProduct} />}
  </div>
}

function AICollectionCenter({ onBack }: { onBack: () => void }) {
  const { state, dispatch } = useAppStore()
  const [keyword, setKeyword] = useState('')
  const [company, setCompany] = useState('')
  const [urlInput, setUrlInput] = useState('')
  const [researching, setResearching] = useState(false)
  const [researchError, setResearchError] = useState('')
  const [researchContext, setResearchContext] = useState<UrlResearchResult | null>(null)
  const today = state.settings.simulatedToday
  const createProductDraft = () => {
    if (!keyword.trim()) return
    dispatch({ type: 'ADD_PRODUCT_DRAFT', payload: generateProductDraft(keyword.trim(), today) })
    setKeyword('')
  }
  const createLeadCandidate = () => {
    if (!company.trim()) return
    dispatch({ type: 'ADD_LEAD_CANDIDATE', payload: generateLeadCandidate(company.trim(), today) })
    setCompany('')
  }
  const researchUrl = async () => {
    if (!urlInput.trim()) return
    setResearching(true)
    setResearchError('')
    try {
      const result = await researchProductUrl(urlInput.trim())
      setResearchContext(result)
      setUrlInput('')
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : '抓取失败')
    } finally {
      setResearching(false)
    }
  }
  const aiStructureCurrent = async () => {
    if (!researchContext) return
    setResearching(true)
    setResearchError('')
    try {
      const result = await aiStructureProduct(researchContext.sourceUrl, researchContext.content, { name: researchContext.name, inci: researchContext.inci, cas: researchContext.cas, origin: researchContext.origin })
      if (!result.success) {
        setResearchError(result.error === 'AI_STRUCTURING_FAILED' ? 'AI 结构化失败，可重试或直接保存原始候选。' : result.error || 'AI 结构化失败')
        return
      }
      if (result.draft) {
        dispatch({ type: 'ADD_PRODUCT_DRAFT', payload: { id: result.draft.id, name: result.draft.name, en: result.draft.en, inci: result.draft.inci, category: result.draft.category, source: result.draft.source, origin: result.draft.origin, spec: result.draft.spec, description: `来源：${result.draft.sourceUrl}\n${result.draft.description}`, tags: result.draft.tags, cas: result.draft.cas, aiSource: 'url', verified: false, createdAt: researchContext.createdAt, updatedAt: researchContext.createdAt } })
        setResearchContext(null)
      }
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : 'AI 结构化失败')
    } finally {
      setResearching(false)
    }
  }
  const saveRawCurrent = () => {
    if (!researchContext) return
    dispatch({ type: 'ADD_PRODUCT_DRAFT', payload: { id: researchContext.id, name: researchContext.name, en: researchContext.en, inci: researchContext.inci, category: '', source: researchContext.source, origin: researchContext.origin, spec: researchContext.spec, description: researchContext.description, tags: researchContext.tags, cas: researchContext.cas, aiSource: 'url', verified: false, createdAt: researchContext.createdAt, updatedAt: researchContext.createdAt } })
    setResearchContext(null)
  }
  const confirmProduct = (draft: StoreProductDraft) => {
    const duplicate = state.products.some((product) => product.name === draft.name || (draft.inci && product.inci === draft.inci) || (draft.cas && product.cas === draft.cas))
    if (duplicate) { alert(`产品「${draft.name}」可能已存在，请人工核对后处理。`); return }
    dispatch({ type: 'ADD_PRODUCT', payload: { id: `product-${draft.id}`, name: draft.name, en: draft.en || '', inci: draft.inci || draft.en || '', category: draft.category || '精油', source: draft.source || '待补充', part: '', method: '', origin: draft.origin || '待补充', spec: draft.spec || '待补充', moq: '待补充', safety: '0 KG', stock: 0, batch: '待生成', price: 0, tone: 'sage', description: draft.description, tags: draft.tags, cas: draft.cas, aiSource: draft.aiSource, verified: draft.verified } })
    dispatch({ type: 'REMOVE_PRODUCT_DRAFT', payload: { id: draft.id } })
  }
  const confirmLead = (lead: StoreLeadCandidate) => {
    const duplicate = state.customers.some((customer) => customer.company === lead.company || (lead.website && customer.website === lead.website))
    if (duplicate) { alert(`客户「${lead.company}」可能已存在，请人工核对后处理。`); return }
    dispatch({ type: 'ADD_CUSTOMER', payload: { id: `customer-${lead.id}`, company: lead.company, contact: '', phone: '', type: lead.customerType || '待确认', source: lead.source, products: lead.needs || '', status: '待跟进', tag: 'AI线索', lastContact: today, amount: 0, email: '', leadSource: lead.source, intentScore: lead.intentScore, industry: lead.industry, website: lead.website, needs: lead.needs } })
    dispatch({ type: 'REMOVE_LEAD_CANDIDATE', payload: { id: lead.id } })
  }
  return <div className="product-page">
    <div className="product-page-head"><div><button className="back-link" onClick={onBack}>← 返回工作台</button><div className="eyebrow">AI 采集 · CANDIDATE COLLECTION</div><h1>AI 采集中心</h1><p>关键词/线索生成候选资料，确认后写入正式数据。</p></div></div>
    <div className="inventory-note"><span>◉</span><div><b>候选资料，需人工确认</b><small>所有模板/生成内容均为候选，不自动覆盖已有产品与客户。</small></div></div>
    <div className="product-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <label className="catalog-search"><span>⌕</span><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="输入产品关键词，如：摩洛哥阿甘油" /></label>
      <button className="primary-button" onClick={createProductDraft}>生成产品候选</button>
      <label className="catalog-search"><span>⌕</span><input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="输入公司名称，如：XXX化妆品有限公司" /></label>
      <button className="secondary-button" onClick={createLeadCandidate}>生成客户线索</button>
      <label className="catalog-search"><span>↗</span><input value={urlInput} onChange={(event) => setUrlInput(event.target.value)} placeholder="输入公开产品 URL，如：https://example.com/product/xxx" /></label>
      <button className="secondary-button" onClick={researchUrl} disabled={researching}>{researching ? '抓取中…' : 'URL 采集'}</button>
    </div>
    {researchError && <div className="stock-warning">! {researchError}</div>}
    {researchContext && <div className="catalog-summary"><span>已获取候选：<b>{researchContext.name}</b></span><span>来源：{researchContext.sourceUrl}</span></div>}
    {researchContext && <div className="catalog-table"><div className="catalog-row"><div className="catalog-product"><b>{researchContext.name}</b><small>AI 整理结果｜候选资料，需人工确认</small></div><span className="catalog-origin">{researchContext.sourceExcerpt}</span><span className="stock-status"><i />待确认</span><div className="catalog-actions"><button onClick={aiStructureCurrent} disabled={researching}>AI 结构化 <span>→</span></button><button onClick={saveRawCurrent}>直接保存原始候选</button></div></div></div>}
    <div className="catalog-summary"><span>产品候选 <b>{state.productDrafts.length}</b></span><span>客户线索候选 <b>{state.leadCandidates.length}</b></span></div>
    <div className="catalog-table">
      <div className="catalog-table-head"><span>类型</span><span>名称</span><span>候选内容</span><span>状态</span><span>操作</span></div>
      {state.productDrafts.map((draft) => <article className="catalog-row" key={draft.id}><span className="catalog-category">产品</span><div className="catalog-product"><b>{draft.name}</b><small>INCI: {draft.inci || '待确认'} · CAS: {draft.cas || '待确认'} · 来源: {draft.aiSource}</small></div><span className="catalog-origin">{draft.description || '—'}</span><span className="stock-status"><i />待确认</span><div className="catalog-actions"><button onClick={() => confirmProduct(draft)}>确认并创建产品 <span>→</span></button><button onClick={() => dispatch({ type: 'REMOVE_PRODUCT_DRAFT', payload: { id: draft.id } })}>删除</button></div></article>)}
      {state.leadCandidates.map((lead) => <article className="catalog-row" key={lead.id}><span className="catalog-category">客户</span><div className="catalog-product"><b>{lead.company}</b><small>行业: {lead.industry || '待确认'} · 官网: {lead.website || '待确认'} · 评分: {lead.intentScore ?? 0}</small></div><span className="catalog-origin">{lead.needs || '需求待确认'}</span><span className="stock-status"><i />待确认</span><div className="catalog-actions"><button onClick={() => confirmLead(lead)}>确认并导入客户 <span>→</span></button><button onClick={() => dispatch({ type: 'REMOVE_LEAD_CANDIDATE', payload: { id: lead.id } })}>删除</button></div></article>)}
      {state.productDrafts.length === 0 && state.leadCandidates.length === 0 && <div className="empty-catalog"><span>⌕</span><b>暂无候选</b><small>输入关键词或公司名称生成候选资料。</small></div>}
    </div>
  </div>
}

function ProductDetail({ product, currentStock, onBack, onEdit, onDelete }: { product: Product; currentStock: number; onBack: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className="product-page detail-page"><button className="back-link" onClick={onBack}>← 返回产品中心</button><div className="detail-hero"><div className={`detail-mark ${product.tone}`}>✦</div><div><div className="eyebrow">产品档案 · {product.batch}</div><h1>{product.name}</h1><p>{product.en}</p><div className="detail-tags"><span>{product.category}</span><span>Morocco</span><span className="stock-pill"><i />{currentStock <= 10 ? '库存不足' : '库存充足'}</span></div></div><div className="detail-actions"><button className="secondary-button" onClick={onEdit}>编辑产品</button><button className="danger-text" onClick={onDelete}>删除产品</button><button className="primary-button detail-quote">创建报价　→</button></div></div><div className="detail-grid"><section className="detail-card"><div className="detail-card-head"><span className="section-kicker">01 · PRODUCT</span><h2>基础资料</h2></div><div className="detail-fields"><DetailField label="中文名称" value={product.name} /><DetailField label="英文名称" value={product.en} /><DetailField label="INCI" value={product.inci} /><DetailField label="产品分类" value={product.category} /><DetailField label="产地" value={product.origin} /><DetailField label="植物来源" value={product.source} /><DetailField label="植物部位" value={product.part} /><DetailField label="萃取方式" value={product.method} /></div></section><section className="detail-card"><div className="detail-card-head"><span className="section-kicker">02 · INVENTORY</span><h2>库存信息</h2></div><div className="inventory-hero"><b>{currentStock}</b><span>KG 当前可用库存</span><em className={currentStock <= 10 ? 'warning' : ''}>{currentStock <= 10 ? '低于安全库存' : '库存状态良好'}</em></div><div className="detail-fields compact"><DetailField label="安全库存" value={`${product.safety}`} /><DetailField label="库存单位" value="KG" /><DetailField label="最近入库" value="2024-08-02" /><DetailField label="库位" value="A-02-08" /></div></section><section className="detail-card"><div className="detail-card-head"><span className="section-kicker">03 · BATCH</span><h2>批次信息</h2></div><div className="batch-line"><span>当前批次</span><b>{product.batch}</b><small>已检验</small></div><div className="detail-fields compact"><DetailField label="生产日期" value="2024-07-16" /><DetailField label="保质期至" value="2026-07-15" /><DetailField label="检测报告" value="COA-240716.pdf" /></div></section><section className="detail-card"><div className="detail-card-head"><span className="section-kicker">04 · BUSINESS</span><h2>商业信息</h2></div><div className="detail-fields compact"><DetailField label="参考报价" value={product.price ? `¥ ${product.price} / KG` : '待询价'} /><DetailField label="最小起订量 MOQ" value={product.moq} /><DetailField label="规格" value={product.spec} /><DetailField label="付款方式" value="T/T 预付" /></div></section><section className="detail-card wide"><div className="detail-card-head"><span className="section-kicker">05 · TECHNICAL</span><h2>技术资料</h2></div><div className="document-list"><button>▤　COA 检测报告 <span>PDF　↗</span></button><button>▤　MSDS 安全数据表 <span>PDF　↗</span></button><button>▤　产品规格书 <span>PDF　↗</span></button></div></section><section className="detail-card wide"><div className="detail-card-head"><span className="section-kicker">06 · CUSTOMERS</span><h2>客户信息</h2></div><div className="customer-links"><div><b>12</b><span>历史询价客户</span></div><div><b>4</b><span>已成交客户</span></div><div><b>3</b><span>正在跟进</span></div><button>查看相关客户　→</button></div></section></div></div>
}

function DetailField({ label, value }: { label: string; value: string }) { return <div><small>{label}</small><b>{value}</b></div> }

function ProductForm({ form, updateForm, onClose, onSubmit }: { form: Record<string, string>; updateForm: (key: string, value: string) => void; onClose: () => void; onSubmit: (event: React.FormEvent) => void }) {
  const fields: [string, string, string][] = [['name', '中文名称', '请输入产品中文名称'], ['en', '英文名称', '请输入英文名称'], ['inci', 'INCI', '请输入 INCI 名称'], ['source', '植物来源', '如：阿甘树'], ['part', '植物部位', '如：果仁、花朵'], ['method', '萃取方式', '如：冷压萃取'], ['origin', '产地', '如：Morocco'], ['spec', '规格', '如：1 KG / 25 KG'], ['moq', 'MOQ', '如：25 KG'], ['safety', '安全库存', '如：20 KG']]
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="product-form" onSubmit={onSubmit}><div className="form-head"><div><span className="section-kicker">NEW PRODUCT</span><h2>新增产品</h2><p>建立一份完整的产品档案。</p></div><button type="button" onClick={onClose}>×</button></div><div className="form-body"><div className="form-grid">{fields.slice(0, 3).map(([key, label, placeholder]) => <label className="form-field" key={key}><span>{label}<i>*</i></span><input required={key === 'name' || key === 'en'} value={form[key]} onChange={(event) => updateForm(key, event.target.value)} placeholder={placeholder} /></label>)}<label className="form-field"><span>产品分类<i>*</i></span><select value={form.category} onChange={(event) => updateForm('category', event.target.value)}>{productCategories.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label>{fields.slice(3).map(([key, label, placeholder]) => <label className="form-field" key={key}><span>{label}</span><input value={form[key]} onChange={(event) => updateForm(key, event.target.value)} placeholder={placeholder} /></label>)}</div><label className="form-field full-field"><span>备注</span><textarea value={form.note} onChange={(event) => updateForm('note', event.target.value)} placeholder="补充产品特性、储存条件或其他信息..." /></label></div><div className="form-foot"><button type="button" className="cancel-button" onClick={onClose}>取消</button><button className="primary-button" type="submit">保存产品　→</button></div></form></div>
}

function FollowUp({ onBack }: { onBack: () => void }) {
  const { state } = useAppStore()
  const followUps = state.followUps
  const pendingCount = selectPendingTasks(state).followUps.length
  return <div className="crm-page"><div className="crm-head"><div><button className="back-link" onClick={onBack}>← 返回工作台</button><div className="eyebrow">客户跟进 · CUSTOMER FOLLOW-UP</div><h1>客户跟进</h1><p>统一查看跟进任务与跟进记录。</p></div></div><div className="crm-metrics"><div><span>待跟进任务</span><b>{pendingCount}</b><em>需要处理</em></div><div><span>全部记录</span><b>{followUps.length}</b><em>历史跟进</em></div></div><div className="crm-summary"><span>跟进列表 <b>{followUps.length}</b></span></div>{followUps.length ? followUps.map((followUp) => { const customer = state.customers.find((c) => c.id === followUp.customerId); return <div className="crm-card" key={followUp.id} style={{ marginBottom: 12 }}><div className="crm-card-head"><span className="section-kicker">{followUp.date}</span><h2>{customer?.company ?? followUp.customerId}</h2></div><div className="crm-fields"><CrmField label="沟通方式" value={followUp.method} /><CrmField label="跟进状态" value={followUp.status} /><CrmField label="沟通内容" value={followUp.content} /><CrmField label="下次跟进" value={followUp.nextDate || '—'} /><CrmField label="负责人" value={followUp.owner} /></div></div> }) : <div className="empty-catalog"><span>⌕</span><b>暂无跟进记录</b><small>可先在客户 CRM 中创建跟进。</small></div>}</div>
}

function Settings({ onBack }: { onBack: () => void }) {
  const { state } = useAppStore()
  const { simulatedToday, currency, defaultUnit } = state.settings
  return <div className="crm-page"><div className="crm-head"><div><button className="back-link" onClick={onBack}>← 返回工作台</button><div className="eyebrow">系统设置 · SYSTEM SETTINGS</div><h1>系统设置</h1><p>查看当前系统参数。</p></div></div><div className="crm-card"><div className="crm-card-head"><span className="section-kicker">01 · GENERAL</span><h2>基础设置</h2></div><div className="crm-fields"><CrmField label="模拟日期" value={simulatedToday} /><CrmField label="货币" value={currency} /><CrmField label="默认单位" value={defaultUnit} /></div></div></div>
}

function App() {
  const { state } = useAppStore()
  const products = state.products
  const productsWithStock = selectProductsWithStock(state)
  const lowStockCount = selectLowStockProducts(state).length
  const newCustomers = selectNewCustomers(state)
  const pendingCustomers = state.customers.filter((customer) => customer.status === '待跟进').length
  const highIntentCustomers = selectHighIntentCustomers(state).length
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const todayDate = state.settings.simulatedToday
  const todayParts = todayDate.split('-')
  const todayWeekday = weekdays[new Date(`${todayDate}T00:00:00`).getDay()]
  const monthlyKey = state.settings.simulatedToday.slice(0, 7)
  const monthlyClosedCustomers = new Set(state.orders.filter((order) => order.status === '已完成' && order.orderDate.slice(0, 7) === monthlyKey).map((order) => order.customerId)).size
  const soldByProduct = new Map<string, number>()
  for (const order of state.orders) {
    if (order.status !== '已完成') continue
    soldByProduct.set(order.productId, (soldByProduct.get(order.productId) ?? 0) + order.quantity)
  }
  const quotesByProduct = new Map<string, number>()
  for (const quote of state.quotes) {
    quotesByProduct.set(quote.productId, (quotesByProduct.get(quote.productId) ?? 0) + 1)
  }
  const monthlyOrders = state.orders.filter((order) => order.orderDate.slice(0, 7) === monthlyKey).length
  const monthlySales = selectMonthlySales(state)
  const dailySales = selectDailySales(state, 7)
  const salesTrendTotal = dailySales.reduce((sum, item) => sum + item.amount, 0)
  const salesMax = Math.max(...dailySales.map((item) => item.amount), 1)
  const salesPoints = dailySales.map((item, index) => { const x = 10 + (index / (dailySales.length - 1 || 1)) * 480; const y = 160 - (item.amount / salesMax) * 130; return { x, y } })
  const salesLinePath = `M ${salesPoints.map((point) => `${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' L ')}`
  const salesAreaPath = `${salesLinePath} L ${salesPoints[salesPoints.length - 1].x.toFixed(1)} 170 L 10 170 Z`
  const pendingTasks = selectPendingTasks(state)
  const expiringTasks = selectExpiringProducts(state)
  const pendingPayments = selectPendingPayments(state).filter((order) => order.status !== '已取消')
  const pendingShipments = selectPendingShipments(state)
  const todoCount = pendingTasks.lowStock.length + expiringTasks.length + pendingPayments.length + pendingShipments.length + pendingTasks.samples.length + pendingTasks.quotes.length + pendingTasks.followUps.length
  const todoCards: { key: string; priority: string; icon: string; statusText: string; time: string; title: string; desc: string; small: string; action: string; target: string }[] = []
  pendingTasks.lowStock.forEach((item) => todoCards.push({ key: `low-${item.id}`, priority: 'low', icon: '↘', statusText: '库存提醒', time: '需要关注', title: item.productName, desc: `当前库存：${item.inbound - item.outbound} KG · 安全库存：${item.safetyStock} KG`, small: '建议及时补充库存。', action: '查看库存', target: '库存管理' }))
  expiringTasks.forEach((item) => todoCards.push({ key: `exp-${item.id}`, priority: 'low', icon: '⏳', statusText: '临期提醒', time: '需要关注', title: item.productName, desc: `批次 ${item.batch} · ${item.expiry} 到期`, small: '建议优先安排出库。', action: '查看库存', target: '库存管理' }))
  pendingPayments.forEach((order) => todoCards.push({ key: `pay-${order.id}`, priority: 'medium', icon: '¥', statusText: '待付款', time: '需要关注', title: order.customer, desc: `订单 ${order.id} · 待付款 ${money(order.quantity * order.price + order.freight + order.tax)}`, small: '等待客户付款。', action: '查看订单', target: '订单管理' }))
  pendingShipments.forEach((order) => todoCards.push({ key: `ship-${order.id}`, priority: 'medium', icon: '↗', statusText: '待发货', time: '安排物流', title: order.customer, desc: `订单 ${order.id} · 已发 ${order.shipped} / ${order.quantity} KG`, small: '请安排发货。', action: '查看订单', target: '订单管理' }))
  pendingTasks.samples.forEach((sample) => todoCards.push({ key: `sample-${sample.id}`, priority: 'medium', icon: '◌', statusText: '样品待反馈', time: '需要关注', title: sample.customer, desc: `样品 ${sample.product} · ${sample.status}`, small: '等待客户反馈。', action: '查看样品', target: '样品管理' }))
  pendingTasks.quotes.forEach((quote) => todoCards.push({ key: `quote-${quote.id}`, priority: 'medium', icon: '✦', statusText: '报价待确认', time: '需要关注', title: quote.customer, desc: `报价 ${quote.id} · 待确认`, small: '建议跟进报价。', action: '查看报价', target: '报价管理' }))
  pendingTasks.followUps.forEach((followUp) => { const customerName = state.customers.find((c) => c.id === followUp.customerId)?.company ?? followUp.customerId; todoCards.push({ key: `follow-${followUp.id}`, priority: 'high', icon: '↗', statusText: '客户跟进', time: '建议处理', title: customerName, desc: followUp.content, small: '建议今天跟进。', action: '立即跟进', target: '客户跟进' }) })
  const [activeNav, setActiveNav] = useState('工作台')
  const [showCreate, setShowCreate] = useState(false)
  const [showAssistant, setShowAssistant] = useState(false)
  const [assistantInput, setAssistantInput] = useState('')
  const [search, setSearch] = useState('')

  const handleNav = (label: string) => {
    setActiveNav(label)
    if (label === 'AI 助手') setShowAssistant(false)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">◎</span><span>精油行业<br /><strong>智能工作台</strong></span></div>
        <div className="workspace-label">主菜单</div>
        <nav>{navItems.map(([icon, label]) => <button className={activeNav === label ? 'nav-item active' : 'nav-item'} key={label} onClick={() => handleNav(label)}><span>{icon}</span>{label}{label === '客户跟进' && <i />}</button>)}</nav>
        <div className="sidebar-bottom"><div className="help-box"><span>?</span><div><b>需要帮助？</b><small>查看工作台指南</small></div></div><div className="profile-mini"><span className="avatar">管</span><div><b>管理员</b><small>超级管理员</small></div><span>•••</span></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setActiveNav('工作台')}>◎ <b>精油工作台</b></button>
          <label className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索产品、客户、批次、订单..." /><kbd>⌘ K</kbd></label>
          <div className="top-actions"><button className="icon-button" aria-label="通知">♧</button><button className="icon-button" aria-label="待办">□<em>{todoCount}</em></button><div className="top-user"><span className="avatar">管</span><span>管理员</span><b>⌄</b></div></div>
        </header>

        {activeNav === 'AI 助手' ? <AiAssistant onBack={() => setActiveNav('工作台')} navigate={setActiveNav} /> : activeNav === '数据中心' ? <DataCenter onBack={() => setActiveNav('工作台')} navigate={setActiveNav} /> : activeNav === '产品资料' ? <ProductDocuments onBack={() => setActiveNav('工作台')} /> : activeNav === '配方实验室' ? <FormulaLab onBack={() => setActiveNav('工作台')} /> : activeNav === '订单管理' ? <OrderManagement onBack={() => setActiveNav('工作台')} onCustomer={() => setActiveNav('客户 CRM')} onProduct={() => setActiveNav('产品中心')} /> : activeNav === '报价管理' ? <QuoteManagement onBack={() => setActiveNav('工作台')} onCustomer={() => setActiveNav('客户 CRM')} onProduct={() => setActiveNav('产品中心')} /> : activeNav === '样品管理' ? <SampleManagement onBack={() => setActiveNav('工作台')} /> : activeNav === '客户 CRM' ? <CustomerCRM onBack={() => setActiveNav('工作台')} /> : activeNav === '库存管理' ? <InventoryManagement onBack={() => setActiveNav('工作台')} /> : activeNav === '产品中心' ? <ProductCenter onBack={() => setActiveNav('工作台')} /> : activeNav === 'AI 采集' ? <AICollectionCenter onBack={() => setActiveNav('工作台')} /> : activeNav === '客户跟进' ? <FollowUp onBack={() => setActiveNav('工作台')} /> : activeNav === '系统设置' ? <Settings onBack={() => setActiveNav('工作台')} /> : <div className="page-wrap">
          <section className="welcome-row"><div><div className="eyebrow">{todayWeekday} · {Number(todayParts[1])}月{Number(todayParts[2])}日 <span className="live-dot" /> 今日工作概览</div><h1>早上好，欢迎回来</h1><p>今天有 <strong>{todoCount}</strong> 件事情值得处理，先从最重要的开始吧。</p></div><div className="date-card"><span>今天是</span><b>{todayParts[0]}年{todayParts[1]}月{todayParts[2]}日</b><button onClick={() => setShowCreate(!showCreate)}>＋ 新建</button>{showCreate && <div className="create-menu">{quickActions.map((action) => <button key={action} onClick={() => setShowCreate(false)}>{action}<span>→</span></button>)}</div>}</div></section>

          <section className="focus-grid"><div className="section-heading"><div><span className="section-kicker">优先处理</span><h2>今日待办</h2></div><button className="text-button" onClick={() => setActiveNav('客户跟进')}>查看全部 <span>→</span></button></div><div className="task-list">{todoCards.length ? todoCards.map((card) => <article className={`task-card ${card.priority}`} key={card.key}><div className="task-icon">{card.icon}</div><div className="task-body"><div className="task-meta"><span className={`status ${card.priority}-status`}>● {card.statusText}</span><time>{card.time}</time></div><h3>{card.title}</h3><p>{card.desc}</p><small>{card.small}</small></div><button className="outline-button" onClick={() => setActiveNav(card.target)}>{card.action} <span>→</span></button></article>) : <div className="empty-catalog"><span>⌕</span><b>暂无待办</b><small>所有事项均已处理完成。</small></div>}</div></section>

          <section className="metrics"><div className="section-heading"><div><span className="section-kicker">业务快照</span><h2>核心数据</h2></div><span className="period">本月 <b>⌄</b></span></div><div className="metric-grid">{[['本月销售额', money(monthlySales), '—', '—', 'warm'], ['本月订单', String(monthlyOrders), '—', '—', 'green'], ['新增客户', String(newCustomers), '—', '—', 'blue'], ['待跟进客户', String(pendingCustomers), '需处理', '!', 'orange'], ['低库存产品', String(lowStockCount), '需关注', '!', 'red']].map(([label, value, change, arrow, tone]) => <div className="metric" key={label}><div className="metric-label"><span>{label}</span><i className={`metric-icon ${tone}`}>{arrow}</i></div><b>{value}</b><small className={arrow === '!' ? 'warning' : ''}>{arrow === '!' ? '● ' : ''}{change}</small></div>)}</div></section>

          <div className="content-grid"><section className="panel products-panel"><div className="section-heading"><div><span className="section-kicker">库存与需求</span><h2>近期重点产品</h2></div><button className="text-button" onClick={() => setActiveNav('产品中心')}>产品中心 <span>→</span></button></div><div className="product-list">{products.map((product, index) => { const sold = soldByProduct.get(product.id) ?? 0; const quotes = quotesByProduct.get(product.id) ?? 0; return <article className="product-row" key={product.name}><div className={`product-thumb ${product.tone}`}><span>{index === 0 ? '✦' : index === 1 ? '◒' : '◈'}</span></div><div className="product-name"><b>{product.name}</b><small>{product.en}</small></div><div className="product-stat"><small>库存</small><b>{productsWithStock.find((p) => p.id === product.id)?.currentStock ?? 0}</b></div><div className="product-stat"><small>本月销量</small><b>{sold} KG</b></div><div className="product-stat"><small>询价</small><b>{quotes}<span className="unit">次</span></b></div><div className="product-actions"><button aria-label="查看产品" onClick={() => setActiveNav('产品中心')}>↗</button><button aria-label="创建报价" onClick={() => setActiveNav('报价管理')}>＋</button></div></article>; })}</div></section>
            <section className="panel chart-panel"><div className="section-heading"><div><span className="section-kicker">销售表现</span><h2>销售趋势</h2></div><button className="select-button">最近7天 ⌄</button></div><div className="chart-legend"><span><i />销售额</span><b>{money(salesTrendTotal)} <small>最近7天</small></b></div><div className="chart"><div className="y-labels"><span>12k</span><span>8k</span><span>4k</span><span>0</span></div><div className="chart-area"><div className="grid-lines"><i /><i /><i /><i /></div><svg viewBox="0 0 500 170" preserveAspectRatio="none" aria-label="最近七天销售趋势图"><defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#b8c8a2" stopOpacity=".4" /><stop offset="1" stopColor="#b8c8a2" stopOpacity="0" /></linearGradient></defs><path d={salesAreaPath} fill="url(#fill)" /><path d={salesLinePath} fill="none" stroke="#6f8a59" strokeWidth="3" strokeLinecap="round" /></svg><div className="x-labels">{dailySales.map((item) => <span key={item.date}>{item.date.slice(5)}</span>)}</div></div></div></section></div>

          <div className="bottom-grid"><section className="panel customer-panel"><div className="section-heading"><div><span className="section-kicker">客户关系</span><h2>客户概况</h2></div><button className="text-button" onClick={() => setActiveNav('客户 CRM')}>客户 CRM <span>→</span></button></div><div className="customer-stats"><div><b>{newCustomers}</b><span>新增客户</span><small>—</small></div><div><b>{highIntentCustomers}</b><span>高意向客户</span><small>—</small></div><div><b>{pendingCustomers}</b><span>待跟进客户</span><small className="orange-text">需处理</small></div><div><b>{monthlyClosedCustomers}</b><span>本月成交客户</span><small>—</small></div></div></section><section className="panel activity-panel"><div className="section-heading"><div><span className="section-kicker">动态记录</span><h2>最近活动</h2></div><button className="text-button">全部动态 <span>→</span></button></div><div className="timeline"><div><time>08-23</time><i /><p><b>XX化妆品</b> 询价阿甘油</p></div><div><time>08-22</time><i /><p>寄出仙人掌籽油样品</p></div><div><time>08-21</time><i /><p>创建阿甘油报价</p></div><div><time>08-20</time><i /><p>新增客户 <b>XX美容院</b></p></div></div></section></div>
        </div>}
      </main>
      <button className="assistant-fab" onClick={() => setShowAssistant(true)}><span>✦</span><b>AI 精油助手</b><i>●</i></button>
      {showAssistant && <div className="assistant-window"><div className="assistant-head"><div><span className="ai-mark">✦</span><div><b>AI 精油助手</b><small>随时帮你整理业务</small></div></div><button onClick={() => setShowAssistant(false)}>×</button></div><div className="assistant-content"><div className="ai-greeting"><span>✦</span><p>你好，管理员。<br />今天想先处理哪一项工作？</p></div><div className="quick-questions">{['哪些客户超过15天没有跟进？', '哪些产品库存不足？', '最近哪个产品询价最多？', '帮我整理今天的工作。'].map((question) => <button key={question} onClick={() => setAssistantInput(question)}>{question}<span>→</span></button>)}</div></div><form className="assistant-input" onSubmit={(event) => event.preventDefault()}><input value={assistantInput} onChange={(event) => setAssistantInput(event.target.value)} placeholder="你可以问我：哪些客户需要跟进？" /><button aria-label="发送">↑</button></form></div>}
    </div>
  )
}

export default App
