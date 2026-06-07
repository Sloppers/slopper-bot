import type { IssueCommentEvent, Env } from './types'
import {
  createAppJwt,
  getInstallationToken,
  getCollaboratorPermission,
  createOrUpdateFile,
  getFileContent,
  addReaction
} from './github'

const REPORT_REGEX = /^\/slopper\s+report\s*$/im

export async function handleReport(event: IssueCommentEvent, env: Env): Promise<Response> {
  if (event.action !== 'created') return ok()
  if (!event.issue.pull_request) return ok()
  if (!REPORT_REGEX.test(event.comment.body)) return ok()
  if (!event.installation) return error('No installation context')

  const reporter = event.comment.user.login
  const reportedUser = event.issue.user.login
  const prNumber = event.issue.number
  const repoOwner = event.repository.owner.login
  const repoName = event.repository.name
  const repoFullName = event.repository.full_name
  const commentId = event.comment.id
  const installationId = event.installation.id

  if (event.comment.user.type === 'Bot') return ok()
  if (reporter === reportedUser) {
    await reactSafe(env, installationId, repoOwner, repoName, commentId, 'confused')
    return ok()
  }

  const jwt = await createAppJwt(env.APP_ID, env.PRIVATE_KEY)
  const token = await getInstallationToken(jwt, installationId)

  const permission = await getCollaboratorPermission(token, repoOwner, repoName, reporter)
  if (!['admin', 'maintain'].includes(permission)) {
    await addReaction(token, repoOwner, repoName, commentId, 'confused')
    return ok()
  }

  const path = `risky_users/${reportedUser}`
  const existing = await getFileContent(token, env.COMMUNITY_REPO, path)

  const entry = [
    `reporter: ${reporter}`,
    `repo: ${repoFullName}`,
    `pr: #${prNumber}`,
    `reason: /slopper report`,
    `date: ${new Date().toISOString()}`
  ].join('\n')

  if (existing && existing.includes(`reporter: ${reporter}`) && existing.includes(`repo: ${repoFullName}`) && existing.includes(`pr: #${prNumber}`)) {
    await addReaction(token, repoOwner, repoName, commentId, 'rocket')
    return ok()
  }

  await createOrUpdateFile(
    token,
    env.COMMUNITY_REPO,
    path,
    `report: ${reportedUser} (via ${repoFullName}#${prNumber})`,
    entry
  )

  await addReaction(token, repoOwner, repoName, commentId, 'rocket')
  return ok()
}

async function reactSafe(
  env: Env,
  installationId: number,
  owner: string,
  repo: string,
  commentId: number,
  reaction: string
): Promise<void> {
  try {
    const jwt = await createAppJwt(env.APP_ID, env.PRIVATE_KEY)
    const token = await getInstallationToken(jwt, installationId)
    await addReaction(token, owner, repo, commentId, reaction)
  } catch { /* best effort */ }
}

function ok(): Response {
  return new Response(JSON.stringify({ ok: true }), { status: 200 })
}

function error(msg: string): Response {
  return new Response(JSON.stringify({ error: msg }), { status: 400 })
}
