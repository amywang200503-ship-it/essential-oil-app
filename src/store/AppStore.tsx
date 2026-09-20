import { createContext, type Dispatch, type ReactNode, useContext, useEffect, useReducer } from 'react'

/* eslint-disable react-refresh/only-export-components */

export type Product = {
  id: string
  name: string
  en: string
  inci: string
  category: string
  source: string
  part: string
  method: string
  origin: string
  spec: string
  moq: string
  safety: string
  stock: number
  batch: string
  price: number
  tone: string
  description?: string
  tags?: string
  cas?: string
  aiSource?: string
  verified?: boolean
}

export type ProductDraft = {
  id: string
  name: string
  en?: string
  inci?: string
  category?: string
  source?: string
  origin?: string
  spec?: string
  description?: string
  tags?: string
  cas?: string
  aiSource?: string
  verified: boolean
  createdAt?: string
  updatedAt?: string
}

/**
 * 库存流水事件
 * - inbound 入库
 * - outbound 出库
 * - adjust 库存调整
 * - reserve 订单预占
 * - release 订单释放
 * - sample_out 样品扣减
 * eventId / productId / batch / referenceId / note 为可选元数据字段，向后兼容现有数据
 */
export type InventoryEvent = {
  eventId?: string
  productId?: string
  batch?: string
  date: string
  type: 'inbound' | 'outbound' | 'adjust' | 'reserve' | 'release' | 'sample_out'
  quantity: number
  referenceId?: string
  note?: string
}

/**
 * 库存记录（按批次）
 * - currentStock = inbound - outbound（派生值，见 selectors.currentStock）
 * - reservedStock = reserved（预占库存）
 * - availableStock = currentStock - reserved（派生值，见 selectors.availableStock）
 * - 库存状态：正常 / 低库存（currentStock < safetyStock）/ 临期（expiry 30 天内）
 */
export type InventoryRecord = {
  id: string
  productId: string
  productName: string
  category: string
  inbound: number
  outbound: number
  reserved: number
  safetyStock: number
  batch: string
  inboundDate: string
  outboundDate: string
  expiry: string
  timeline?: InventoryEvent[]
}

export type Customer = {
  id: string
  company: string
  contact: string
  phone: string
  type: string
  source: string
  products: string
  status: string
  tag: string
  lastContact: string
  amount: number
  // CRM 展示字段（P1 接入 Store，全部可选，向后兼容旧 localStorage 数据）
  title?: string
  wechat?: string
  email?: string
  region?: string
  business?: string
  scale?: string
  cycle?: string
  grade?: string
  next?: string
  tone?: string
  timeline?: { date: string; event: string; detail?: string }[]
  createdAt?: string
  updatedAt?: string
  leadSource?: string
  intentScore?: number
  industry?: string
  website?: string
  needs?: string
}

export type LeadCandidate = {
  id: string
  company: string
  website?: string
  industry?: string
  customerType?: string
  source: string
  needs?: string
  intentScore?: number
  notes?: string
  dedupeKeys?: string[]
  createdAt?: string
  updatedAt?: string
}

export type FollowUp = {
  id: string
  customerId: string
  date: string
  method: string
  content: string
  status: string
  nextDate: string
  owner: string
}

export type Sample = {
  id: string
  customerId: string
  customer: string
  productId: string
  product: string
  batch: string
  quantity: number
  status: string
  applyDate: string
  sendDate: string
  expectedFeedback: string
  // 样品展示字段（P3 接入 Store，可选，向后兼容旧 localStorage 数据）
  contact?: string
  phone?: string
  spec?: string
  signedDate?: string
  feedbackDate?: string
  address?: string
  carrier?: string
  tracking?: string
  stock?: number
  tone?: string
  timeline?: { date: string; event: string; detail?: string }[]
  feedback?: { date: string; rating: string; trial: string; scent: string; feel: string; result: string; need: string; next: string; note: string }
}

export type Quote = {
  id: string
  customerId: string
  customer: string
  productId: string
  product: string
  quantity: number
  unit: string
  price: number
  freight: number
  tax: number
  quoteDate: string
  validUntil: string
  status: string
  // 报价展示字段（P2 接入 Store，可选，向后兼容旧 localStorage 数据）
  contact?: string
  batch?: string
  moq?: number
  payment?: string
  delivery?: string
  note?: string
  stock?: number
  tone?: string
}

export type OrderItem = {
  productId: string
  productName: string
  quantity: number
  unit: string
  price: number
  amount: number
  shippedQuantity: number
}

