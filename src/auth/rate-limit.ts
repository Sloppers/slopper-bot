const WINDOW_SECONDS = 3600
const MAX_WRITES_PER_WINDOW = 60
const MAX_REPORTS_PER_WINDOW = 5

interface RateLimitEntry {
  count: number
  resetAt: number
}

export async function checkRateLimit(
  kv: KVNamespace,
  account: string,
  action: 'write' | 'report'
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const limit = action === 'report' ? MAX_REPORTS_PER_WINDOW : MAX_WRITES_PER_WINDOW
  const key = `rate:${action}:${account}`

  const raw = await kv.get(key)
  const now = Math.floor(Date.now() / 1000)

  let entry: RateLimitEntry
  if (raw) {
    entry = JSON.parse(raw) as RateLimitEntry
    if (now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + WINDOW_SECONDS }
    }
  } else {
    entry = { count: 0, resetAt: now + WINDOW_SECONDS }
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }

  entry.count++
  const ttl = entry.resetAt - now
  await kv.put(key, JSON.stringify(entry), { expirationTtl: ttl > 0 ? ttl : 1 })

  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt }
}
