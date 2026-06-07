export const API = 'https://api.github.com'
const UA = 'slopper-bot/1.0'

export interface ClientContext {
  token: string
  owner: string
  repo: string
}

export function get(ctx: ClientContext, path: string): Promise<Response> {
  return ghFetch(`${API}/repos/${ctx.owner}/${ctx.repo}${path}`, {
    headers: { Authorization: `token ${ctx.token}` }
  })
}

export function request(ctx: ClientContext, method: string, path: string, body: unknown): Promise<Response> {
  return ghFetch(`${API}/repos/${ctx.owner}/${ctx.repo}${path}`, {
    method,
    headers: { Authorization: `token ${ctx.token}` },
    body: JSON.stringify(body)
  })
}

export async function ghFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set('Accept', 'application/vnd.github.v3+json')
  headers.set('User-Agent', UA)
  if (init?.body) headers.set('Content-Type', 'application/json')
  return fetch(url, { ...init, headers })
}