export type Order = {
  id: string
  orderNo?: string
  customerId: string
  status: string
  customer: string
  quoteId: string
  productId: string
  product: string
  quantity: number
  shipped: number
  unit: string
  price: number
  freight: number
  tax: number
  payment: string
  paid: number
  orderDate: string
  // 新结构字段（可选，兼容演进）
  items?: OrderItem[]
  totalAmount?: number
  paidAmount?: number
  createdAt?: string
  updatedAt?: string
  notes?: string
  // UI 展示兼容字段（可选，OrderManagement 现有展示使用）
  contact?: string
  quote?: string
  batch?: string
  delivery?: string
  expected?: string
  logistics?: string
  tracking?: string
  stock?: number
  tone?: string
  timeline?: { date: string; event: string }[]
  // 预留第八阶段第二步（库存预占）
  reservations?: { inventoryId: string; batch: string; quantity: number }[]
}

export type FormulaIngredient = {
  id: string
  productId: string
  name: string
  ratio: number
  price: number
}

export type Formula = {
  id: string
  name: string
  purpose: string
  total: number
  unit: string
  status: string
  version: string
  updated: string
  ingredients: FormulaIngredient[]
}

export type ProductDocument = {
  id: string
  name: string
  type: string
  productId: string
  product: string
  batch: string
  version: string
  publish: string
  expiry: string
  status: string
}

export type AppSettings = {
  simulatedToday: string
  currency: string
  defaultUnit: string
}

export type AppState = {
  products: Product[]
  inventory: InventoryRecord[]
  customers: Customer[]
  followUps: FollowUp[]
  samples: Sample[]
  quotes: Quote[]
  orders: Order[]
  formulas: Formula[]
  productDocuments: ProductDocument[]
  productDrafts: ProductDraft[]
  leadCandidates: LeadCandidate[]
  settings: AppSettings
}

export type AppAction =
  | { type: 'ADD_PRODUCT'; payload: Product }
  | { type: 'UPDATE_PRODUCT'; payload: { id: string; changes: Partial<Product> } }
  | { type: 'DELETE_PRODUCT'; payload: { id: string } }
  | { type: 'ADD_CUSTOMER'; payload: Customer }
  | { type: 'UPDATE_CUSTOMER'; payload: { id: string; changes: Partial<Customer> } }
  | { type: 'ADD_FOLLOW_UP'; payload: FollowUp }
  | { type: 'UPDATE_FOLLOW_UP'; payload: { id: string; changes: Partial<FollowUp> } }
  | { type: 'ADD_SAMPLE'; payload: Sample }
  | { type: 'UPDATE_SAMPLE'; payload: { id: string; changes: Partial<Sample> } }
  | { type: 'ADD_QUOTE'; payload: Quote }
  | { type: 'UPDATE_QUOTE'; payload: { id: string; changes: Partial<Quote> } }
  | { type: 'CREATE_ORDER'; payload: Order }
  | { type: 'ADD_ORDER'; payload: Order }
  | { type: 'UPDATE_ORDER'; payload: { id: string; changes: Partial<Order> } }
  | { type: 'CANCEL_ORDER'; payload: { id: string } }
  | { type: 'ADD_PRODUCT_DRAFT'; payload: ProductDraft }
  | { type: 'UPDATE_PRODUCT_DRAFT'; payload: { id: string; changes: Partial<ProductDraft> } }
  | { type: 'REMOVE_PRODUCT_DRAFT'; payload: { id: string } }
  | { type: 'ADD_LEAD_CANDIDATE'; payload: LeadCandidate }
  | { type: 'UPDATE_LEAD_CANDIDATE'; payload: { id: string; changes: Partial<LeadCandidate> } }
  | { type: 'REMOVE_LEAD_CANDIDATE'; payload: { id: string } }
  | { type: 'STOCK_IN'; payload: { inventoryId: string; quantity: number; date?: string } }
  | { type: 'STOCK_OUT'; payload: { inventoryId: string; quantity: number; date?: string } }
  | { type: 'RESERVE_STOCK'; payload: { inventoryId: string; quantity: number } }
  | { type: 'RELEASE_STOCK'; payload: { inventoryId: string; quantity: number } }
  | { type: 'ADJUST_STOCK'; payload: { inventoryId: string; quantity: number; date?: string } }
  | { type: 'SET_SAFETY_STOCK'; payload: { inventoryId: string; safetyStock: number } }
  | { type: 'ADD_INVENTORY_BATCH'; payload: { id?: string; productId: string; productName: string; category: string; batch: string; inbound: number; outbound?: number; inboundDate: string; outboundDate?: string; expiry?: string; safetyStock?: number } }
  | { type: 'UPDATE_INVENTORY_BATCH'; payload: { inventoryId: string; changes: Partial<Pick<InventoryRecord, 'productName' | 'category' | 'batch' | 'inboundDate' | 'outboundDate' | 'expiry' | 'safetyStock'>> } }
  | { type: 'ADD_FORMULA'; payload: Formula }
  | { type: 'UPDATE_FORMULA'; payload: { id: string; changes: Partial<Formula> } }
  | { type: 'DELETE_FORMULA'; payload: { id: string } }
  | { type: 'ADD_DOCUMENT'; payload: ProductDocument }
  | { type: 'UPDATE_DOCUMENT'; payload: { id: string; changes: Partial<ProductDocument> } }
  | { type: 'DELETE_DOCUMENT'; payload: { id: string } }

