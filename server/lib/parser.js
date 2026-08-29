import * as cheerio from 'cheerio'

/** 从公开网页 HTML 提取候选产品字段（原始事实与推断字段：INCI/CAS/产地仅作候选，不自动 verified）。 */
export function parseProductPage(html, sourceUrl) {
  const $ = cheerio.load(html)
  const text = $('body').text().replace(/\s+/g, ' ').trim()
  const excerpt = text.slice(0, 400)
  const title = $('title').first().text().trim() || ''
  const h1 = $('h1').first().text().trim() || ''
  const name = h1 || title.split('|')[0].split('-')[0].trim() || new URL(sourceUrl).pathname.split('/').filter(Boolean).pop() || ''
  const grab = (pattern) => {
    const match = text.match(pattern)
    return match ? match[1].trim() : ''
  }
  return {
    name,
    en: '',
    inci: grab(/INCI[:\s]*([A-Za-z0-9\s.\-]{2,80})/i),
    cas: grab(/CAS(?:\s*No\.?|\s*号)?[:\s]*([0-9\-]{3,30})/i),
    origin: grab(/(?:产地|原产国|Origin)[:\s]*([\u4e00-\u9fa5A-Za-z]{2,30})/i),
    source: grab(/(?:植物来源|Botanical Source|Source)[:\s]*([\u4e00-\u9fa5A-Za-z ]{2,40})/i),
    spec: '',
    description: `来源：${sourceUrl}\n${excerpt}`,
    tags: title,
    content: text.slice(0, 8000),
    sourceUrl,
    sourceExcerpt: excerpt,
    aiSource: 'url',
    verified: false,
  }
}
