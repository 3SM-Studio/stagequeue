"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export function EventQueueOpenForm() {
  const router = useRouter()
  const [eventId, setEventId] = useState("")

  return (
    <form
      className="inline-form"
      onSubmit={(event) => {
        event.preventDefault()
        const value = eventId.trim()
        if (value) {
          router.push(`/dashboard/events/${encodeURIComponent(value)}/queue`)
        }
      }}
    >
      <label htmlFor="event-id">Event ID</label>
      <div className="inline-form-row">
        <input
          id="event-id"
          name="eventId"
          placeholder="UUID eventu"
          type="text"
          value={eventId}
          onChange={(event) => setEventId(event.target.value)}
        />
        <button className="button" type="submit">
          Otworz kolejke
        </button>
      </div>
    </form>
  )
}