const products: Product[] = [
  { id: 'product-argan-oil', name: '摩洛哥阿甘油', en: 'Argania Spinosa Kernel Oil', inci: 'Argania Spinosa Kernel Oil', category: '植物油', source: '阿甘树', part: '果仁', method: '冷压萃取', origin: 'Morocco', spec: '1 KG / 5 KG / 25 KG', moq: '25 KG', safety: '300 KG', stock: 72, batch: 'ARG20260801', price: 380, tone: 'amber' },
  { id: 'product-cactus-oil', name: '摩洛哥仙人掌籽油', en: 'Opuntia Ficus-Indica Seed Oil', inci: 'Opuntia Ficus-Indica Seed Oil', category: '植物油', source: '仙人掌', part: '种子', method: '冷压萃取', origin: 'Morocco', spec: '100 ML / 1 KG', moq: '10 KG', safety: '10 KG', stock: 8, batch: 'CP20260801', price: 1500, tone: 'sage' },
  { id: 'product-rhassoul-clay', name: '摩洛哥熔岩泥', en: 'Moroccan Rhassoul Clay', inci: 'Moroccan Lava Clay', category: '天然泥粉', source: '火山矿物', part: '矿层', method: '天然晾晒研磨', origin: 'Morocco', spec: '1 KG / 20 KG', moq: '20 KG', safety: '500 KG', stock: 120, batch: 'CLAY20260801', price: 120, tone: 'clay' },
]

const customers: Customer[] = [
  { id: 'customer-xx-beauty', company: 'XX化妆品有限公司', contact: '李女士', title: '采购经理', phone: '138 0000 1024', wechat: 'xxbeauty_li', email: 'li@xxbeauty.com', region: '上海市', type: '化妆品品牌', source: '行业展会', business: '护肤品研发与品牌运营', products: '摩洛哥阿甘油、摩洛哥仙人掌籽油', scale: '20-50 KG', cycle: '每季度', grade: 'A', status: '高意向', tag: '品牌方', lastContact: '2026-08-20', amount: 38600, next: '客户3天前询价摩洛哥阿甘油，建议今天跟进。', tone: 'peach', createdAt: '2026-08-20', updatedAt: '2026-08-23', timeline: [{ date: '2026-08-20', event: '新增客户', detail: '通过行业展会认识' }, { date: '2026-08-21', event: '询价摩洛哥阿甘油' }, { date: '2026-08-21', event: '发送产品资料' }, { date: '2026-08-22', event: '申请样品' }, { date: '2026-08-23', event: '样品已寄出' }, { date: '2026-08-26', event: '建议跟进' }] },
  { id: 'customer-xx-spa', company: 'XX美容院', contact: '王女士', title: '店长', phone: '139 0000 2068', wechat: 'wang_xxspa', email: 'wang@xxspa.com', region: '杭州市', type: '美容院', source: '客户转介绍', business: '专业面部护理与身体疗愈', products: '摩洛哥熔岩泥、精油', scale: '10-20 KG', cycle: '每月', grade: 'B', status: '跟进中', tag: '美容院', lastContact: '2026-08-18', amount: 0, next: '样品已经签收，建议跟进试用反馈。', tone: 'sage', createdAt: '2026-08-18', updatedAt: '2026-08-23', timeline: [{ date: '2026-08-18', event: '新增客户' }, { date: '2026-08-19', event: '询价摩洛哥熔岩泥' }, { date: '2026-08-21', event: '寄出样品' }, { date: '2026-08-23', event: '等待样品反馈' }] },
  { id: 'customer-xx-aroma', company: 'XX芳疗工作室', contact: '陈女士', title: '主理人', phone: '136 0000 3096', wechat: 'chen_aroma', email: 'chen@xxaroma.com', region: '深圳市', type: '芳疗工作室', source: '线上咨询', business: '芳香疗法课程与个案服务', products: '精油、植物油', scale: '5-10 KG', cycle: '每月', grade: 'C', status: '待跟进', tag: '芳疗工作室', lastContact: '2026-08-01', amount: 0, next: '客户超过15天未跟进，建议今天重新联系。', tone: 'amber', createdAt: '2026-08-01', updatedAt: '2026-08-02', timeline: [{ date: '2026-08-01', event: '新增客户' }, { date: '2026-08-02', event: '咨询精油产品资料' }] },
]

