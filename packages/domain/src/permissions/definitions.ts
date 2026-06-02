export const platformPermissions = [
  "platform.manage_access",
  "platform.manage_catalog",
  "platform.manage_organizations",
  "platform.manage_venues"
] as const

export const organizationPermissions = [
  "organization.manage_members",
  "organization.manage_profile",
  "organization.request_venue_access"
] as const

export const venueEventPermissions = [
  "venue.manage_profile",
  "venue.grant_access",
  "venue.create_event",
  "event.manage",
  "event.operate_queue",
  "event.view_stats"
] as const

export const permissions = [...platformPermissions, ...organizationPermissions, ...venueEventPermissions] as const

export type PlatformPermission = (typeof platformPermissions)[number]
export type OrganizationPermission = (typeof organizationPermissions)[number]
export type VenueEventPermission = (typeof venueEventPermissions)[number]
export type EventPermission = Extract<VenueEventPermission, `event.${string}`>
export type Permission = (typeof permissions)[number]

export const platformRoles = ["platform_owner", "platform_admin"] as const
export const organizationRoles = ["owner", "admin", "booking_manager", "host", "operator", "viewer"] as const
export const venueAccessRoles = ["owner", "manager", "event_creator", "karaoke_operator", "viewer"] as const
export const eventStaffRoles = ["lead_host", "host", "queue_operator", "viewer"] as const

export type PlatformRole = (typeof platformRoles)[number]
export type OrganizationRole = (typeof organizationRoles)[number]
export type VenueAccessRole = (typeof venueAccessRoles)[number]
export type EventStaffRole = (typeof eventStaffRoles)[number]

export const platformRolePermissions: Record<PlatformRole, readonly PlatformPermission[]> = {
  platform_owner: [
    "platform.manage_access",
    "platform.manage_catalog",
    "platform.manage_organizations",
    "platform.manage_venues"
  ],
  platform_admin: ["platform.manage_access", "platform.manage_organizations", "platform.manage_venues"]
}

export const organizationRolePermissions: Record<OrganizationRole, readonly OrganizationPermission[]> = {
  owner: ["organization.manage_members", "organization.manage_profile", "organization.request_venue_access"],
  admin: ["organization.manage_members", "organization.manage_profile", "organization.request_venue_access"],
  booking_manager: ["organization.request_venue_access"],
  host: [],
  operator: [],
  viewer: []
}

export const venueAccessRolePermissions: Record<VenueAccessRole, readonly VenueEventPermission[]> = {
  owner: [
    "venue.manage_profile",
    "venue.grant_access",
    "venue.create_event",
    "event.manage",
    "event.operate_queue",
    "event.view_stats"
  ],
  manager: ["venue.manage_profile", "venue.create_event", "event.manage", "event.operate_queue", "event.view_stats"],
  event_creator: ["venue.create_event"],
  karaoke_operator: ["event.operate_queue", "event.view_stats"],
  viewer: ["event.view_stats"]
}

export const eventStaffRolePermissions: Record<EventStaffRole, readonly EventPermission[]> = {
  lead_host: ["event.manage", "event.operate_queue", "event.view_stats"],
  host: ["event.operate_queue", "event.view_stats"],
  queue_operator: ["event.operate_queue"],
  viewer: ["event.view_stats"]
}

export function isPlatformRole(role: string): role is PlatformRole {
  return (platformRoles as readonly string[]).includes(role)
}

export function isOrganizationRole(role: string): role is OrganizationRole {
  return (organizationRoles as readonly string[]).includes(role)
}

export function isVenueAccessRole(role: string): role is VenueAccessRole {
  return (venueAccessRoles as readonly string[]).includes(role)
}

export function isEventStaffRole(role: string): role is EventStaffRole {
  return (eventStaffRoles as readonly string[]).includes(role)
}

function isEventPermission(permission: VenueEventPermission): permission is EventPermission {
  return permission.startsWith("event.")
}

export function hasPlatformRolePermission(role: string, permission: PlatformPermission): boolean {
  if (!isPlatformRole(role)) {
    return false
  }
  const permissions: readonly PlatformPermission[] = platformRolePermissions[role]
  return permissions.includes(permission)
}

export function hasOrganizationRolePermission(role: string, permission: OrganizationPermission): boolean {
  if (!isOrganizationRole(role)) {
    return false
  }
  const permissions: readonly OrganizationPermission[] = organizationRolePermissions[role]
  return permissions.includes(permission)
}

export function hasVenueAccessRolePermission(role: string, permission: VenueEventPermission): boolean {
  if (!isVenueAccessRole(role)) {
    return false
  }
  const permissions: readonly VenueEventPermission[] = venueAccessRolePermissions[role]
  return permissions.includes(permission)
}

export function hasEventStaffRolePermission(role: string, permission: VenueEventPermission): boolean {
  if (!isEventStaffRole(role) || !isEventPermission(permission)) {
    return false
  }
  const permissions: readonly EventPermission[] = eventStaffRolePermissions[role]
  return permissions.includes(permission)
}
