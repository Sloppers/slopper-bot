import { API, ghFetch, get, type ClientContext } from './fetch'

export async function getFileContent(ctx: ClientContext, path: string): Promise<string | null> {
  const res = await get(ctx, `/contents/${path}`)
  if (!res.ok) return null
  const data = await res.json() as { content: string }
  return atob(data.content.replace(/\n/g, ''))
}

export async function createOrUpdateFile(
  ctx: ClientContext, path: string, message: string, content: string
): Promise<void> {
  const existingRes = await get(ctx, `/contents/${path}`)

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

  await ghFetch(`${API}/repos/${ctx.owner}/${ctx.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { Authorization: `token ${ctx.token}` },
    body: JSON.stringify(body)
  })
}

export async function getDefaultBranch(ctx: ClientContext): Promise<string> {
  const res = await get(ctx, '')
  const data = await res.json() as { default_branch: string }
  return data.default_branch
}