const inventory: InventoryRecord[] = [
  { id: 'inventory-argan-20260801', productId: 'product-argan-oil', productName: '摩洛哥阿甘油', category: '植物油', inbound: 100, outbound: 28, reserved: 0, safetyStock: 300, batch: 'ARG20260801', inboundDate: '2026-08-01', outboundDate: '2026-08-20', expiry: '2028-08-01', timeline: [{ date: '2026-08-01', type: 'inbound', quantity: 100 }, { date: '2026-08-20', type: 'outbound', quantity: 28 }] },
  { id: 'inventory-cactus-20260801', productId: 'product-cactus-oil', productName: '摩洛哥仙人掌籽油', category: '植物油', inbound: 20, outbound: 12, reserved: 0, safetyStock: 10, batch: 'CP20260801', inboundDate: '2026-07-18', outboundDate: '2026-08-18', expiry: '2026-09-12', timeline: [{ date: '2026-07-18', type: 'inbound', quantity: 20 }, { date: '2026-08-18', type: 'outbound', quantity: 12 }] },
  { id: 'inventory-clay-20260801', productId: 'product-rhassoul-clay', productName: '摩洛哥熔岩泥', category: '天然泥粉', inbound: 150, outbound: 30, reserved: 0, safetyStock: 500, batch: 'CLAY20260801', inboundDate: '2026-08-05', outboundDate: '2026-08-15', expiry: '2028-08-05', timeline: [{ date: '2026-08-05', type: 'inbound', quantity: 150 }, { date: '2026-08-15', type: 'outbound', quantity: 30 }] },
]

