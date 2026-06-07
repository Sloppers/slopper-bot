import { API, ghFetch, get, request, type ClientContext } from './fetch'
import { getDefaultBranch } from './files'

interface SlopperPrOpts {
  action: string
  username: string
  content: string
  body: string
  dir?: string
  path?: string
  branch?: string
  commitMessage?: string
  append?: boolean
}

async function createSlopperPr(ctx: ClientContext, opts: SlopperPrOpts): Promise<number> {
  const defaultBranch = await getDefaultBranch(ctx)
  const branch = opts.branch ?? `slopper/${opts.action}-${opts.username}`
  const path = opts.path ?? `.slopper.d/${opts.dir}/${opts.username}`
  const commitMessage = opts.commitMessage ?? `slopper: ${opts.action} ${opts.username}`

  const refRes = await get(ctx, `/git/ref/heads/${defaultBranch}`)
  const refData = await refRes.json() as { object: { sha: string } }

  await request(ctx, 'POST', '/git/refs', {
    ref: `refs/heads/${branch}`, sha: refData.object.sha
  })

  let fileContent = opts.content
  let sha: string | undefined

  if (opts.append) {
    const existingRes = await ghFetch(
      `${API}/repos/${ctx.owner}/${ctx.repo}/contents/${path}?ref=${branch}`,
      { headers: { Authorization: `token ${ctx.token}` } }
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
    `${API}/repos/${ctx.owner}/${ctx.repo}/contents/${path}`,
    { method: 'PUT', headers: { Authorization: `token ${ctx.token}` }, body: JSON.stringify(putBody) }
  )
  if (!fileRes.ok) {
    const err = await fileRes.text()
    throw new Error(`Failed to create file on branch: ${err}`)
  }

  const prRes = await request(ctx, 'POST', '/pulls', {
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

export async function createVouchPr(ctx: ClientContext, username: string, content: string): Promise<number> {
  return createSlopperPr(ctx, {
    action: 'vouch', username, content, dir: 'vouched',
    body: `Adding **@${username}** to the vouched contributors list.\n\n` +
      `Requested via \`/slopper vouch\`. This PR was created automatically by Slopper.`
  })
}

export async function createBanPr(ctx: ClientContext, username: string, content: string): Promise<number> {
  return createSlopperPr(ctx, {
    action: 'ban', username, content, dir: 'banned',
    body: `Adding **@${username}** to the banned contributors list.\n\n` +
      `Requested via \`/slopper report\`. This PR was created automatically by Slopper.\n\n` +
      `To unban this user, close this PR (or delete the file if already merged).`
  })
}

export async function createReportPr(
  ctx: ClientContext, username: string, content: string,
  sourceRepo: string, pr: number, reporter: string
): Promise<number> {
  return createSlopperPr(ctx, {
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
