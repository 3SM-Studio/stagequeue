import type { Metadata } from "next"
import type { Venue } from "./apiClient.ts"

export const noindexMetadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
}

export function venuePageMetadata(venue?: Pick<Venue, "name"> | null): Metadata {
  if (!venue) {
    return {
      title: "Karaoke | Poza Nutą"
    }
  }

  return {
    title: `Karaoke w ${venue.name} | Poza Nutą`,
    description: `Dołącz do karaoke i sprawdź aktualną kolejkę w ${venue.name}.`
  }
}

export function joinPageMetadata(venue?: Pick<Venue, "name"> | null): Metadata {
  return {
    ...noindexMetadata,
    title: venue ? `Dołącz do karaoke | ${venue.name}` : "Dołącz do karaoke | Poza Nutą"
  }
}

export function queuePageMetadata(venue?: Pick<Venue, "name"> | null): Metadata {
  return {
    ...noindexMetadata,
    title: venue ? `Kolejka karaoke | ${venue.name}` : "Kolejka karaoke | Poza Nutą"
  }
}