const initialState: AppState = {
  products,
  inventory,
  customers,
  followUps: [
    { id: 'follow-up-argan', customerId: 'customer-xx-beauty', date: '2026-08-23', method: '电话', content: '跟进阿甘油配方测试进展', status: '待跟进', nextDate: '2026-08-23', owner: '管理员' },
  ],
  samples: [
    { id: 'sample-001', customerId: 'customer-xx-beauty', customer: 'XX化妆品有限公司', productId: 'product-argan-oil', product: '摩洛哥阿甘油', batch: 'ARG20260801', quantity: 0.1, status: '等待反馈', applyDate: '2026-08-20', sendDate: '2026-08-22', expectedFeedback: '2026-08-27', contact: '李女士', phone: '138 0000 1024', spec: '100ml', signedDate: '2026-08-23', feedbackDate: '', address: '上海市浦东新区 XX 路', carrier: '顺丰速运', tracking: 'SF1234567890', stock: 72, tone: 'peach', timeline: [{ date: '2026-08-20', event: '客户申请样品' }, { date: '2026-08-21', event: '样品准备完成' }, { date: '2026-08-22', event: '样品寄出' }, { date: '2026-08-23', event: '客户签收' }, { date: '2026-08-27', event: '提醒跟进' }] },
    { id: 'sample-002', customerId: 'customer-xx-spa', customer: 'XX美容院', productId: 'product-rhassoul-clay', product: '摩洛哥熔岩泥', batch: 'CLAY20260801', quantity: 0.5, status: '已寄出', applyDate: '2026-08-21', sendDate: '2026-08-23', expectedFeedback: '2026-08-30', contact: '王女士', phone: '139 0000 2068', spec: '500g', signedDate: '', feedbackDate: '', address: '杭州市西湖区 XX 大厦', carrier: '中通快递', tracking: 'ZT2233445566', stock: 120, tone: 'sage', timeline: [{ date: '2026-08-21', event: '客户申请样品' }, { date: '2026-08-22', event: '样品准备完成' }, { date: '2026-08-23', event: '样品寄出' }] },
    { id: 'sample-003', customerId: 'customer-xx-aroma', customer: 'XX芳疗工作室', productId: 'product-cactus-oil', product: '摩洛哥仙人掌籽油', batch: 'CP20260801', quantity: 0.03, status: '准备中', applyDate: '2026-08-22', sendDate: '', expectedFeedback: '2026-09-01', contact: '陈女士', phone: '136 0000 3096', spec: '30ml', signedDate: '', feedbackDate: '', address: '深圳市南山区 XX 创意园', carrier: '', tracking: '', stock: 8, tone: 'amber', timeline: [{ date: '2026-08-22', event: '客户申请样品' }, { date: '2026-08-23', event: '样品准备中' }] },
  ],
  quotes: [
    { id: 'Q20260823001', customerId: 'customer-xx-beauty', customer: 'XX化妆品有限公司', productId: 'product-argan-oil', product: '摩洛哥阿甘油', quantity: 20, unit: 'KG', price: 380, freight: 0, tax: 0, quoteDate: '2026-08-23', validUntil: '2026-08-30', status: '待确认', contact: '李女士', batch: 'ARG20260801', moq: 10, payment: 'T/T 预付', delivery: '款到发货', note: '用于新品配方测试，确认后安排样品。', stock: 72, tone: 'peach' },
    { id: 'Q20260823002', customerId: 'customer-xx-spa', customer: 'XX美容院', productId: 'product-rhassoul-clay', product: '摩洛哥熔岩泥', quantity: 10, unit: 'KG', price: 120, freight: 100, tax: 0, quoteDate: '2026-08-23', validUntil: '2026-08-29', status: '已发送', contact: '王女士', batch: 'CLAY20260801', moq: 20, payment: 'T/T 预付', delivery: '款到发货', note: '常规护理项目用料。', stock: 120, tone: 'sage' },
    { id: 'Q20260823003', customerId: 'customer-xx-aroma', customer: 'XX芳疗工作室', productId: 'product-cactus-oil', product: '摩洛哥仙人掌籽油', quantity: 2, unit: 'KG', price: 1500, freight: 0, tax: 0, quoteDate: '2026-08-23', validUntil: '2026-09-05', status: '已接受', contact: '陈女士', batch: 'CP20260801', moq: 1, payment: 'T/T 预付', delivery: '款到发货', note: '芳疗课程用油。', stock: 8, tone: 'amber' },
  ],
  orders: [
    { id: 'SO20260823001', orderNo: 'SO20260823001', customerId: 'customer-xx-beauty', customer: 'XX化妆品有限公司', quoteId: 'Q20260823001', productId: 'product-argan-oil', product: '摩洛哥阿甘油', quantity: 20, shipped: 0, unit: 'KG', price: 380, freight: 0, tax: 0, status: '待付款', payment: '待付款', paid: 0, orderDate: '2026-08-23', contact: '李女士', quote: 'Q20260823001', batch: 'ARG20260801', delivery: '款到发货', expected: '2026-08-30', logistics: '', tracking: '', stock: 72, tone: 'peach', createdAt: '2026-08-23', updatedAt: '2026-08-23', totalAmount: 7600, paidAmount: 0, items: [{ productId: 'product-argan-oil', productName: '摩洛哥阿甘油', quantity: 20, unit: 'KG', price: 380, amount: 7600, shippedQuantity: 0 }], timeline: [{ date: '2026-08-23', event: '客户接受报价' }, { date: '2026-08-23', event: '创建订单' }] },
    { id: 'SO20260823002', orderNo: 'SO20260823002', customerId: 'customer-xx-spa', customer: 'XX美容院', quoteId: 'Q20260823002', productId: 'product-rhassoul-clay', product: '摩洛哥熔岩泥', quantity: 10, shipped: 0, unit: 'KG', price: 120, freight: 0, tax: 0, status: '待发货', payment: '已付款', paid: 1200, orderDate: '2026-08-23', contact: '王女士', quote: 'Q20260823002', batch: 'CLAY20260801', delivery: '款到发货', expected: '2026-08-28', logistics: '顺丰速运', tracking: 'SF90887766', stock: 120, tone: 'sage', createdAt: '2026-08-23', updatedAt: '2026-08-24', totalAmount: 1200, paidAmount: 1200, items: [{ productId: 'product-rhassoul-clay', productName: '摩洛哥熔岩泥', quantity: 10, unit: 'KG', price: 120, amount: 1200, shippedQuantity: 0 }], timeline: [{ date: '2026-08-23', event: '创建订单' }, { date: '2026-08-24', event: '收到付款' }] },
    { id: 'SO20260823003', orderNo: 'SO20260823003', customerId: 'customer-xx-aroma', customer: 'XX芳疗工作室', quoteId: 'Q20260823003', productId: 'product-cactus-oil', product: '摩洛哥仙人掌籽油', quantity: 2, shipped: 2, unit: 'KG', price: 1500, freight: 0, tax: 0, status: '已完成', payment: '已付款', paid: 3000, orderDate: '2026-08-23', contact: '陈女士', quote: 'Q20260823003', batch: 'CP20260801', delivery: '款到发货', expected: '2026-08-27', logistics: '中通快递', tracking: 'ZT77665544', stock: 8, tone: 'amber', createdAt: '2026-08-23', updatedAt: '2026-08-27', totalAmount: 3000, paidAmount: 3000, items: [{ productId: 'product-cactus-oil', productName: '摩洛哥仙人掌籽油', quantity: 2, unit: 'KG', price: 1500, amount: 3000, shippedQuantity: 2 }], timeline: [{ date: '2026-08-23', event: '创建订单' }, { date: '2026-08-24', event: '收到付款' }, { date: '2026-08-25', event: '完成发货' }, { date: '2026-08-27', event: '订单完成' }] },
  ],
  formulas: [
    { id: 'F20260823001', name: '熟龄肌护理油', purpose: '面部护理', total: 1000, unit: 'g', status: '已完成', version: 'V1.0', updated: '2026-08-22', ingredients: [{ id: 'formula-argan', productId: 'product-argan-oil', name: '摩洛哥阿甘油', ratio: 60, price: 380 }, { id: 'formula-cactus', productId: 'product-cactus-oil', name: '摩洛哥仙人掌籽油', ratio: 30, price: 1500 }, { id: 'formula-base', productId: 'product-rhassoul-clay', name: '植物油', ratio: 8, price: 120 }, { id: 'formula-essential', productId: 'product-cactus-oil', name: '精油', ratio: 2, price: 800 }] },
  ],
  productDocuments: [
    { id: 'DOC-ARG-COA', name: '阿甘油 COA 检测报告', type: 'COA', productId: 'product-argan-oil', product: '摩洛哥阿甘油', batch: 'ARG20260801', version: 'V1.0', publish: '2026-08-01', expiry: '2026-09-12', status: '已上传' },
    { id: 'DOC-ARG-SDS', name: '阿甘油 SDS 安全数据表', type: 'SDS', productId: 'product-argan-oil', product: '摩洛哥阿甘油', batch: '-', version: 'V1.1', publish: '2026-07-20', expiry: '', status: '已上传' },
    { id: 'DOC-ARG-TDS', name: '阿甘油 TDS 技术规格书', type: 'TDS', productId: 'product-argan-oil', product: '摩洛哥阿甘油', batch: '-', version: 'V1.0', publish: '2026-07-20', expiry: '', status: '已上传' },
    { id: 'DOC-ARG-SPEC', name: '阿甘油产品规格书', type: '规格书', productId: 'product-argan-oil', product: '摩洛哥阿甘油', batch: '-', version: 'V1.0', publish: '2026-07-20', expiry: '', status: '已上传' },
    { id: 'DOC-ARG-BATCH', name: '阿甘油批次资料', type: '批次资料', productId: 'product-argan-oil', product: '摩洛哥阿甘油', batch: 'ARG20260801', version: 'V1.0', publish: '2026-08-01', expiry: '', status: '已上传' },
    { id: 'DOC-CPS-COA', name: '仙人掌籽油 COA 检测报告', type: 'COA', productId: 'product-cactus-oil', product: '摩洛哥仙人掌籽油', batch: 'CP20260801', version: 'V1.0', publish: '2026-08-01', expiry: '2026-10-10', status: '已上传' },
    { id: 'DOC-CPS-SDS', name: '仙人掌籽油 SDS', type: 'SDS', productId: 'product-cactus-oil', product: '摩洛哥仙人掌籽油', batch: '-', version: 'V1.0', publish: '2026-08-01', expiry: '', status: '已上传' },
    { id: 'DOC-CPS-TDS', name: '仙人掌籽油 TDS', type: 'TDS', productId: 'product-cactus-oil', product: '摩洛哥仙人掌籽油', batch: '-', version: 'V1.0', publish: '2026-08-01', expiry: '', status: '已上传' },
    { id: 'DOC-RHL-COA', name: '熔岩泥 COA 检测报告', type: 'COA', productId: 'product-rhassoul-clay', product: '摩洛哥熔岩泥', batch: 'CLAY20260801', version: 'V1.0', publish: '2026-08-05', expiry: '', status: '已上传' },
    { id: 'DOC-RHL-TDS', name: '熔岩泥 TDS 技术规格书', type: 'TDS', productId: 'product-rhassoul-clay', product: '摩洛哥熔岩泥', batch: '-', version: 'V1.0', publish: '2026-08-05', expiry: '', status: '已上传' },
  ],
  productDrafts: [],
  leadCandidates: [],
  settings: { simulatedToday: '2026-08-23', currency: 'CNY', defaultUnit: 'KG' },
}

