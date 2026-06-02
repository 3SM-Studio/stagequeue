import type { Metadata } from "next"
import Link from "next/link"
import { noindexMetadata } from "../../../../../lib/metadata"

type EventJoinPlaceholderPageProps = {
  params: Promise<{ venueSlug: string; eventSlug: string }>
}

export const metadata: Metadata = {
  ...noindexMetadata,
  title: "Zgłoś piosenkę"
}

export default async function EventJoinPlaceholderPage({ params }: EventJoinPlaceholderPageProps) {
  const { venueSlug } = await params

  return (
    <main className="page-shell narrow">
      <section className="panel state-panel">
        <p className="eyebrow">Wydarzenie</p>
        <h1>Zgłoszenia po slug wydarzenia są jeszcze wyłączone.</h1>
        <p>Na tym etapie używamy aktywnego wydarzenia lokalu.</p>
        <Link className="button primary" href={`/${venueSlug}/join`}>
          Zgłoś do aktywnej kolejki
        </Link>
      </section>
    </main>
  )
}
