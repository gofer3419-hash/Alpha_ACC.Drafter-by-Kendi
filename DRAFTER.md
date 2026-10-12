# ACC.DRAFTER

Losowy draft decku dla moda WARNO **A World in Flames**, zbudowany na bazie
[WarYes](https://github.com/CptToucan/waryes) (sam moduł Deck Drafter).

Strona główna ma cztery przyciski:

- **Lobby: draft drużynowy**: gra w kilka osób, opis niżej.
- **Losowanie drużyn**: do 10 graczy, maksymalnie 5 na stronę.
- **WiF Deck Drafter**: draft WarYes na dywizjach moda WiF; najpierw wybór
  strony (NATO albo PACT).
- **VANILLA Deck Drafter**: draft na dywizjach gry bazowej; po wyborze strony
  zaznaczasz posiadane DLC i losowane są tylko dywizje z gry bazowej i tych DLC.

Na końcu draftu dostajesz kod decku do importu w grze. Logo WarYes na górze
prowadzi na stronę główną.

Po wyborze strony cała strona robi się niebieska (NATO) albo czerwona (PAKT),
a po powrocie do menu wraca bordowa. Kolor wybiera jedna zmienna `--acc-h`.

## Lobby: draft drużynowy

Na stronie głównej: **Lobby: draft drużynowy** (`/lobby`).

1. Jedna osoba tworzy lobby (wybiera grę: WiF albo Vanilla) i dostaje 4-znakowy
   kod. Pozostali wpisują nick i kod albo wchodzą z linku z kodem
   (przycisk „Kopiuj link"). Maksymalnie 10 graczy, nicki są unikalne w lobby.
2. Host losuje drużyny (niebiescy = NATO, czerwoni = PAKT). Losowanie można
   powtarzać (zawsze wychodzi inny podział), zamienić strony albo przenieść
   graczy ręcznie. Host zatwierdza przyciskiem „Rozpocznij draft".
3. **Wybór dywizji** jest równoległy i prywatny: każdy wybiera swoją z własnych
   trzech. Gdy wszyscy wybiorą, zaczynają się tury.
4. **Tury jednostek.** Gracz na turze wybiera jedną ze swoich trzech kart.
   Serwer rozsyła tylko jej **pozycję** (lewa, środkowa, prawa), a każdy
   gracz bierze tę samą pozycję ze **swoich** kart. Gracz z pełnym deckiem
   wypada z kolejki. Kolejka jest naprzemienna (drużyna niebieska,
   czerwona, ...). Jeśli komuś zostało mniej kart niż pozycja, bierze ostatnią.

**Prywatność.** Losowanie kart, decki i kody decków istnieją tylko w
przeglądarce danego gracza. Serwer nie zna jednostek. Inni widzą tylko: kto jest
w lobby, drużyny, czyja tura, jaka pozycja karty została wybrana i kto ma pełny
deck. Dziennik `logs/draft-log.ndjson` zawiera tylko nick, rundę i pozycję.
Ostatnie wpisy: `http://localhost:8080/api/log`.

**Decki drużyny na końcu.** Gdy gracz skompletuje deck, jego przeglądarka
wysyła na serwer sam kod decku. Serwer trzyma go w ukryciu, a dopiero gdy
wszyscy skończą draft, pokazuje go **tylko graczom z tej samej drużyny**
(zakładki z nickami pod własnym deckiem, każdy deck z przyciskiem „Kopiuj kod").
Drużyna przeciwna nigdy go nie dostaje. Podczas draftu nic się nie zmienia.

**Skalowanie.** Cały układ jest w jednostkach `rem`, a rozmiar bazowy liczy się
z okna przeglądarki (`styles/app.css`): 16 px przy 1920x1080, proporcjonalnie
mniej na laptopach i więcej na 1440p, 4K i ultrawide. Na telefonach i tabletach
(poniżej 1001 px) zostaje stałe 16 px.

**Rozłączenia.** Odświeżenie strony nic nie psuje: gracz wraca do tego samego
lobby i swojego drafta, a brakujące rundy nadrabia sam. Rozłączony gracz nie
blokuje reszty. Host może pominąć turę albo usunąć gracza. Gdy host zniknie,
inny gracz może przejąć lobby po 30 sekundach.


## Budowanie

Wymagany [Node.js](https://nodejs.org/) w wersji LTS (20 lub 22).

```bash
npm install      # pobranie zależności (raz)
npm start        # buduje stronę i uruchamia serwer: http://localhost:8080
npm run serve    # tylko serwer (strona już zbudowana w dist/)
npm run build    # sama budowa strony do katalogu dist/
```

Serwer wypisuje przy starcie adresy dla pozostałych graczy (np. adres z Radmina).
Wszyscy muszą wejść na ten sam serwer, żeby widzieć się nawzajem.

Tryb deweloperski z odświeżaniem po zmianach: w jednym oknie
`npm run dev:server`, w drugim `npm run dev`.

Bez serwera (sam hosting statyczny) działają solo drafty (WiF i Vanilla), a
lobby pokazuje komunikat, że potrzebuje serwera.

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
- `server/server.js`: serwer: strona, lobby, drużyny, kolejka tur, dziennik.
- `src/services/lobby.ts`: połączenie z serwerem, lobby, drużyny, kolejka tur.
- `src/routes/lobby.ts`: strona lobby (wejście, poczekalnia, drużyny);
  `src/components/lobby/lobby-draft.ts`: draft jednego gracza w lobby.
- `src/utils/theme.ts` i `styles/app.css`: motyw niebieski/czerwony (jedna zmienna
  `--acc-h` ustawia kolor całej strony).
- `src/classes/deck.ts`: zasady decku (sloty, punkty aktywacji, kod decku).
- `src/utils/deck-code.ts`: kodowanie i dekodowanie kodu decku; `src/utils/export-deck-to-code.ts`: kopiowanie kodu do schowka.
- `src/services/bundle-manager.ts`: wczytywanie danych i listy DLC.

## Licencja

BSD-3-Clause, jak oryginalny WarYes.
