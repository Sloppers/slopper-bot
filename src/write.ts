import type { WriteRequest, Env } from './types'
import { verifyOidcToken } from './oidc'
import {
  createAppJwt,
  getInstallationToken,
  getAppInstallation,
  upsertComment,
  createIssueComment,
  ensureLabel,
  addLabels,
  removeSlopperLabels,
  closePr,
  approvePr,
  requestReviewers,
  createOrUpdateFile,
  createVouchPr
} from './github'

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

  const jwt = await createAppJwt(env.APP_ID, env.PRIVATE_KEY)
  const installationId = await getAppInstallation(jwt, owner)
  if (!installationId) {
    return json({ error: `Slopper App is not installed on ${owner}` }, 403)
  }

  const token = await getInstallationToken(jwt, installationId)

  try {
    const result = await executeAction(token, owner, repo, action)
    return json({ ok: true, ...result })
  } catch (err) {
    return json({ error: `Action failed: ${err instanceof Error ? err.message : err}` }, 500)
  }
}

async function executeAction(
  token: string,
  owner: string,
  repo: string,
  action: WriteRequest['action']
): Promise<Record<string, unknown>> {
  switch (action.type) {
    case 'upsertComment':
      await upsertComment(token, owner, repo, action.pr, action.marker, action.body)
      return {}

    case 'createComment':
      await createIssueComment(token, owner, repo, action.pr, action.body)
      return {}

    case 'ensureLabel':
      await ensureLabel(token, owner, repo, action.name, action.color)
      return {}

    case 'applyLabels':
      await addLabels(token, owner, repo, action.pr, action.labels)
      return {}

    case 'removeSlopperLabels':
      await removeSlopperLabels(token, owner, repo, action.pr)
      return {}

    case 'closePr':
      await closePr(token, owner, repo, action.pr)
      return {}

    case 'approvePr':
      await approvePr(token, owner, repo, action.pr, action.body)
      return {}

    case 'requestReviewers':
      await requestReviewers(token, owner, repo, action.pr, action.reviewers)
      return {}

    case 'createOrUpdateFile':
      await createOrUpdateFile(token, `${owner}/${repo}`, action.path, action.message, action.content)
      return {}

    case 'createVouchPr': {
      const prNumber = await createVouchPr(token, owner, repo, action.username, action.content)
      return { prNumber }
    }

    default:
      throw new Error(`Unknown action type: ${(action as { type: string }).type}`)
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
