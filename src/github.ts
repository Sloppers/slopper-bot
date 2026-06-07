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

export async function listComments(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<{ id: number; body: string }[]> {
  const res = await ghFetch(
    `${API}/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
    { headers: { Authorization: `token ${token}` } }
  )
  return await res.json() as { id: number; body: string }[]
}

export async function updateComment(
  token: string,
  owner: string,
  repo: string,
  commentId: number,
  body: string
): Promise<void> {
  await ghFetch(`${API}/repos/${owner}/${repo}/issues/comments/${commentId}`, {
    method: 'PATCH',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({ body })
  })
}

export async function createIssueComment(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<void> {
  await ghFetch(`${API}/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({ body })
  })
}

export async function upsertComment(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  marker: string,
  body: string
): Promise<void> {
  const comments = await listComments(token, owner, repo, issueNumber)
  const existing = comments.find(c => c.body?.includes(marker))
  if (existing) {
    await updateComment(token, owner, repo, existing.id, body)
  } else {
    await createIssueComment(token, owner, repo, issueNumber, body)
  }
}

export async function closePr(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<void> {
  await ghFetch(`${API}/repos/${owner}/${repo}/pulls/${prNumber}`, {
    method: 'PATCH',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({ state: 'closed' })
  })
}

export async function approvePr(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<void> {
  await ghFetch(`${API}/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
    method: 'POST',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({ event: 'APPROVE', body })
  })
}

export async function requestReviewers(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  reviewers: string[]
): Promise<void> {
  await ghFetch(`${API}/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`, {
    method: 'POST',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({ reviewers })
  })
}

export async function getLabel(
  token: string,
  owner: string,
  repo: string,
  name: string
): Promise<boolean> {
  const res = await ghFetch(`${API}/repos/${owner}/${repo}/labels/${encodeURIComponent(name)}`, {
    headers: { Authorization: `token ${token}` }
  })
  return res.ok
}

export async function createLabel(
  token: string,
  owner: string,
  repo: string,
  name: string,
  color: string
): Promise<void> {
  await ghFetch(`${API}/repos/${owner}/${repo}/labels`, {
    method: 'POST',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({ name, color, description: 'Slopper PR trust analysis label' })
  })
}

export async function ensureLabel(
  token: string,
  owner: string,
  repo: string,
  name: string,
  color: string
): Promise<void> {
  const exists = await getLabel(token, owner, repo, name)
  if (!exists) await createLabel(token, owner, repo, name, color)
}

export async function addLabels(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  labels: string[]
): Promise<void> {
  await ghFetch(`${API}/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
    method: 'POST',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({ labels })
  })
}

export async function listLabelsOnIssue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<{ name: string }[]> {
  const res = await ghFetch(
    `${API}/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
    { headers: { Authorization: `token ${token}` } }
  )
  return await res.json() as { name: string }[]
}

export async function removeLabel(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  name: string
): Promise<void> {
  await ghFetch(
    `${API}/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(name)}`,
    { method: 'DELETE', headers: { Authorization: `token ${token}` } }
  )
}

export async function removeSlopperLabels(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number
): Promise<void> {
  const labels = await listLabelsOnIssue(token, owner, repo, issueNumber)
  for (const label of labels) {
    if (label.name.startsWith('slopper/')) {
      try { await removeLabel(token, owner, repo, issueNumber, label.name) } catch { /* race */ }
    }
  }
}

export async function getDefaultBranch(
  token: string,
  owner: string,
  repo: string
): Promise<string> {
  const res = await ghFetch(`${API}/repos/${owner}/${repo}`, {
    headers: { Authorization: `token ${token}` }
  })
  const data = await res.json() as { default_branch: string }
  return data.default_branch
}

export async function createVouchPr(
  token: string,
  owner: string,
  repo: string,
  username: string,
  content: string
): Promise<number> {
  const defaultBranch = await getDefaultBranch(token, owner, repo)
  const branch = `slopper/vouch-${username}`
  const path = `.slopper.d/vouched/${username}`

  const refRes = await ghFetch(
    `${API}/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`,
    { headers: { Authorization: `token ${token}` } }
  )
  const refData = await refRes.json() as { object: { sha: string } }

  await ghFetch(`${API}/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: refData.object.sha })
  })

  await ghFetch(`${API}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({
      message: `slopper: vouch ${username}`,
      content: btoa(content),
      branch
    })
  })

  const prRes = await ghFetch(`${API}/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({
      title: `slopper: vouch ${username}`,
      head: branch,
      base: defaultBranch,
      body: `Adding **@${username}** to the vouched contributors list.\n\n` +
        `Requested via \`/slopper vouch\`. This PR was created automatically by Slopper.`
    })
  })
  const prData = await prRes.json() as { number: number }
  return prData.number
}

export async function createReportPr(
  token: string,
  communityRepo: string,
  username: string,
  content: string,
  sourceRepo: string,
  pr: number,
  reporter: string
): Promise<number> {
  const [owner, repo] = communityRepo.split('/')
  const defaultBranch = await getDefaultBranch(token, owner, repo)
  const branch = `slopper/report-${username}-${Date.now()}`
  const path = `risky_users/${username}`

  const refRes = await ghFetch(
    `${API}/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`,
    { headers: { Authorization: `token ${token}` } }
  )
  const refData = await refRes.json() as { object: { sha: string } }

  await ghFetch(`${API}/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: refData.object.sha })
  })

  await ghFetch(`${API}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({
      message: `slopper: report ${username} (via ${sourceRepo}#${pr})`,
      content: btoa(content),
      branch
    })
  })

  const prRes = await ghFetch(`${API}/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: { Authorization: `token ${token}` },
    body: JSON.stringify({
      title: `slopper: report ${username}`,
      head: branch,
      base: defaultBranch,
      body: `Adding **@${username}** to the risky users list.\n\n` +
        `- **Reported by:** @${reporter}\n` +
        `- **Source:** ${sourceRepo}#${pr}\n` +
        `- **Reason:** \`/slopper report\`\n\n` +
        `To unban this user, close this PR (or delete the file if already merged).\n\n` +
        `This PR was created automatically by [Slopper](https://github.com/Sloppers/Slopper).`
    })
  })
  const prData = await prRes.json() as { number: number }
  return prData.number
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
