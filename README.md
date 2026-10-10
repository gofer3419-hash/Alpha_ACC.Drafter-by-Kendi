# Alpha_ACC.Drafter-by-Kendi
Wczesna Alfa, projekt draftera skonstruowany przy pomocy AI na potrzeby klanowe


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
    - npm start ( tu sie nic nie zakończy, to działająca api, żeby zakończyć działanie strony - CTRL + C )

# Wersja na hosting / XAMPP
- npm run build
    - zawartość folderu dist wrzucić na hosting albo do htdocs w XAMPP

Szczegóły projektu: DRAFTER.md
