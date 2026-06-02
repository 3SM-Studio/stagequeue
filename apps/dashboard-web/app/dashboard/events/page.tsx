import { EventQueueOpenForm } from "../../../components/EventQueueOpenForm"

export const metadata = {
  title: "Wydarzenia"
}

export default function DashboardEventsPage() {
  return (
    <main className="page-shell">
      <section className="panel">
        <h1>Wydarzenia</h1>
        <p className="lead">
          D2 dodaje pierwszy panel operatora kolejki. Wpisz eventId, zeby otworzyc widok prowadzacego dla konkretnego
          wydarzenia.
        </p>
        <EventQueueOpenForm />
      </section>
    </main>
  )
}
