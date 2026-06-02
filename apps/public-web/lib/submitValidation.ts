import type { SubmitSongRequestInput } from "./apiClient.ts"

export type SubmitValidationResult =
  | {
      ok: true
      value: SubmitSongRequestInput
    }
  | {
      ok: false
      errors: string[]
    }

export function validateSubmitSongRequest(input: Record<string, string>): SubmitValidationResult {
  const errors: string[] = []
  const singerName = input.singerName?.trim() ?? ""
  const songTitle = input.songTitle?.trim() ?? ""
  const songArtist = input.songArtist?.trim() ?? ""
  const sourceId = input.sourceId?.trim() ?? ""
  const sourceTrackId = input.sourceTrackId?.trim() ?? ""
  const songUrl = input.songUrl?.trim() ?? ""
  const note = input.note?.trim() ?? ""

  requireLength(errors, "Imię osoby śpiewającej", singerName, 1, 80)
  requireLength(errors, "Tytuł piosenki", songTitle, 1, 200)
  requireLength(errors, "Wykonawca", songArtist, 1, 200)
  requireLength(errors, "Źródło", sourceId, 1, 40)

  if (sourceTrackId.length > 120) {
    errors.push("Identyfikator utworu jest za długi.")
  }
  if (songUrl.length > 1000) {
    errors.push("Link do piosenki jest za długi.")
  }
  if (note.length > 500) {
    errors.push("Notatka jest za długa.")
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const value: SubmitSongRequestInput = {
    singerName,
    sourceId,
    songTitle,
    songArtist
  }
  if (sourceTrackId) {
    value.sourceTrackId = sourceTrackId
  }
  if (songUrl) {
    value.songUrl = songUrl
  }
  if (note) {
    value.note = note
  }

  return { ok: true, value }
}

function requireLength(errors: string[], label: string, value: string, min: number, max: number): void {
  if (value.length < min) {
    errors.push(`${label} jest wymagane.`)
  } else if (value.length > max) {
    errors.push(`${label} jest za długie.`)
  }
}
