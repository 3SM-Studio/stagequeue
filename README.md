# Poza Nuta

## Import metadanych iSing

Importer buduje lokalny, prywatny indeks metadanych dostępnych utworow karaoke z iSing.

1. Skopiuj `.env.example` do `.env`.
2. Ustaw `ISING_CLIENT_ID`.
3. Uruchom:

```bash
pnpm import:ising
```

Wynik zostanie zapisany w `data/imports/ising-songs.json`, a raport importu w `data/imports/ising-import-report.json`.

### Konfiguracja klienta

`ISING_CLIENT_ID` pochodzi z publicznego requestu webowego iSing i nie jest traktowany jako prywatny sekret uzytkownika. Trzymamy go w `.env` tylko dlatego, ze moze sie zmienic i nie chcemy hardcodowac go w kodzie.

Importer domyslnie nie wymusza botowego User-Agenta. Jesli iSing poprosi o konkretny User-Agent albo dodatkowa identyfikacje ruchu, mozna ustawic `ISING_IMPORT_USER_AGENT`. `ISING_IMPORT_CONTACT_EMAIL` jest opcjonalne i sluzy tylko do wewnetrznej dokumentacji albo logowania.

### Paginacja iSing

iSing API uzywa offset pagination przez parametr `start`, np. `start=20`, `start=40`, `start=60`. Parametr `per_page=50` moze byc ignorowany albo limitowany przez API, dlatego importer nie moze na nim polegac.

Importer zawsze musi uzywac `links.next` z odpowiedzi API. Nie wolno recznie wyliczac kolejnych wartosci `start`; `links.next` jest jedynym zrodlem prawdy dla paginacji.

Ograniczenia:

- importer sluzy tylko do prywatnego indeksu metadanych dostepnosci piosenek karaoke,
- nie pobiera tekstow, audio, nagran, profili uzytkownikow ani komentarzy,
- nie wolno wystawiac pelnej kopii katalogu iSing publicznie,
- importer dziala tylko jako okresowy lokalny import metadanych i nie wolno uzywac go ani iSing API jako live proxy dla wyszukiwan uzytkownikow,
- po publikacji oficjalnego publicznego API iSing adapter nalezy wymienic na oficjalna integracje.

## Lokalne wyszukiwanie piosenek

Najpierw zbuduj lokalny indeks:

```bash
pnpm import:ising
```

Potem wyszukuj po lokalnie zaimportowanych metadanych:

```bash
pnpm search:songs "krolowa lez"
```

Wyszukiwarka czyta tylko `data/imports/ising-songs.json` i nie odpytuje iSing API. Pelny katalog importu nie powinien byc commitowany; pliki `data/imports/*.json` sa ignorowane przez git.

## Lokalna kolejka karaoke

To jest lokalny silnik kolejki bez UI, QR i endpointow HTTP. Dane eventow sa runtime i nie powinny byc commitowane; pliki `data/events/*.json` sa ignorowane przez git.

Przykladowy flow:

```bash
pnpm queue create --id test-event --name "Poza Nutą Test"
pnpm queue add --event test-event --singer "Michał" --title "Królowa Łez" --artist "Agnieszka Chylińska" --source ising --source-id 9053 --url "https://ising.pl/agnieszka-chylinska-krolowa-lez-piosenka"
pnpm queue approve --event test-event --request <request-id>
pnpm queue start --event test-event --request <request-id>
pnpm queue done --event test-event
pnpm queue public --event test-event
```

Kolejka dziala wylacznie na lokalnym JSON `data/events/<event-id>.json` i nie odpytuje iSing API podczas operacji kolejki.

Publiczny widok kolejki pokazuje aktualnie spiewajaca osobe jako `Now`, pierwsza zaakceptowana osobe jako `Next`, a `Upcoming` zawiera dopiero kolejne zaakceptowane requesty po `Next`.

## Dodawanie requestu z wyszukiwarki

Mozesz dodac request do kolejki bez recznego przepisywania tytulu, artysty, source id i URL-a. Komenda korzysta wylacznie z lokalnego indeksu `data/imports/ising-songs.json` i nie odpytuje iSing API.

Przykladowy flow:

```bash
pnpm import:ising
pnpm queue create --id test-event --name "Poza Nutą Test"
pnpm queue add-from-search --event test-event --singer "Michał" --query "krolowa lez"
pnpm queue approve --event test-event --request <id>
pnpm queue public --event test-event
```

Dodatkowe opcje:

- `--min-score <number>` ustawia minimalny confidence score, domyslnie `60`.
- `--pick <number>` wybiera konkretny wynik z top listy, numerowany od `1`.
- `--dry-run` pokazuje, co zostaloby dodane, ale nie zapisuje zmian do pliku eventu.
