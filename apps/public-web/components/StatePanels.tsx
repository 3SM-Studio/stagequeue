import Link from "next/link"
import type { ActiveEventLookup, Venue } from "../lib/apiClient"

export function ApiErrorPanel({ message }: { message: string }) {
  return (
    <main className="page-shell narrow">
      <section className="panel state-panel">
        <p className="eyebrow">API</p>
        <h1>Nie udało się pobrać danych.</h1>
        <p>{message}</p>
      </section>
    </main>
  )
}

export function InactiveQueuePanel({ venue }: { venue: Pick<Venue, "name" | "slug"> }) {
  return (
    <section className="panel state-panel">
      <p className="eyebrow">{venue.name}</p>
      <h1>Ten lokal nie ma teraz aktywnej kolejki karaoke.</h1>
      <p>Wróć tutaj, gdy prowadzący rozpocznie wydarzenie. Link do lokalu pozostaje stały.</p>
      <Link className="button secondary" href={`/${venue.slug}`}>
        Wróć do lokalu
      </Link>
    </section>
  )
}

export function PausedQueuePanel({ active }: { active: ActiveEventLookup }) {
  return (
    <section className="panel state-panel">
      <p className="eyebrow">{active.venue.name}</p>
      <h1>Zgłoszenia są chwilowo wstrzymane.</h1>
      <p>Kolejka może być nadal widoczna, ale nowe piosenki nie są teraz przyjmowane.</p>
      <Link className="button secondary" href={`/${active.venue.slug}/queue`}>
        Zobacz kolejkę
      </Link>
    </section>
  )
}
