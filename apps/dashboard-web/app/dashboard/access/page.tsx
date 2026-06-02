export const metadata = {
  title: "Dostep"
}

export default function DashboardAccessPage() {
  return (
    <main className="page-shell narrow">
      <section className="panel">
        <h1>Dostep do dashboardu</h1>
        <p className="lead">Po zalogowaniu API zwraca status closed beta przez GET /me. Akceptacja dostepu pozostaje po stronie platformy.</p>
      </section>
    </main>
  )
}
