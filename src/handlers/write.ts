import type { WriteRequest, Env } from '../types'
import { verifyOidcToken, getTokenForOrg, checkRateLimit } from '../auth'
import { GitHubClient } from '../client'
import { json, buildReportEntry } from '../helpers'

export async function handleWriteAction(body: WriteRequest, env: Env, audience: string): Promise<Response> {
  const { oidcToken, owner, repo, action } = body

  if (!oidcToken || !owner || !repo || !action) {
    return json({ error: 'missing fields' }, 400)
  }

  let claims
  try {
    claims = await verifyOidcToken(oidcToken, audience)
  } catch (err) {
    return json({ error: `OIDC verification failed: ${err instanceof Error ? err.message : err}` }, 401)
  }

  if (claims.repository !== `${owner}/${repo}`) {
    return json({ error: `Repository mismatch: token is for ${claims.repository}, request targets ${owner}/${repo}` }, 403)
  }

  const account = claims.repository_owner

  if (action.type === 'globalReport') {
    const rl = await checkRateLimit(env.RATE_LIMIT, account, 'report')
    if (!rl.allowed) {
      return json({ error: 'Rate limit exceeded for reports', resetAt: rl.resetAt }, 429)
    }
    return handleGlobalReport(action, claims, env)
  }

  const rl = await checkRateLimit(env.RATE_LIMIT, account, 'write')
  if (!rl.allowed) {
    return json({ error: 'Rate limit exceeded', resetAt: rl.resetAt }, 429)
  }

  try {
    const token = await getTokenForOrg(env, owner)
    const client = new GitHubClient(token, owner, repo)
    const result = await executeAction(client, action)
    return json({ ok: true, ...result })
  } catch (err) {
    return json({ error: `Action failed: ${err instanceof Error ? err.message : err}` }, 500)
  }
}

async function handleGlobalReport(
  action: { type: 'globalReport'; username: string; reporter: string; pr: number },
  claims: { repository: string; actor: string },
  env: Env
): Promise<Response> {
  const sourceRepo = claims.repository
  const reporter = claims.actor

  const [communityOwner, communityRepo] = env.COMMUNITY_REPO.split('/')

  try {
    const token = await getTokenForOrg(env, communityOwner)
    const client = new GitHubClient(token, communityOwner, communityRepo)
    const entry = buildReportEntry(reporter, sourceRepo, action.pr)
    const prNumber = await client.createReportPr(
      action.username, entry,
      sourceRepo, action.pr, reporter
    )
    return json({ ok: true, reported: action.username, prNumber })
  } catch (err) {
    return json({ error: `Failed to report: ${err instanceof Error ? err.message : err}` }, 500)
  }
}

async function executeAction(
  client: GitHubClient,
  action: WriteRequest['action']
): Promise<Record<string, unknown>> {
  switch (action.type) {
    case 'upsertComment':
      await client.upsertComment(action.pr, action.marker, action.body)
      return {}

    case 'createComment':
      await client.createComment(action.pr, action.body)
      return {}

    case 'ensureLabel':
      await client.ensureLabel(action.name, action.color)
      return {}

    case 'applyLabels':
      await client.addLabels(action.pr, action.labels)
      return {}

    case 'removeSlopperLabels':
      await client.removeSlopperLabels(action.pr)
      return {}

    case 'closePr':
      await client.closePr(action.pr)
      return {}

    case 'approvePr':
      await client.approvePr(action.pr, action.body)
      return {}

    case 'requestReviewers':
      await client.requestReviewers(action.pr, action.reviewers)
      return {}

    case 'createOrUpdateFile':
      await client.createOrUpdateFile(action.path, action.message, action.content)
      return {}

    case 'createVouchPr': {
      const prNumber = await client.createVouchPr(action.username, action.content)
      return { prNumber }
    }

    case 'createBanPr': {
      const prNumber = await client.createBanPr(action.username, action.content)
      return { prNumber }
    }

    default:
      throw new Error(`Unknown action type: ${(action as { type: string }).type}`)
  }
}
