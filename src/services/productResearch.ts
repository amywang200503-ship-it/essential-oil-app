export type UrlResearchResult = {
  id: string
  name: string
  en: string
  inci: string
  cas: string
  origin: string
  source: string
  spec: string
  description: string
  tags: string
  content: string
  sourceUrl: string
  sourceExcerpt: string
  aiSource: 'url'
  verified: false
  createdAt: string
}

export type AiStructureResult = {
  success: boolean
  draft?: Omit<UrlResearchResult, 'id' | 'aiSource' | 'verified' | 'content' | 'sourceExcerpt'> & { id: string; sourceUrl: string; aiSource: 'url'; verified: false; category?: string; sourceFacts?: unknown; aiInferences?: unknown }
  error?: string
}

/** 调后端 /api/research：用户主动提交单个公开 URL，后端安全抓取并返回候选字段。 */
export async function researchProductUrl(url: string): Promise<UrlResearchResult> {
  const response = await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data?.error || '抓取失败')
  return data as UrlResearchResult
}

/** 调后端 /api/product-research/ai：DeepSeek 结构化（AI 结果仅进 ProductDraft，不写正式数据）。 */
export async function aiStructureProduct(sourceUrl: string, content: string, parsed: { name?: string; inci?: string; cas?: string; origin?: string }): Promise<AiStructureResult> {
  const response = await fetch('/api/product-research/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceUrl, content, parsed }),
  })
  return (await response.json()) as AiStructureResult
}
