import { createAuthClient } from "better-auth/client"
import { getDashboardApiBaseUrl, getDashboardWebBaseUrl } from "./apiClient.ts"

export const DASHBOARD_AUTH_BASE_PATH = "/auth"

export type GoogleSignInOptions = {
  provider: "google"
  callbackURL: string
}

export type SocialSignInResult = {
  error?: {
    message?: string | undefined
  } | null
}

export type DashboardAuthClient = {
  signIn: {
    social: (options: GoogleSignInOptions) => Promise<SocialSignInResult | null | undefined>
  }
}

export const authClient = createAuthClient({
  basePath: DASHBOARD_AUTH_BASE_PATH,
  baseURL: getDashboardAuthClientBaseUrl()
})

export function getDashboardAuthClientBaseUrl(): string {
  return getDashboardApiBaseUrl()
}

export function getGoogleSignInCallbackUrl(): string {
  return `${getDashboardWebBaseUrl()}/dashboard`
}

export function buildGoogleSignInOptions(): GoogleSignInOptions {
  return {
    provider: "google",
    callbackURL: getGoogleSignInCallbackUrl()
  }
}

export function getGoogleSignInErrorMessage(result: SocialSignInResult | null | undefined): string | null {
  const message = result?.error?.message
  return message && message.trim() ? message : null
}

export async function signInWithGoogle(client: DashboardAuthClient = authClient): Promise<void> {
  const result = await client.signIn.social(buildGoogleSignInOptions())
  const message = getGoogleSignInErrorMessage(result)
  if (message) {
    throw new Error(message)
  }
}
