/** robots.txt 基础检查：User-agent:* 的 Disallow 前缀匹配。 */
export function isDisallowedByRobots(userAgent, robotsTxt, urlPath) {
  if (!robotsTxt) return false
  let applyToGroup = false
  const disallows = []
  for (const rawLine of robotsTxt.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const index = line.indexOf(':')
    if (index < 0) continue
    const key = line.slice(0, index).trim().toLowerCase()
    const value = line.slice(index + 1).trim().toLowerCase()
    if (key === 'user-agent') {
      applyToGroup = value === '*' || value.includes(userAgent.toLowerCase())
    } else if (key === 'disallow' && applyToGroup) {
      if (value) disallows.push(value)
    }
  }
  const path = (urlPath || '/').toLowerCase()
  return disallows.some((rule) => path.startsWith(rule))
}
