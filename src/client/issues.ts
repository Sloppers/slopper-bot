import { API, ghFetch, get, request, type ClientContext } from './fetch'

export async function closePr(ctx: ClientContext, prNumber: number): Promise<void> {
  await request(ctx, 'PATCH', `/pulls/${prNumber}`, { state: 'closed' })
}

export async function approvePr(ctx: ClientContext, prNumber: number, body: string): Promise<void> {
  await request(ctx, 'POST', `/pulls/${prNumber}/reviews`, { event: 'APPROVE', body })
}

export async function requestReviewers(ctx: ClientContext, prNumber: number, reviewers: string[]): Promise<void> {
  await request(ctx, 'POST', `/pulls/${prNumber}/requested_reviewers`, { reviewers })
}

export async function ensureLabel(ctx: ClientContext, name: string, color: string): Promise<void> {
  const res = await get(ctx, `/labels/${encodeURIComponent(name)}`)
  if (!res.ok) {
    await request(ctx, 'POST', '/labels', { name, color, description: 'Slopper PR trust analysis label' })
  }
}

export async function addLabels(ctx: ClientContext, issueNumber: number, labels: string[]): Promise<void> {
  await request(ctx, 'POST', `/issues/${issueNumber}/labels`, { labels })
}

export async function removeSlopperLabels(ctx: ClientContext, issueNumber: number): Promise<void> {
  const res = await get(ctx, `/issues/${issueNumber}/labels`)
  const labels = await res.json() as { name: string }[]
  for (const label of labels) {
    if (label.name.startsWith('slopper/')) {
      try {
        await ghFetch(`${API}/repos/${ctx.owner}/${ctx.repo}/issues/${issueNumber}/labels/${encodeURIComponent(label.name)}`, {
          method: 'DELETE', headers: { Authorization: `token ${ctx.token}` }
        })
      } catch { /* race */ }
    }
  }
}

export async function getCollaboratorPermission(ctx: ClientContext, username: string): Promise<string> {
  const res = await get(ctx, `/collaborators/${username}/permission`)
  const data = await res.json() as { permission: string }
  return data.permission
}

export async function addReaction(ctx: ClientContext, commentId: number, reaction: string): Promise<void> {
  await request(ctx, 'POST', `/issues/comments/${commentId}/reactions`, { content: reaction })
}