function updateById<T extends { id: string }>(items: T[], id: string, changes: Partial<T>) {
  return items.map((item) => item.id === id ? { ...item, ...changes } : item)
}

function withInventoryEvent(record: InventoryRecord, event: InventoryEvent): InventoryRecord {
  return { ...record, timeline: [...(record.timeline || []), event] }
}

function createEventId(record: InventoryRecord, type: InventoryEvent['type'], date: string) {
  return `${type}-${record.id}-${date}-${(record.timeline?.length || 0) + 1}`
}

function createInventoryEvent(record: InventoryRecord, type: InventoryEvent['type'], quantity: number, date: string, extra: Partial<InventoryEvent> = {}): InventoryEvent {
  return {
    eventId: createEventId(record, type, date),
    productId: record.productId,
    batch: record.batch,
    date,
    type,
    quantity,
    ...extra,
  }
}

function uniqueInventoryId(baseId: string, inventory: InventoryRecord[]): string {
  let id = baseId
  let index = 2
  while (inventory.some((item) => item.id === id)) {
    id = `${baseId}-${index}`
    index += 1
  }
  return id
}

function parseProductSafety(safety: string | undefined): number | undefined {
  if (!safety) return undefined
  const match = String(safety).match(/\d+(\.\d+)?/)
  return match ? Number(match[0]) : undefined
}

