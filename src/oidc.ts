const ISSUER = 'https://token.actions.githubusercontent.com'
const JWKS_URL = `${ISSUER}/.well-known/jwks`

interface JwkKey {
  kid: string
  kty: string
  alg: string
  n: string
  e: string
  use: string
}

interface OidcClaims {
  repository: string
  repository_owner: string
  actor: string
  iss: string
  aud: string
  exp: number
}

let cachedKeys: JwkKey[] | null = null
let cachedAt = 0
const CACHE_TTL = 3600_000

async function fetchJwks(): Promise<JwkKey[]> {
  const now = Date.now()
  if (cachedKeys && now - cachedAt < CACHE_TTL) return cachedKeys

  const res = await fetch(JWKS_URL)
  if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`)
  const data = await res.json() as { keys: JwkKey[] }
  cachedKeys = data.keys
  cachedAt = now
  return data.keys
}

function decodeBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - str.length % 4) % 4)
  const binary = atob(padded)
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

export async function verifyOidcToken(token: string, expectedAudience: string): Promise<OidcClaims> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Invalid JWT format')

  const headerJson = new TextDecoder().decode(decodeBase64Url(parts[0]))
  const header = JSON.parse(headerJson) as { kid: string; alg: string }

  if (header.alg !== 'RS256') throw new Error(`Unsupported algorithm: ${header.alg}`)

  const keys = await fetchJwks()
  const jwk = keys.find(k => k.kid === header.kid)
  if (!jwk) throw new Error(`No matching JWK for kid: ${header.kid}`)

  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256' },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  )

  const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  const signature = decodeBase64Url(parts[2])

  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data)
  if (!valid) throw new Error('Invalid JWT signature')

  const payloadJson = new TextDecoder().decode(decodeBase64Url(parts[1]))
  const claims = JSON.parse(payloadJson) as OidcClaims

  if (claims.iss !== ISSUER) throw new Error(`Invalid issuer: ${claims.iss}`)
  if (claims.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired')
  if (claims.aud !== expectedAudience) throw new Error(`Invalid audience: ${claims.aud}`)

  return claims
}
