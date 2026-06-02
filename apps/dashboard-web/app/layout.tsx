import type { Metadata } from "next"
import Link from "next/link"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Poza Nuta Dashboard",
    template: "%s | Poza Nuta Dashboard"
  },
  description: "Panel operacyjny venue-first dla platformy karaoke Poza Nuta."
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>
        <div className="app-frame">
          <header className="site-header">
            <Link className="brand" href="/dashboard">
              <span className="brand-mark" aria-hidden="true">
                PN
              </span>
              <span>Poza Nuta Dashboard</span>
            </Link>
            <nav className="top-nav" aria-label="Dashboard navigation">
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/dashboard/organizations">Organizacje</Link>
              <Link href="/dashboard/venues">Lokale</Link>
              <Link href="/dashboard/events">Wydarzenia</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  )
}
