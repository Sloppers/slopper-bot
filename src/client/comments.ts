import { API, ghFetch, get, request, type ClientContext } from './fetch'

export async function getComment(
  owner: string, repo: string, commentId: number
): Promise<{ body: string; user: { login: string; type: string } } | null> {
  const res = await fetch(`${API}/repos/${owner}/${repo}/issues/comments/${commentId}`, {
    headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'slopper-bot/1.0' }
  })
  if (!res.ok) return null
  return await res.json() as { body: string; user: { login: string; type: string } }
}

export async function listComments(
  ctx: ClientContext, issueNumber: number
): Promise<{ id: number; body: string }[]> {
  const res = await get(ctx, `/issues/${issueNumber}/comments?per_page=100`)
  return await res.json() as { id: number; body: string }[]
}

export async function updateComment(ctx: ClientContext, commentId: number, body: string): Promise<void> {
  await request(ctx, 'PATCH', `/issues/comments/${commentId}`, { body })
}

export async function createComment(ctx: ClientContext, issueNumber: number, body: string): Promise<void> {
  await request(ctx, 'POST', `/issues/${issueNumber}/comments`, { body })
}

export async function upsertComment(
  ctx: ClientContext, issueNumber: number, marker: string, body: string
): Promise<void> {
  const comments = await listComments(ctx, issueNumber)
  const existing = comments.find(c => c.body?.includes(marker))
  if (existing) {
    await updateComment(ctx, existing.id, body)
  } else {
    await createComment(ctx, issueNumber, body)
  }
}
