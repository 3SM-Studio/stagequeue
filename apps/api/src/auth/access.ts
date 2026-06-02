import type { PlatformRole } from "@poza-nuta/domain/permissions"

export type DomainUserAccessStatus = "pending" | "active" | "disabled"

export type AuthenticatedDomainUser = {
  id: string
  email: string
  name: string | null
  status: DomainUserAccessStatus
}

export type AccessDecision = {
  dashboardAllowed: boolean
  reason: "unauthenticated" | "pending_approval" | "disabled" | "active_user" | "platform_role"
}

export function shouldBootstrapPlatformOwner(email: string, bootstrapEmail?: string): boolean {
  return Boolean(bootstrapEmail && normalizeEmail(email) === normalizeEmail(bootstrapEmail))
}

export function evaluateDashboardAccess(user: AuthenticatedDomainUser, roles: PlatformRole[]): AccessDecision {
  if (user.status === "disabled") {
    return { dashboardAllowed: false, reason: "disabled" }
  }

  if (roles.length > 0) {
    return { dashboardAllowed: true, reason: "platform_role" }
  }

  if (user.status === "active") {
    return { dashboardAllowed: true, reason: "active_user" }
  }

  return { dashboardAllowed: false, reason: "pending_approval" }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
