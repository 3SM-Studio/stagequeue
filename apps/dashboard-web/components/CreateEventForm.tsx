"use client"

import { useMemo, useState } from "react"
import type { FormEvent } from "react"
import { useRouter } from "next/navigation"
import type { DashboardVenueSummary } from "../lib/apiClient"
import { createDashboardEvent } from "../lib/apiClient"
import {
  buildCreatedEventQueuePath,
  generateEventSlug,
  mapCreateEventError,
  validateCreateEventInput,
  type CreateDashboardEventFormInput
} from "../lib/createEventState"

type CreateEventFormProps = {
  venues: DashboardVenueSummary[]
}

export function CreateEventForm({ venues }: CreateEventFormProps) {
  const router = useRouter()
  const defaultVenueId = venues[0]?.id ?? ""
  const [venueId, setVenueId] = useState(defaultVenueId)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [status, setStatus] = useState<CreateDashboardEventFormInput["status"]>("draft")
  const [startsAt, setStartsAt] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const [publicJoinEnabled, setPublicJoinEnabled] = useState(false)
  const [publicQueueEnabled, setPublicQueueEnabled] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const selectedVenue = useMemo(() => venues.find((venue) => venue.id === venueId) ?? null, [venueId, venues])

  if (venues.length === 0) {
    return (
      <section className="panel subtle-panel">
        <h1>Nowe wydarzenie</h1>
        <p className="lead">Brak lokali dostepnych do utworzenia wydarzenia.</p>
      </section>
    )
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const validation = validateCreateEventInput({
      endsAt,
      name,
      publicJoinEnabled,
      publicQueueEnabled,
      slug,
      startsAt,
      status,
      venueId
    })

    if (!validation.ok) {
      setErrors(validation.errors)
      return
    }

    setSubmitting(true)
    setErrors([])

    try {
      const created = await createDashboardEvent(validation.value)
      router.push(buildCreatedEventQueuePath(created.event.id))
    } catch (error) {
      setErrors([mapCreateEventError(error)])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="panel">
      <div className="queue-dashboard-header">
        <div>
          <h1>Nowe wydarzenie</h1>
          <p className="lead">Utworz minimalny event i przejdz od razu do kolejki operatora.</p>
        </div>
        {selectedVenue ? <span className="pill">{selectedVenue.name}</span> : null}
      </div>

      <form className="create-event-form" onSubmit={(event) => void onSubmit(event)}>
        <div className="form-grid two-columns">
          <label>
            <span>Lokal</span>
            <select value={venueId} onChange={(event) => setVenueId(event.target.value)} required>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name} ({venue.slug})
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as CreateDashboardEventFormInput["status"])}
            >
              <option value="draft">draft</option>
              <option value="scheduled">scheduled</option>
              <option value="active">active</option>
            </select>
          </label>

          <label>
            <span>Nazwa</span>
            <input
              maxLength={160}
              required
              value={name}
              onChange={(event) => {
                const nextName = event.target.value
                setName(nextName)
                if (!slugTouched) {
                  setSlug(generateEventSlug(nextName))
                }
              }}
            />
          </label>

          <label>
            <span>Slug</span>
            <input
              maxLength={80}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
              value={slug}
              onChange={(event) => {
                setSlugTouched(true)
                setSlug(generateEventSlug(event.target.value))
              }}
            />
          </label>

          <label>
            <span>Start</span>
            <input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          </label>

          <label>
            <span>Koniec</span>
            <input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </label>
        </div>

        <div className="checkbox-grid">
          <label className="checkbox-row">
            <input
              checked={publicJoinEnabled}
              type="checkbox"
              onChange={(event) => setPublicJoinEnabled(event.target.checked)}
            />
            <span>Public join enabled</span>
          </label>
          <label className="checkbox-row">
            <input
              checked={publicQueueEnabled}
              type="checkbox"
              onChange={(event) => setPublicQueueEnabled(event.target.checked)}
            />
            <span>Public queue enabled</span>
          </label>
        </div>

        {errors.length > 0 ? (
          <div className="form-errors" role="alert">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}

        <div className="actions">
          <button className="button" disabled={submitting} type="submit">
            {submitting ? "Tworzenie..." : "Utworz wydarzenie"}
          </button>
        </div>
      </form>
    </section>
  )
}
