const API = 'https://api.github.com'
const UA = 'slopper-bot/1.0'

export class GitHubClient {
  constructor(
    private readonly token: string,
    private readonly owner: string,
    private readonly repo: string
  ) {}

  static async createAppJwt(appId: string, privateKey: string): Promise<string> {
    const pem = privateKey
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s/g, '')

    const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0))

    const key = await crypto.subtle.importKey(
      'pkcs8', der,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign']
    )

    const now = Math.floor(Date.now() / 1000)
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))
    const data = new TextEncoder().encode(`${header}.${payload}`)
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, data)

    return `${header}.${payload}.${base64urlBuffer(sig)}`
  }

  static async getInstallationToken(jwt: string, installationId: number): Promise<string> {
    const res = await ghFetch(`${API}/app/installations/${installationId}/access_tokens`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` }
    })
    const data = await res.json() as { token: string }
    return data.token
  }

  static async getAppInstallation(jwt: string, org: string): Promise<number | null> {
    const res = await ghFetch(`${API}/app/installations`, {
      headers: { Authorization: `Bearer ${jwt}` }
    })
    if (!res.ok) return null
    const installations = await res.json() as { id: number; account: { login: string } }[]
    const match = installations.find(i => i.account.login.toLowerCase() === org.toLowerCase())
    return match?.id ?? null
  }

  static async getComment(
    owner: string, repo: string, commentId: number
  ): Promise<{ body: string; user: { login: string; type: string } } | null> {
    const res = await fetch(`${API}/repos/${owner}/${repo}/issues/comments/${commentId}`, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': UA }
    })
    if (!res.ok) return null
    return await res.json() as { body: string; user: { login: string; type: string } }
  }

  async listComments(issueNumber: number): Promise<{ id: number; body: string }[]> {
    const res = await this.get(`/issues/${issueNumber}/comments?per_page=100`)
    return await res.json() as { id: number; body: string }[]
  }

  async updateComment(commentId: number, body: string): Promise<void> {
    await this.request('PATCH', `/issues/comments/${commentId}`, { body })
  }

  async createComment(issueNumber: number, body: string): Promise<void> {
    await this.request('POST', `/issues/${issueNumber}/comments`, { body })
  }

  async upsertComment(issueNumber: number, marker: string, body: string): Promise<void> {
    const comments = await this.listComments(issueNumber)
    const existing = comments.find(c => c.body?.includes(marker))
    if (existing) {
      await this.updateComment(existing.id, body)
    } else {
      await this.createComment(issueNumber, body)
    }
  }

  async closePr(prNumber: number): Promise<void> {
    await this.request('PATCH', `/pulls/${prNumber}`, { state: 'closed' })
  }

  async approvePr(prNumber: number, body: string): Promise<void> {
    await this.request('POST', `/pulls/${prNumber}/reviews`, { event: 'APPROVE', body })
  }

  async requestReviewers(prNumber: number, reviewers: string[]): Promise<void> {
    await this.request('POST', `/pulls/${prNumber}/requested_reviewers`, { reviewers })
  }

  async ensureLabel(name: string, color: string): Promise<void> {
    const res = await this.get(`/labels/${encodeURIComponent(name)}`)
    if (!res.ok) {
      await this.request('POST', '/labels', { name, color, description: 'Slopper PR trust analysis label' })
    }
  }

  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    await this.request('POST', `/issues/${issueNumber}/labels`, { labels })
  }

  async removeSlopperLabels(issueNumber: number): Promise<void> {
    const res = await this.get(`/issues/${issueNumber}/labels`)
    const labels = await res.json() as { name: string }[]
    for (const label of labels) {
      if (label.name.startsWith('slopper/')) {
        try {
          await ghFetch(`${API}/repos/${this.owner}/${this.repo}/issues/${issueNumber}/labels/${encodeURIComponent(label.name)}`, {
            method: 'DELETE', headers: { Authorization: `token ${this.token}` }
          })
        } catch { /* race */ }
      }
    }
  }

  async getFileContent(path: string): Promise<string | null> {
    const res = await this.get(`/contents/${path}`)
    if (!res.ok) return null
    const data = await res.json() as { content: string }
    return atob(data.content.replace(/\n/g, ''))
  }

  async createOrUpdateFile(path: string, message: string, content: string): Promise<void> {
    const existingRes = await this.get(`/contents/${path}`)

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

    const body: Record<string, unknown> = { message, content: btoa(finalContent) }
    if (sha) body.sha = sha

    await ghFetch(`${API}/repos/${this.owner}/${this.repo}/contents/${path}`, {
      method: 'PUT',
      headers: { Authorization: `token ${this.token}` },
      body: JSON.stringify(body)
    })
  }

  async getDefaultBranch(): Promise<string> {
    const res = await this.get('')
    const data = await res.json() as { default_branch: string }
    return data.default_branch
  }

  async getCollaboratorPermission(username: string): Promise<string> {
    const res = await this.get(`/collaborators/${username}/permission`)
    const data = await res.json() as { permission: string }
    return data.permission
  }

  async addReaction(commentId: number, reaction: string): Promise<void> {
    await this.request('POST', `/issues/comments/${commentId}/reactions`, { content: reaction })
  }

  async createVouchPr(username: string, content: string): Promise<number> {
    return this.createSlopperPr({
      action: 'vouch', username, content, dir: 'vouched',
      body: `Adding **@${username}** to the vouched contributors list.\n\n` +
        `Requested via \`/slopper vouch\`. This PR was created automatically by Slopper.`
    })
  }

  async createBanPr(username: string, content: string): Promise<number> {
    return this.createSlopperPr({
      action: 'ban', username, content, dir: 'banned',
      body: `Adding **@${username}** to the banned contributors list.\n\n` +
        `Requested via \`/slopper report\`. This PR was created automatically by Slopper.\n\n` +
        `To unban this user, close this PR (or delete the file if already merged).`
    })
  }

  async createReportPr(
    username: string, content: string,
    sourceRepo: string, pr: number, reporter: string
  ): Promise<number> {
    return this.createSlopperPr({
      action: 'report', username, content,
      path: `risky_users/${username}`,
      branch: `slopper/report-${username}-${Date.now()}`,
      commitMessage: `slopper: report ${username} (via ${sourceRepo}#${pr})`,
      append: true,
      body: `Adding **@${username}** to the risky users list.\n\n` +
        `- **Reported by:** @${reporter}\n` +
        `- **Source:** ${sourceRepo}#${pr}\n` +
        `- **Reason:** \`/slopper report\`\n\n` +
        `To unban this user, close this PR (or delete the file if already merged).\n\n` +
        `This PR was created automatically by [Slopper](https://github.com/Sloppers/Slopper).`
    })
  }

  private async createSlopperPr(opts: {
    action: string
    username: string
    content: string
    body: string
    dir?: string
    path?: string
    branch?: string
    commitMessage?: string
    append?: boolean
  }): Promise<number> {
    const defaultBranch = await this.getDefaultBranch()
    const branch = opts.branch ?? `slopper/${opts.action}-${opts.username}`
    const path = opts.path ?? `.slopper.d/${opts.dir}/${opts.username}`
    const commitMessage = opts.commitMessage ?? `slopper: ${opts.action} ${opts.username}`

    const refRes = await this.get(`/git/ref/heads/${defaultBranch}`)
    const refData = await refRes.json() as { object: { sha: string } }

    await this.request('POST', '/git/refs', {
      ref: `refs/heads/${branch}`, sha: refData.object.sha
    })

    let fileContent = opts.content
    let sha: string | undefined

    if (opts.append) {
      const existingRes = await ghFetch(
        `${API}/repos/${this.owner}/${this.repo}/contents/${path}?ref=${branch}`,
        { headers: { Authorization: `token ${this.token}` } }
      )
      if (existingRes.ok) {
        const existing = await existingRes.json() as { sha: string; content: string }
        sha = existing.sha
        const oldContent = atob(existing.content.replace(/\n/g, ''))
        fileContent = `${oldContent}\n---\n${opts.content}`
      }
    }

    const putBody: Record<string, unknown> = {
      message: commitMessage,
      content: btoa(fileContent),
      branch
    }
    if (sha) putBody.sha = sha

    const fileRes = await ghFetch(
      `${API}/repos/${this.owner}/${this.repo}/contents/${path}`,
      { method: 'PUT', headers: { Authorization: `token ${this.token}` }, body: JSON.stringify(putBody) }
    )
    if (!fileRes.ok) {
      const err = await fileRes.text()
      throw new Error(`Failed to create file on branch: ${err}`)
    }

    const prRes = await this.request('POST', '/pulls', {
      title: `slopper: ${opts.action} ${opts.username}`,
      head: branch,
      base: defaultBranch,
      body: opts.body
    })
    if (!prRes.ok) {
      const err = await prRes.text()
      throw new Error(`Failed to create PR: ${err}`)
    }
    const prData = await prRes.json() as { number: number }
    return prData.number
  }

  private get(path: string): Promise<Response> {
    return ghFetch(`${API}/repos/${this.owner}/${this.repo}${path}`, {
      headers: { Authorization: `token ${this.token}` }
    })
  }

  private request(method: string, path: string, body: unknown): Promise<Response> {
    return ghFetch(`${API}/repos/${this.owner}/${this.repo}${path}`, {
      method,
      headers: { Authorization: `token ${this.token}` },
      body: JSON.stringify(body)
    })
  }
}

async function ghFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/vnd.github.v3+json')
  headers.set('User-Agent', 'slopper-bot/1.0')
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
