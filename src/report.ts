import type { ReportRequest, IssueCommentEvent, Env } from './types'
import {
  createAppJwt,
  getInstallationToken,
  getCollaboratorPermission,
  createOrUpdateFile,
  getFileContent,
  addReaction,
  getAppInstallation,
  getComment
} from './github'

const REPORT_REGEX = /^\/slopper\s+report\s*$/im

export async function handleApiReport(body: ReportRequest, env: Env): Promise<Response> {
  const { owner, repo, pr, reportedUser, commentId } = body

  if (!owner || !repo || !pr || !reportedUser || !commentId) {
    return json({ error: 'missing fields' }, 400)
  }

  const comment = await getComment(owner, repo, commentId)
  if (!comment) {
    return json({ error: 'comment not found' }, 404)
  }

  if (!REPORT_REGEX.test(comment.body)) {
    return json({ error: 'comment is not a /slopper report' }, 400)
  }

  const reporter = comment.user.login

  if (comment.user.type === 'Bot') return json({ ok: true, skipped: 'bot' })
  if (reporter === reportedUser) return json({ ok: true, skipped: 'self-report' })

  const jwt = await createAppJwt(env.APP_ID, env.PRIVATE_KEY)
  const installation = await getAppInstallation(jwt, env.COMMUNITY_REPO.split('/')[0])
  if (!installation) {
    return json({ error: 'bot not installed on community repo org' }, 500)
  }

  const token = await getInstallationToken(jwt, installation)

  const path = `risky_users/${reportedUser}`
  const existing = await getFileContent(token, env.COMMUNITY_REPO, path)

  const entry = [
    `reporter: ${reporter}`,
    `repo: ${owner}/${repo}`,
    `pr: #${pr}`,
    `reason: /slopper report`,
    `date: ${new Date().toISOString()}`
  ].join('\n')

  if (existing && existing.includes(`reporter: ${reporter}`) && existing.includes(`repo: ${owner}/${repo}`) && existing.includes(`pr: #${pr}`)) {
    return json({ ok: true, skipped: 'duplicate' })
  }

  await createOrUpdateFile(
    token,
    env.COMMUNITY_REPO,
    path,
    `report: ${reportedUser} (via ${owner}/${repo}#${pr})`,
    entry
  )

  return json({ ok: true, reported: reportedUser })
}

export async function handleWebhookReport(event: IssueCommentEvent, env: Env): Promise<Response> {
  if (event.action !== 'created') return json({ ok: true })
  if (!event.issue.pull_request) return json({ ok: true })
  if (!REPORT_REGEX.test(event.comment.body)) return json({ ok: true })
  if (!event.installation) return json({ error: 'no installation' }, 400)

  const reporter = event.comment.user.login
  const reportedUser = event.issue.user.login
  const prNumber = event.issue.number
  const repoOwner = event.repository.owner.login
  const repoName = event.repository.name
  const commentId = event.comment.id
  const installationId = event.installation.id

  if (event.comment.user.type === 'Bot') return json({ ok: true })
  if (reporter === reportedUser) {
    await reactSafe(env, installationId, repoOwner, repoName, commentId, 'confused')
    return json({ ok: true })
  }

  const jwt = await createAppJwt(env.APP_ID, env.PRIVATE_KEY)
  const token = await getInstallationToken(jwt, installationId)

  const permission = await getCollaboratorPermission(token, repoOwner, repoName, reporter)
  if (!['admin', 'maintain'].includes(permission)) {
    await addReaction(token, repoOwner, repoName, commentId, 'confused')
    return json({ ok: true })
  }

  const path = `risky_users/${reportedUser}`
  const existing = await getFileContent(token, env.COMMUNITY_REPO, path)

  const entry = [
    `reporter: ${reporter}`,
    `repo: ${repoOwner}/${repoName}`,
    `pr: #${prNumber}`,
    `reason: /slopper report`,
    `date: ${new Date().toISOString()}`
  ].join('\n')

  if (existing && existing.includes(`reporter: ${reporter}`) && existing.includes(`repo: ${repoOwner}/${repoName}`) && existing.includes(`pr: #${prNumber}`)) {
    await addReaction(token, repoOwner, repoName, commentId, 'rocket')
    return json({ ok: true })
  }

  await createOrUpdateFile(
    token,
    env.COMMUNITY_REPO,
    path,
    `report: ${reportedUser} (via ${repoOwner}/${repoName}#${prNumber})`,
    entry
  )

  await addReaction(token, repoOwner, repoName, commentId, 'rocket')
  return json({ ok: true })
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

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
