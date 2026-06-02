export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <div className="panel hero-copy">
          <p className="eyebrow">Publiczne kolejki karaoke</p>
          <h1>Znajdź lokal i dołącz do kolejki.</h1>
          <p className="lead">
            Poza Nutą pokazuje aktywne wydarzenie dopiero wtedy, gdy prowadzący uruchomi kolejkę w lokalu.
          </p>
        </div>
        <div className="panel venue-facts">
          <div className="fact">
            <span>Adresy publiczne</span>
            <strong>/:venueSlug/join</strong>
          </div>
          <div className="fact">
            <span>Status</span>
            <strong>Venue-first MVP</strong>
          </div>
          <div className="button secondary" aria-disabled="true">
            Otwórz przykładowy lokal
          </div>
        </div>
      </section>
    </main>
  )
}
