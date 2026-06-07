import type { IssueCommentEvent, Env } from '../types'
import { getTokenForOrg, getTokenForInstallation, checkRateLimit } from '../auth'
import { GitHubClient } from '../client'
import { json, buildReportEntry } from '../helpers'

const REPORT_REGEX = /^\/slopper\s+report\s*$/im

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

  if (event.comment.user.type === 'Bot') return json({ ok: true })
  if (reporter === reportedUser) {
    await reactSafe(env, event.installation.id, repoOwner, repoName, commentId, 'confused')
    return json({ ok: true })
  }

  const repoToken = await getTokenForInstallation(env, event.installation.id)
  const repoClient = new GitHubClient(repoToken, repoOwner, repoName)

  const permission = await repoClient.getCollaboratorPermission(reporter)
  if (!['admin', 'maintain'].includes(permission)) {
    await repoClient.addReaction(commentId, 'confused')
    return json({ ok: true })
  }

  const rl = await checkRateLimit(env.RATE_LIMIT, repoOwner, 'report')
  if (!rl.allowed) {
    await repoClient.addReaction(commentId, 'confused')
    return json({ error: 'Rate limit exceeded for reports', resetAt: rl.resetAt }, 429)
  }

  const communityToken = await getTokenForOrg(env, env.COMMUNITY_REPO.split('/')[0])
  const [communityOwner, communityRepo] = env.COMMUNITY_REPO.split('/')
  const communityClient = new GitHubClient(communityToken, communityOwner, communityRepo)

  const existing = await communityClient.getFileContent(`risky_users/${reportedUser}`)
  const entry = buildReportEntry(reporter, `${repoOwner}/${repoName}`, prNumber)

  if (existing && existing.includes(`reporter: ${reporter}`) && existing.includes(`repo: ${repoOwner}/${repoName}`) && existing.includes(`pr: #${prNumber}`)) {
    await repoClient.addReaction(commentId, 'rocket')
    return json({ ok: true })
  }

  await communityClient.createReportPr(
    reportedUser, entry,
    `${repoOwner}/${repoName}`, prNumber, reporter
  )

  await repoClient.addReaction(commentId, 'rocket')
  return json({ ok: true })
}

async function reactSafe(
  env: Env, installationId: number,
  owner: string, repo: string,
  commentId: number, reaction: string
): Promise<void> {
  try {
    const token = await getTokenForInstallation(env, installationId)
    const client = new GitHubClient(token, owner, repo)
    await client.addReaction(commentId, reaction)
  } catch { /* best effort */ }
}
