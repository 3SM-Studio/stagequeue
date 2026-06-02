import type { Metadata } from "next"
import Link from "next/link"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Poza Nutą",
    template: "%s | Poza Nutą"
  },
  description: "Publiczne kolejki karaoke w lokalach obsługiwanych przez Poza Nutą."
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>
        <div className="app-frame">
          <header className="site-header">
            <Link className="brand" href="/">
              <span className="brand-mark" aria-hidden="true">
                PN
              </span>
              <span>Poza Nutą</span>
            </Link>
          </header>
          {children}
        </div>
      </body>
    </html>
  )
}
