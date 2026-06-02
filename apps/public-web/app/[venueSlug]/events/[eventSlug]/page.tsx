import Link from "next/link"

type EventPlaceholderPageProps = {
  params: Promise<{ venueSlug: string; eventSlug: string }>
}

export default async function EventPlaceholderPage({ params }: EventPlaceholderPageProps) {
  const { venueSlug, eventSlug } = await params

  return (
    <main className="page-shell narrow">
      <section className="panel state-panel">
        <p className="eyebrow">{eventSlug}</p>
        <h1>Widok konkretnego wydarzenia pojawi się później.</h1>
        <p>Ten etap public-web korzysta z aktywnego wydarzenia lokalu zamiast lookupu po event slug.</p>
        <div className="actions">
          <Link className="button primary" href={`/${venueSlug}/join`}>
            Przejdź do aktywnego zgłoszenia
          </Link>
          <Link className="button secondary" href={`/${venueSlug}/queue`}>
            Przejdź do aktywnej kolejki
          </Link>
        </div>
      </section>
    </main>
  )
}
