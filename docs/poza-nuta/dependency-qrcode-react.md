# Dependency Decision - qrcode.react

## Problem

Dashboard operatora musi renderować skanowalny kod QR dla autoryzowanego, absolutnego URL-a zaproszenia.

## Proposed dependency

`qrcode.react` 4.2.0, używane wyłącznie przez `EventInvitePanel` jako komponent `QRCodeSVG`.

## Why not local code?

Poprawne kodowanie QR obejmuje wersje, maski i korekcję błędów. Własna implementacja byłaby trudniejsza do
zweryfikowania i zwiększałaby ryzyko wygenerowania kodu, którego część urządzeń nie zeskanuje.

## Why not existing tool/platform?

Repo nie ma biblioteki QR, a React, Next.js i przeglądarki nie udostępniają generatora QR. Backend nie powinien
generować ani przechowywać obrazu, ponieważ dashboard może bezpośrednio wyrenderować SVG z `inviteUrl`.

## Maintenance/security/license review

Pakiet ma wbudowane typy TypeScript, nie dodaje zależności runtime i jest dostępny na licencji ISC. QR zawiera
wyłącznie URL otrzymany z chronionego API. URL nie jest wysyłany do zewnętrznej usługi.

## Runtime/bundle impact

Kod trafia wyłącznie do klientowego ekranu operator queue. Nie wpływa na public-web ani API.

## Isolation/removal plan

Import jest ograniczony do `EventInvitePanel.tsx`. Pakiet można zastąpić innym rendererem SVG bez zmiany API lub
modelu invite.

## Decision

Accepted.
