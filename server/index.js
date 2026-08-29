import express from 'express'
import { isSafeUrl, fetchPublicPage } from './lib/fetcher.js'
import { isDisallowedByRobots } from './lib/robots.js'
import { parseProductPage } from './lib/parser.js'
import { getAiProvider } from './lib/aiProvider.js'

const app = express()
app.use(express.json({ limit: '16kb' }))

app.post('/api/research', async (req, res) => {
  const rawUrl = String(req.body?.url || '').trim()
  if (!rawUrl) return res.status(400).json({ error: '缺少 URL' })
  const check = await isSafeUrl(rawUrl)
  if (!check.ok) return res.status(400).json({ error: check.reason })
  const { parsed } = check
  try {
    let robotsTxt = ''
    try {
      const robotsPage = await fetchPublicPage(`${parsed.protocol}//${parsed.host}/robots.txt`, { maxBytes: 64 * 1024 })
      robotsTxt = robotsPage.html
    } catch {
      robotsTxt = ''
    }
    if (isDisallowedByRobots('*', robotsTxt, parsed.pathname)) {
      return res.status(403).json({ error: 'robots.txt 禁止抓取该路径' })
    }
    const page = await fetchPublicPage(parsed.toString())
    const draft = parseProductPage(page.html, page.finalUrl)
    res.json({ ...draft, id: `pd-${Date.now()}`, createdAt: new Date().toISOString().slice(0, 10) })
  } catch (err) {
    res.status(502).json({ error: `抓取失败：${err.message}` })
  }
})

app.post('/api/product-research/ai', async (req, res) => {
  const { sourceUrl, content, parsed } = req.body || {}
  if (!sourceUrl || !content) return res.status(400).json({ success: false, error: '缺少 sourceUrl 或 content' })
  const provider = getAiProvider()
  try {
    const structured = await provider.structure(String(content), parsed && typeof parsed === 'object' ? parsed : {})
    res.json({ success: true, provider: provider.name, draft: { ...structured, sourceUrl: String(sourceUrl), aiSource: 'url', verified: false, id: `pd-${Date.now()}` } })
  } catch (primaryErr) {
    // P4-3：完全使用 Ollama，Ollama 失败时直接返回失败，不再回退 DeepSeek
    res.json({ success: false, error: 'AI_STRUCTURING_FAILED' })
  }
})

const port = Number(process.env.PORT || 8787)
app.listen(port, () => console.log(`essential-oil research server listening on :${port}`))
