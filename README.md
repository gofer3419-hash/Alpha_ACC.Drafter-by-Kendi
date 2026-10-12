# Alpha_ACC.Drafter-by-Kendi-Kotel
Wczesna Alfa, projekt draftera skonstruowany przy pomocy AI na potrzeby klanowe przez członków klanu Arma Coop Corps (Kendi oraz Kotel)


# Instalacja
Standalone API krok po kroku:

1. Wypakować Repo do docelowego folderu (np. D:\accdrafter)

2. Instalacja Node.js https://nodejs.org/en/download
 - najlepiej LTS, Windows Installer (.msi)

3. Uruchomienie
- kliknij dwa razy plik start_draft.bat w folderze draftera
    - przy pierwszym uruchomieniu sam zainstaluje potrzebne pliki (npm install), to potrwa kilka minut
    - strona otworzy się w przeglądarce: http://localhost:8080
    - okno musi być otwarte, dopóki korzystasz ze strony ( żeby zakończyć, zamknij okno albo CTRL + C )

- albo ręcznie z CMD:
    - wejdź do folderu: cd /d "D:\accdrafter"
    - npm install ( tylko za pierwszym razem )
    - npm start ( buduje stronę i uruchamia serwer; nic się nie zakończy, to działający serwer, żeby go zatrzymać - CTRL + C )

- serwer na starcie wypisuje adresy dla innych graczy (linie "Inni"), np. adres z Radmina - gracze wchodzą na ten sam adres i łączą się w lobby (Lobby: draft drużynowy) kodem

# Wersja na hosting / XAMPP
- npm run build
    - zawartość folderu dist wrzucić na hosting albo do htdocs w XAMPP

Szczegóły projektu: DRAFTER.md
