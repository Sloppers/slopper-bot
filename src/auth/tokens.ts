import type { Env } from '../types'
import { createAppJwt } from './jwt'
import { ghFetch, API } from '../client/fetch'

export async function getInstallationToken(jwt: string, installationId: number): Promise<string> {
  const res = await ghFetch(`${API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}` }
  })
  const data = await res.json() as { token: string }
  return data.token
}

export async function getAppInstallation(jwt: string, org: string): Promise<number | null> {
  const res = await ghFetch(`${API}/app/installations`, {
    headers: { Authorization: `Bearer ${jwt}` }
  })
  if (!res.ok) return null
  const installations = await res.json() as { id: number; account: { login: string } }[]
  const match = installations.find(i => i.account.login.toLowerCase() === org.toLowerCase())
  return match?.id ?? null
}

export async function getTokenForOrg(env: Env, org: string): Promise<string> {
  const jwt = await createAppJwt(env.APP_ID, env.PRIVATE_KEY)
  const installationId = await getAppInstallation(jwt, org)
  if (!installationId) throw new Error(`Slopper App is not installed on ${org}`)
  return getInstallationToken(jwt, installationId)
}

export async function getTokenForInstallation(env: Env, installationId: number): Promise<string> {
  const jwt = await createAppJwt(env.APP_ID, env.PRIVATE_KEY)
  return getInstallationToken(jwt, installationId)
}
