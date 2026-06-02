export type ISingSearchResponse = {
  data: {
    found: number;
    q: string;
    results: {
      songs: ISingApiSong[];
    };
  };
  links?: {
    next?: string;
    last?: string;
  };
};

export type ISingApiSong = {
  id: number;
  title: string;
  subtitle: string | null;
  artist: string;
  artist_id: number;
  date_added: string | null;
  duration: number | null;
  genre?: string[];
  plus: boolean;
  hit: boolean;
  buy: boolean;
  permalink: string | null;
  links?: {
    selflink?: string;
    permalink?: string;
    selflink_lyrics?: string;
    selflink_recs?: string;
    selflink_battles?: string;
  };
  sample_url?: string;
};

export type LocalSong = {
  source: "ising" | "karafun";
  sourceSongId: string;
  title: string;
  subtitle: string | null;
  artist: string;
  artistSourceId: string | null;
  normalizedTitle: string;
  normalizedArtist: string;
  searchText: string;
  durationSeconds: number | null;
  genres: string[];
  isPlus: boolean;
  isHit: boolean;
  isBuyAvailable: boolean;
  sourceUrl: string | null;
  sourceSelflink: string | null;
  sourceDateAdded: string | null;
  availabilityStatus: "available";
  lastSeenAt: string;
  lastCheckedAt: string;
};

export type ISingImportReport = {
  totalFoundFromApi: number | null;
  importedCount: number;
  skippedCount: number;
  pageCount: number;
  startedAt: string;
  finishedAt: string | null;
  failedAtUrl?: string;
  errors: string[];
};

export type ISingImporterConfig = {
  apiBaseUrl: string;
  clientId: string;
  delayMs: number;
  tag: string;
  order: string;
  contactEmail?: string;
  userAgent?: string;
  outputSongsPath: string;
  outputReportPath: string;
  timeoutMs: number;
  maxNetworkRetries: number;
};
