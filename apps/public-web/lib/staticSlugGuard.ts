const reservedPublicPathSlugs = new Set([
  "_next",
  "assets",
  "favicon.ico",
  "manifest.webmanifest",
  "robots.txt",
  "sitemap.xml",
  "sw.js"
])

export function isReservedPublicPathSlug(value: string): boolean {
  return reservedPublicPathSlugs.has(value.trim().toLowerCase())
}