const isProductInUse = (state: AppState, productId: string): boolean =>
  state.inventory.some((item) => item.productId === productId)
  || state.orders.some((item) => item.productId === productId)
  || state.quotes.some((item) => item.productId === productId)
  || state.samples.some((item) => item.productId === productId)
  || state.formulas.some((formula) => formula.ingredients.some((ingredient) => ingredient.productId === productId))

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'ADD_PRODUCT': return { ...state, products: [...state.products, action.payload] }
    case 'UPDATE_PRODUCT': return { ...state, products: updateById(state.products, action.payload.id, action.payload.changes) }
    case 'DELETE_PRODUCT': return isProductInUse(state, action.payload.id) ? state : { ...state, products: state.products.filter((item) => item.id !== action.payload.id) }
    case 'ADD_CUSTOMER': return { ...state, customers: [...state.customers, action.payload] }
    case 'UPDATE_CUSTOMER': return { ...state, customers: updateById(state.customers, action.payload.id, action.payload.changes) }
    case 'ADD_PRODUCT_DRAFT': return { ...state, productDrafts: [action.payload, ...state.productDrafts] }
    case 'UPDATE_PRODUCT_DRAFT': return { ...state, productDrafts: updateById(state.productDrafts, action.payload.id, action.payload.changes) }
    case 'REMOVE_PRODUCT_DRAFT': return { ...state, productDrafts: state.productDrafts.filter((item) => item.id !== action.payload.id) }
    case 'ADD_LEAD_CANDIDATE': return { ...state, leadCandidates: [action.payload, ...state.leadCandidates] }
    case 'UPDATE_LEAD_CANDIDATE': return { ...state, leadCandidates: updateById(state.leadCandidates, action.payload.id, action.payload.changes) }
    case 'REMOVE_LEAD_CANDIDATE': return { ...state, leadCandidates: state.leadCandidates.filter((item) => item.id !== action.payload.id) }
    case 'ADD_FOLLOW_UP': return { ...state, followUps: [...state.followUps, action.payload] }
    case 'UPDATE_FOLLOW_UP': return { ...state, followUps: updateById(state.followUps, action.payload.id, action.payload.changes) }
    case 'ADD_SAMPLE': return { ...state, samples: [...state.samples, action.payload] }
    case 'UPDATE_SAMPLE': return { ...state, samples: updateById(state.samples, action.payload.id, action.payload.changes) }
    case 'ADD_QUOTE': return { ...state, quotes: [...state.quotes, action.payload] }
    case 'UPDATE_QUOTE': return { ...state, quotes: updateById(state.quotes, action.payload.id, action.payload.changes) }
    case 'CREATE_ORDER': return { ...state, orders: [action.payload, ...state.orders] }
    case 'ADD_ORDER': return { ...state, orders: [...state.orders, action.payload] }
    case 'UPDATE_ORDER': return { ...state, orders: updateById(state.orders, action.payload.id, action.payload.changes) }
    case 'CANCEL_ORDER': return { ...state, orders: state.orders.map((order) => order.id === action.payload.id ? { ...order, status: '已取消', reservations: [] } : order) }
    case 'STOCK_IN': {
      const record = state.inventory.find((item) => item.id === action.payload.inventoryId)
      if (!record) return state
      const date = action.payload.date || state.settings.simulatedToday
      return { ...state, inventory: updateById(state.inventory, action.payload.inventoryId, { ...withInventoryEvent(record, { date, type: 'inbound', quantity: action.payload.quantity }), inbound: record.inbound + action.payload.quantity, inboundDate: date }) }
    }
    case 'STOCK_OUT': {
      const record = state.inventory.find((item) => item.id === action.payload.inventoryId)
      if (!record) return state
      if (action.payload.quantity <= 0) return state
      if (action.payload.quantity > record.inbound - record.outbound - record.reserved) return state
      const date = action.payload.date || state.settings.simulatedToday
      return { ...state, inventory: updateById(state.inventory, action.payload.inventoryId, { ...withInventoryEvent(record, { date, type: 'outbound', quantity: action.payload.quantity }), outbound: record.outbound + action.payload.quantity, outboundDate: date }) }
    }
    case 'RESERVE_STOCK': {
      const record = state.inventory.find((item) => item.id === action.payload.inventoryId)
      if (!record) return state
      if (record.reserved + action.payload.quantity > record.inbound - record.outbound) return state
      const date = state.settings.simulatedToday
      return { ...state, inventory: updateById(state.inventory, action.payload.inventoryId, { ...withInventoryEvent(record, createInventoryEvent(record, 'reserve', action.payload.quantity, date)), reserved: record.reserved + action.payload.quantity }) }
    }
    case 'RELEASE_STOCK': {
      const record = state.inventory.find((item) => item.id === action.payload.inventoryId)
      if (!record) return state
      const date = state.settings.simulatedToday
      return { ...state, inventory: updateById(state.inventory, action.payload.inventoryId, { ...withInventoryEvent(record, createInventoryEvent(record, 'release', action.payload.quantity, date)), reserved: Math.max(0, record.reserved - action.payload.quantity) }) }
    }
    case 'ADJUST_STOCK': {
      const record = state.inventory.find((item) => item.id === action.payload.inventoryId)
      if (!record) return state
      const date = action.payload.date || state.settings.simulatedToday
      const current = record.inbound - record.outbound
      const delta = action.payload.quantity - current
      return { ...state, inventory: updateById(state.inventory, action.payload.inventoryId, { ...withInventoryEvent(record, { date, type: 'adjust', quantity: action.payload.quantity }), outbound: Math.max(0, record.outbound - delta) }) }
    }
    case 'SET_SAFETY_STOCK': {
      const record = state.inventory.find((item) => item.id === action.payload.inventoryId)
      if (!record) return state
      return { ...state, inventory: updateById(state.inventory, action.payload.inventoryId, { safetyStock: action.payload.safetyStock }), products: state.products.map((product) => product.id === record.productId ? { ...product, safety: `${action.payload.safetyStock} KG` } : product) }
    }
    case 'ADD_INVENTORY_BATCH': {
      const payload = action.payload
      if (payload.inbound < 0) return state
      const id = uniqueInventoryId(payload.id ?? `inventory-${payload.productId.replace(/^product-/, '')}-${payload.batch}`, state.inventory)
      const inheritedSafety = state.inventory.find((item) => item.productId === payload.productId)?.safetyStock
        ?? parseProductSafety(state.products.find((product) => product.id === payload.productId)?.safety)
        ?? 0
      const record: InventoryRecord = {
        id,
        productId: payload.productId,
        productName: payload.productName,
        category: payload.category,
        inbound: payload.inbound,
        outbound: payload.outbound ?? 0,
        reserved: 0,
        safetyStock: payload.safetyStock ?? inheritedSafety,
        batch: payload.batch,
        inboundDate: payload.inboundDate,
        outboundDate: payload.outboundDate ?? '',
        expiry: payload.expiry ?? '',
        timeline: [],
      }
      return { ...state, inventory: [...state.inventory, withInventoryEvent(record, createInventoryEvent(record, 'inbound', record.inbound, record.inboundDate))] }
    }
    case 'UPDATE_INVENTORY_BATCH': {
      const record = state.inventory.find((item) => item.id === action.payload.inventoryId)
      if (!record) return state
      return { ...state, inventory: state.inventory.map((item) => item.id === action.payload.inventoryId ? { ...item, ...action.payload.changes } : item) }
    }
    case 'ADD_FORMULA': return { ...state, formulas: [...state.formulas, action.payload] }
    case 'UPDATE_FORMULA': return { ...state, formulas: updateById(state.formulas, action.payload.id, action.payload.changes) }
    case 'DELETE_FORMULA': return { ...state, formulas: state.formulas.filter((item) => item.id !== action.payload.id) }
    case 'ADD_DOCUMENT': return { ...state, productDocuments: [...state.productDocuments, action.payload] }
    case 'UPDATE_DOCUMENT': return { ...state, productDocuments: updateById(state.productDocuments, action.payload.id, action.payload.changes) }
    case 'DELETE_DOCUMENT': return { ...state, productDocuments: state.productDocuments.filter((item) => item.id !== action.payload.id) }
    default: return state
  }
}

const AppStoreContext = createContext<{ state: AppState; dispatch: Dispatch<AppAction> } | null>(null)

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, loadStoredState)
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: STORAGE_VERSION, state }))
    } catch {
      // 持久化写入异常不应阻塞正常 Store 工作
    }
  }, [state])
  return <AppStoreContext.Provider value={{ state, dispatch }}>{children}</AppStoreContext.Provider>
}

export function useAppStore() {
  const context = useContext(AppStoreContext)
  if (!context) throw new Error('useAppStore must be used inside AppStoreProvider')
  return context
}

const STORAGE_KEY = 'essential-oil-inventory-store'
const STORAGE_VERSION = 1

function loadStoredState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return initialState
    const parsed = JSON.parse(raw) as { version?: unknown; state?: unknown } | null
    if (!parsed || parsed.version !== STORAGE_VERSION || !parsed.state || typeof parsed.state !== 'object' || !Array.isArray((parsed.state as AppState).inventory) || !Array.isArray((parsed.state as AppState).products)) {
      return initialState
    }
    return parsed.state as AppState
  } catch {
    return initialState
  }
}

export { initialState }
