import dns from 'node:dns/promises'

function isPrivateAddress(address) {
  const parts = address.split('.').map(Number)
  if (parts.length === 4) {
    if (parts[0] === 10) return true
    if (parts[0] === 127) return true
    if (parts[0] === 0) return true
    if (parts[0] === 169 && parts[1] === 254) return true
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    if (parts[0] === 192 && parts[1] === 168) return true
    if (parts[0] >= 224) return true
  }
  const lower = address.toLowerCase()
  if (address.includes(':') && (lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80'))) return true
  return false
}

/** URL 安全校验：仅 http/https、拒绝本机/内网/私有地址（SSRF 防护）。 */
export async function isSafeUrl(rawUrl) {
  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, reason: 'URL 格式无效' }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return { ok: false, reason: '仅支持 http/https' }
  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.localhost')) return { ok: false, reason: '禁止访问本机地址' }
  let addresses
  try {
    addresses = await dns.lookup(host, { all: true })
  } catch {
    return { ok: false, reason: '域名解析失败' }
  }
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) return { ok: false, reason: '禁止访问内网/私有地址' }
  }
  return { ok: true, parsed }
}

/** 抓取公开网页：超时 + 响应大小限制。 */
export async function fetchPublicPage(url, { timeoutMs = 10000, maxBytes = 1024 * 1024 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'EssentialOilProductResearch/1.0 (single url, respects robots.txt)' },
      redirect: 'follow',
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > maxBytes) throw new Error('页面过大')
    const reader = response.body.getReader()
    const chunks = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > maxBytes) throw new Error('页面超过大小限制')
      chunks.push(value)
    }
    return { html: Buffer.concat(chunks).toString('utf8'), finalUrl: response.url, contentType: response.headers.get('content-type') || '' }
  } finally {
    clearTimeout(timer)
  }
}
