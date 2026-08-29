import type { LeadCandidate, ProductDraft } from '../store/AppStore'

/**
 * Phase A 无后端模板生成器。
 * 仅根据关键词/公司名生成「候选资料」（verified=false），供人工确认。
 * 未来可替换为真实 AIProvider（URL/文件/公开企业信息 → ProductDraft / LeadCandidate）。
 */
export function generateProductDraft(keyword: string, today: string): ProductDraft {
  return {
    id: `pd-${Date.now()}`,
    name: keyword,
    en: '',
    inci: '',
    category: '精油',
    source: '',
    origin: '',
    spec: '',
    description: `基于关键词「${keyword}」由模板生成的产品候选资料，需人工核实。`,
    tags: keyword,
    cas: '',
    aiSource: 'template',
    verified: false,
    createdAt: today,
    updatedAt: today,
  }
}

export function generateLeadCandidate(company: string, today: string): LeadCandidate {
  return {
    id: `lc-${Date.now()}`,
    company,
    website: '',
    industry: '',
    customerType: '',
    source: 'manual',
    needs: '',
    intentScore: 0,
    notes: '人工录入线索，需确认后导入 CRM。',
    dedupeKeys: [company],
    createdAt: today,
    updatedAt: today,
  }
}
