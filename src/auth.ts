import type { Env } from './types'
import { GitHubClient } from './github'

export async function getTokenForOrg(env: Env, org: string): Promise<string> {
  const jwt = await GitHubClient.createAppJwt(env.APP_ID, env.PRIVATE_KEY)
  const installationId = await GitHubClient.getAppInstallation(jwt, org)
  if (!installationId) throw new Error(`Slopper App is not installed on ${org}`)
  return GitHubClient.getInstallationToken(jwt, installationId)
}

export async function getTokenForInstallation(env: Env, installationId: number): Promise<string> {
  const jwt = await GitHubClient.createAppJwt(env.APP_ID, env.PRIVATE_KEY)
  return GitHubClient.getInstallationToken(jwt, installationId)
}
