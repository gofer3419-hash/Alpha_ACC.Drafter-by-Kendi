# ACC.DRAFTER

Losowy draft decku dla moda WARNO **A World in Flames**, zbudowany na bazie
[WarYes](https://github.com/CptToucan/waryes) (sam moduł Deck Drafter).

Strona główna ma trzy przyciski:

- **Losowanie drużyn**: do 10 graczy, maksymalnie 5 na stronę.
- **ACC.DRAFTER**: draft WarYes na dywizjach moda WiF; najpierw wybór
  strony (NATO albo PACT).
- **VANILLA Deck Drafter**: draft na dywizjach gry bazowej; po wyborze strony
  zaznaczasz posiadane DLC i losowane są tylko dywizje z gry bazowej i tych DLC.

Na końcu draftu dostajesz kod decku do importu w grze. Logo WarYes na górze
prowadzi na stronę główną.

Strona działa w całości w przeglądarce: bez serwera, bazy danych i logowania.

## Budowanie

Wymagany [Node.js](https://nodejs.org/) w wersji LTS (20 lub 22).

```bash
npm install      # pobranie zależności (raz)
npm start        # serwer deweloperski: http://localhost:8080
npm run build    # wersja do publikacji w katalogu dist/
```

Zawartość `dist/` to statyczne pliki. Można je wrzucić na dowolny hosting
(GitHub Pages, Netlify, Cloudflare Pages) albo do `htdocs` w XAMPP (strona musi
leżeć w katalogu głównym serwera; `.htaccess` obsługuje podstrony w Apache). `dist/404.html` sprawia, że adres
`/draft` działa także na hostingach bez obsługi tras SPA.

## Dane gry

Dane są w katalogu `data/`:

- `wif.json`: dywizje i jednostki moda A World in Flames,
- `vanilla.json`: dywizje i jednostki gry bazowej,
- `vanilla-dlc.json`: lista DLC i dywizji, które dodają (dywizje spoza listy
  należą do gry bazowej; źródło: strony DLC w sklepie Steam),
- `vanilla-division-names.json`: nazwy dywizji vanilla (pliki moderskie gry
  bazowej nie zawierają lokalizacji).

`wif.json` i `vanilla.json` generuje `tools/wif-extractor` z plików gry:

```bash
# WiF: skompilowany mod z Workshopu (folder Gen, pliki .ndfbin)
python tools/wif-extractor/extract.py --name wif \
  --ndfbin   ŚCIEŻKA/DO/Gen/NDF/GFX \
  --strings  ŚCIEŻKA/DO/Gen/Localisation/Intermediate/HarvestedStrings.csv \
  --out data

# Gra bazowa (rozpakowany WARNO/Mods/ModData/base.zip)
python tools/wif-extractor/extract.py --name vanilla --preset vanilla \
  --gamedata ŚCIEŻKA/DO/base/GameData \
  --division-names data/vanilla-division-names.json \
  --out data
```

Nazwy jednostek vanilla powstają z deskryptorów (np. `Descriptor_Unit_T62MD_CMD_SOV`
→ „T62MD CMD”), bo `base.zip` nie zawiera plików lokalizacji. Gdy znajdą się
słowniki gry (`UNITS-US.dic`), wystarczy dodać je przez `--strings`. Po nowym DLC
trzeba dopisać je do `data/vanilla-dlc.json` i `data/vanilla-division-names.json`. Raport z generowania
(np. jednostki bez nazwy) trafia do `data/<nazwa>-report.json`.

## Struktura

- `src/routes/home.ts`: strona główna.
- `src/routes/team-shuffle.ts`: losowanie drużyn (`src/utils/teams.ts`).
- `src/routes/deck-drafter.ts`: start draftu (`/drafter/wif`, `/drafter/vanilla`):
  wybór strony, w vanilla także DLC.
- `src/routes/deck-draft.ts`: ekran draftu (`/drafter/<zestaw>/local`).
- `src/types/dataset.ts`: konfiguracja zestawów danych (WiF, vanilla).
- `src/classes/deck-drafter/DeckDraftClientEngine.ts`: logika draftu.
- `src/classes/deck.ts`: zasady decku (sloty, punkty aktywacji, kod decku).
- `src/utils/encode-deck-code.ts`: kodowanie kodu decku (poprawka szerokości pola ID).
- `src/services/bundle-manager.ts`: wczytywanie danych i listy DLC.

## Licencja

BSD-3-Clause, jak oryginalny WarYes.
