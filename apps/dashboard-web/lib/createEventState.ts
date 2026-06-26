import type { DashboardApiError, DashboardEventStatus } from "./apiClient.ts"
import { buildDashboardEventQueuePath } from "./apiClient.ts"

export type CreateDashboardEventFormInput = {
  venueId: string
  name: string
  slug: string
  status: Extract<DashboardEventStatus, "draft" | "scheduled" | "active">
  startsAt?: string
  endsAt?: string
  publicJoinEnabled: boolean
  publicQueueEnabled: boolean
}

export type CreateDashboardEventValidationResult =
  | {
      ok: true
      value: CreateDashboardEventFormInput
    }
  | {
      errors: string[]
      ok: false
    }

export function generateEventSlug(name: string): string {
  return name
    .replace(/\u0141/g, "L")
    .replace(/\u0142/g, "l")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
}

export function validateCreateEventInput(input: CreateDashboardEventFormInput): CreateDashboardEventValidationResult {
  const errors: string[] = []

  if (!input.venueId.trim()) {
    errors.push("Wybierz lokal.")
  }
  if (!input.name.trim()) {
    errors.push("Podaj nazwe wydarzenia.")
  }
  if (!input.slug.trim()) {
    errors.push("Podaj slug wydarzenia.")
  }
  if (!["draft", "scheduled", "active"].includes(input.status)) {
    errors.push("Wybierz poprawny status wydarzenia.")
  }
  if (input.startsAt && input.endsAt && Date.parse(input.endsAt) <= Date.parse(input.startsAt)) {
    errors.push("Koniec wydarzenia musi byc po starcie.")
  }

  if (errors.length > 0) {
    return { errors, ok: false }
  }

  const value: CreateDashboardEventFormInput = {
    ...input,
    name: input.name.trim(),
    slug: input.slug.trim(),
    venueId: input.venueId.trim()
  }
  const startsAt = input.startsAt?.trim()
  const endsAt = input.endsAt?.trim()
  if (startsAt) {
    value.startsAt = startsAt
  }
  if (endsAt) {
    value.endsAt = endsAt
  }

  return {
    ok: true,
    value
  }
}

export function mapCreateEventError(error: unknown): string {
  if (isDashboardApiErrorLike(error)) {
    if (error.status === 0) {
      return "Nie udalo sie utworzyc wydarzenia. Sprobuj ponownie."
    }
    if (error.status === 403) {
      return "Brak uprawnien do utworzenia wydarzenia w tym lokalu."
    }
    if (error.status === 409 && error.code === "EVENT_SLUG_CONFLICT") {
      return "Ten slug jest juz zajety w wybranym lokalu."
    }
    if (error.status === 409 && error.code === "VENUE_HAS_ACTIVE_EVENT") {
      return "Ten lokal ma już aktywne wydarzenie. Zamknij je albo utwórz nowe jako szkic/zaplanowane."
    }
    if (error.status === 400) {
      return error.message || "Sprawdz dane wydarzenia."
    }
    if (error.status >= 400 && error.status < 500) {
      return error.message || "Nie udalo sie utworzyc wydarzenia. Sprawdz dane i sprobuj ponownie."
    }
  }

  return "Nie udalo sie utworzyc wydarzenia. Sprawdz, czy API dziala."
}

export function buildCreatedEventQueuePath(eventId: string): string {
  return buildDashboardEventQueuePath(eventId)
}

function isDashboardApiErrorLike(error: unknown): error is DashboardApiError {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  )
}
