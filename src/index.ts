import type { Env, IssueCommentEvent } from './types'
import { verifySignature } from './verify'
import { handleReport } from './report'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const signature = request.headers.get('X-Hub-Signature-256')
    if (!signature) {
      return new Response('Missing signature', { status: 401 })
    }

    const body = await request.text()

    const valid = await verifySignature(body, signature, env.WEBHOOK_SECRET)
    if (!valid) {
      return new Response('Invalid signature', { status: 401 })
    }

    const eventType = request.headers.get('X-GitHub-Event')

    if (eventType === 'ping') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    if (eventType === 'issue_comment') {
      const event = JSON.parse(body) as IssueCommentEvent
      return handleReport(event, env)
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
}
