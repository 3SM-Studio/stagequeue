import type { Metadata } from "next"
import Link from "next/link"
import { noindexMetadata } from "../../../../../lib/metadata"

type EventQueuePlaceholderPageProps = {
  params: Promise<{ venueSlug: string; eventSlug: string }>
}

export const metadata: Metadata = {
  ...noindexMetadata,
  title: "Kolejka karaoke"
}

export default async function EventQueuePlaceholderPage({ params }: EventQueuePlaceholderPageProps) {
  const { venueSlug } = await params

  return (
    <main className="page-shell narrow">
      <section className="panel state-panel">
        <p className="eyebrow">Wydarzenie</p>
        <h1>Kolejka po slug wydarzenia jest jeszcze placeholderem.</h1>
        <p>Na tym etapie publiczna kolejka działa przez aktywne wydarzenie lokalu.</p>
        <Link className="button primary" href={`/${venueSlug}/queue`}>
          Otwórz aktywną kolejkę
        </Link>
      </section>
    </main>
  )
}
