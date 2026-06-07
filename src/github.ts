const API = 'https://api.github.com'
const UA = 'slopper-bot/1.0'

export async function createAppJwt(appId: string, privateKey: string): Promise<string> {
  const pem = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '')

  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))
  const data = new TextEncoder().encode(`${header}.${payload}`)

  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, data)

  return `${header}.${payload}.${base64urlBuffer(sig)}`
}

export async function getInstallationToken(jwt: string, installationId: number): Promise<string> {
  const res = await ghFetch(`${API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` }
  })
  const data = await res.json() as { token: string }
  return data.token
}

export async function getCollaboratorPermission(
  token: string,
  owner: string,
  repo: string,
  username: string
): Promise<string> {
  const res = await ghFetch(
    `${API}/repos/${owner}/${repo}/collaborators/${username}/permission`,
    { headers: { Authorization: `token ${token}` } }
  )
  const data = await res.json() as { permission: string }
  return data.permission
}

export async function createOrUpdateFile(
  token: string,
  repo: string,
  path: string,
  message: string,
  content: string
): Promise<void> {
  const existingRes = await ghFetch(`${API}/repos/${repo}/contents/${path}`, {
    headers: { Authorization: `token ${token}` }
  })

  let sha: string | undefined
  let existingContent = ''

  if (existingRes.ok) {
    const data = await existingRes.json() as { sha: string; content: string }
    sha = data.sha
    existingContent = atob(data.content.replace(/\n/g, ''))
  }

  const finalContent = existingContent
    ? `${existingContent}\n---\n${content}`
    : content

  const body: Record<string, unknown> = {
    message,
    content: btoa(finalContent),
  }
  if (sha) body.sha = sha

  await ghFetch(`${API}/repos/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify(body)
  })
}

export async function getFileContent(token: string, repo: string, path: string): Promise<string | null> {
  const res = await ghFetch(`${API}/repos/${repo}/contents/${path}`, {
    headers: { Authorization: `token ${token}` }
  })
  if (!res.ok) return null
  const data = await res.json() as { content: string }
  return atob(data.content.replace(/\n/g, ''))
}

export async function addReaction(
  token: string,
  owner: string,
  repo: string,
  commentId: number,
  reaction: string
): Promise<void> {
  await ghFetch(`${API}/repos/${owner}/${repo}/issues/comments/${commentId}/reactions`, {
    method: 'POST',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({ content: reaction })
  })
}

export async function getAppInstallation(jwt: string, org: string): Promise<number | null> {
  const res = await ghFetch(`${API}/app/installations`, {
    headers: { Authorization: `Bearer ${jwt}` }
  })
  if (!res.ok) return null
  const installations = await res.json() as { id: number; account: { login: string } }[]
  const match = installations.find(i => i.account.login.toLowerCase() === org.toLowerCase())
  return match?.id ?? null
}

export async function getComment(
  owner: string,
  repo: string,
  commentId: number
): Promise<{ body: string; user: { login: string; type: string } } | null> {
  const res = await fetch(`${API}/repos/${owner}/${repo}/issues/comments/${commentId}`, {
    headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': UA }
  })
  if (!res.ok) return null
  return await res.json() as { body: string; user: { login: string; type: string } }
}

async function ghFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/vnd.github.v3+json')
  headers.set('User-Agent', UA)
  if (init?.body) headers.set('Content-Type', 'application/json')
  return fetch(url, { ...init, headers })
}

function base64url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
