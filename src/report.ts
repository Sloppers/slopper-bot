import type { ReportRequest, IssueCommentEvent, Env } from './types'
import { getTokenForOrg, getTokenForInstallation } from './auth'
import { GitHubClient } from './github'
import { json, buildReportEntry } from './helpers'

const REPORT_REGEX = /^\/slopper\s+report\s*$/im

export async function handleApiReport(body: ReportRequest, env: Env): Promise<Response> {
  const { owner, repo, pr, reportedUser, commentId } = body

  if (!owner || !repo || !pr || !reportedUser || !commentId) {
    return json({ error: 'missing fields' }, 400)
  }

  const comment = await GitHubClient.getComment(owner, repo, commentId)
  if (!comment) return json({ error: 'comment not found' }, 404)
  if (!REPORT_REGEX.test(comment.body)) return json({ error: 'comment is not a /slopper report' }, 400)

  const reporter = comment.user.login
  if (comment.user.type === 'Bot') return json({ ok: true, skipped: 'bot' })
  if (reporter === reportedUser) return json({ ok: true, skipped: 'self-report' })

  const token = await getTokenForOrg(env, env.COMMUNITY_REPO.split('/')[0])
  const [communityOwner, communityRepo] = env.COMMUNITY_REPO.split('/')
  const client = new GitHubClient(token, communityOwner, communityRepo)

  const existing = await client.getFileContent(`risky_users/${reportedUser}`)
  const entry = buildReportEntry(reporter, `${owner}/${repo}`, pr)

  if (existing && existing.includes(`reporter: ${reporter}`) && existing.includes(`repo: ${owner}/${repo}`) && existing.includes(`pr: #${pr}`)) {
    return json({ ok: true, skipped: 'duplicate' })
  }

  await client.createOrUpdateFile(
    `risky_users/${reportedUser}`,
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

  const communityToken = await getTokenForOrg(env, env.COMMUNITY_REPO.split('/')[0])
  const [communityOwner, communityRepo] = env.COMMUNITY_REPO.split('/')
  const communityClient = new GitHubClient(communityToken, communityOwner, communityRepo)

  const existing = await communityClient.getFileContent(`risky_users/${reportedUser}`)
  const entry = buildReportEntry(reporter, `${repoOwner}/${repoName}`, prNumber)

  if (existing && existing.includes(`reporter: ${reporter}`) && existing.includes(`repo: ${repoOwner}/${repoName}`) && existing.includes(`pr: #${prNumber}`)) {
    await repoClient.addReaction(commentId, 'rocket')
    return json({ ok: true })
  }

  await communityClient.createOrUpdateFile(
    `risky_users/${reportedUser}`,
    `report: ${reportedUser} (via ${repoOwner}/${repoName}#${prNumber})`,
    entry
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
