export type InviteClipboard = {
  writeText(value: string): Promise<void>
}

export type InviteCopyResult = "copied" | "failed" | "unavailable"

export async function copyInviteUrl(inviteUrl: string, clipboard?: InviteClipboard): Promise<InviteCopyResult> {
  const target = clipboard ?? (typeof navigator === "undefined" ? undefined : navigator.clipboard)
  if (!target?.writeText) {
    return "unavailable"
  }

  try {
    await target.writeText(inviteUrl)
    return "copied"
  } catch {
    return "failed"
  }
}
