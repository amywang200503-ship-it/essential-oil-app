const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'

const SYSTEM_PROMPT = `你是产品资料结构化助手。你的任务是从用户提供的网页资料中提取产品事实。
规则：
1. 只能根据提供的资料提取事实。
2. 不得编造CAS、INCI、认证、产地、检测结果。
3. 网页没有明确说明的字段返回null。
4. AI推断必须进入aiInferences。
5. AI推断不得写入sourceFacts。
6. 所有结果verified=false。
7. 不得声称任何认证已经验证。
8. 不得直接创建或修改产品。
9. 输出必须是合法JSON。
10. 不输出Markdown代码块。
11. 不输出解释性文字。
JSON结构：{"name":null,"en":null,"inci":null,"cas":null,"category":null,"source":null,"origin":null,"spec":null,"description":null,"tags":[],"sourceFacts":{"name":null,"inci":null,"cas":null,"origin":null,"spec":null},"aiInferences":{"usage":[],"skinTypes":[],"sellingPoints":[],"formulaSuggestions":[]}}`

/** 从 DeepSeek 返回文本中提取合法 JSON（容忍 Markdown 代码块包裹）。 */
export function extractJson(raw) {
  if (!raw) return null
  const cleaned = String(raw).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

/** 将 AI 输出规范化为候选 draft；网页事实与 AI 推断分离，AI 推断显式标注。 */
export function normalizeAiDraft(json, parsed) {
  const ai = json && typeof json === 'object' ? json : {}
  const sourceFacts = ai.sourceFacts && typeof ai.sourceFacts === 'object' ? ai.sourceFacts : {}
  const inferences = ai.aiInferences && typeof ai.aiInferences === 'object' ? ai.aiInferences : {}
  const str = (value) => (typeof value === 'string' ? value.trim() : '')
  const tags = Array.isArray(ai.tags) ? ai.tags.filter((tag) => typeof tag === 'string') : []
  const usage = Array.isArray(inferences.usage) ? inferences.usage.join('、') : ''
  const skinTypes = Array.isArray(inferences.skinTypes) ? inferences.skinTypes.join('、') : ''
  const sellingPoints = Array.isArray(inferences.sellingPoints) ? inferences.sellingPoints.join('、') : ''
  const inferredNote = ['AI 推断'].concat(usage ? [`用途：${usage}`] : [], skinTypes ? [`适用肤质：${skinTypes}`] : [], sellingPoints ? [`卖点：${sellingPoints}`] : []).join('；')
  const description = [str(ai.description) || str(sourceFacts.name) || '', inferredNote ? `[${inferredNote}]` : ''].filter(Boolean).join('\n')
  return {
    name: str(ai.name) || str(parsed?.name) || '',
    en: str(ai.en),
    inci: str(ai.inci) || str(sourceFacts.inci) || str(parsed?.inci),
    cas: str(ai.cas) || str(sourceFacts.cas) || str(parsed?.cas),
    category: str(ai.category) || '精油',
    source: str(ai.source) || str(parsed?.source),
    origin: str(ai.origin) || str(sourceFacts.origin) || str(parsed?.origin),
    spec: str(ai.spec) || str(sourceFacts.spec) || str(parsed?.spec),
    description,
    tags: tags.join(','),
    sourceFacts,
    aiInferences: inferences,
  }
}

/** 调用 DeepSeek 结构化网页资料。Key 仅来自后端环境变量。 */
export async function structureWithDeepSeek(content, parsed) {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY 未配置')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `网页资料：\n${content}\n\n已解析字段：${JSON.stringify(parsed)}` },
        ],
        temperature: 0.1,
      }),
    })
    if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`)
    const data = await response.json()
    const raw = data?.choices?.[0]?.message?.content || ''
    const json = extractJson(raw)
    if (!json) throw new Error('AI 返回非 JSON')
    return normalizeAiDraft(json, parsed)
  } finally {
    clearTimeout(timer)
  }
}

/** 调用本地 Ollama 结构化网页资料（无需 API Key）。地址/模型由后端环境变量配置。 */
export async function structureWithOllama(content, parsed) {
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '')
  const model = process.env.OLLAMA_MODEL || 'qwen2:1.5b'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60000)
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `网页资料：\n${content}\n\n已解析字段：${JSON.stringify(parsed)}` },
        ],
      }),
    })
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`)
    const data = await response.json()
    const raw = data?.message?.content || ''
    const json = extractJson(raw)
    if (!json) throw new Error('Ollama 返回非 JSON')
    return normalizeAiDraft(json, parsed)
  } finally {
    clearTimeout(timer)
  }
}

/** P4-3：固定使用本地 Ollama，任何情况下不回退 DeepSeek。 */
export function getAiProvider() {
  return { name: 'ollama', structure: structureWithOllama }
}
