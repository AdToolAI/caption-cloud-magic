# Fall azamat.gfx@gmail.com — was wirklich passiert ist, und was wir fixen

## Befund (geprüft im Konto)

Konto: azamat.gfx@gmail.com, Creator, 20 % Rabatt, Guthaben 30,00 € — unverändert, es wurde **nichts abgebucht** (Gesamtausgaben 0,00 €).

Drei Versuche am 07.09.2026, 09:17 / 09:21 / 09:23 UTC, alle mit Seedance 2.5, 10 s, 720p, Modus "Referenzbild". Alle drei wurden **vom Anbieter abgelehnt**, nicht von uns:

```text
InputImageSensitiveContentDetected.PrivacyInformation
"input image 'content[1]' may contain real person"
```

Das ist der Personenschutz von ByteDance/ModelArk: Referenzbilder mit einer echten Person werden auf dieser Route grundsätzlich abgewiesen. Kein Bug in der Pipeline, kein Guthabenverlust — aber der Kunde sieht davon nichts, sondern nur "Edge Function returned a non-2xx status code". Das ist der eigentliche Produktfehler.

## Was gefixt wird

1. **Verständliche Fehlermeldung statt Roh-Statuscode.** Anbieterfehler werden auf klare, lokalisierte Texte (DE/EN/ES) abgebildet. Für diesen Fall: "Seedance 2.5 akzeptiert keine Referenzbilder mit echten Personen. Nutze ein geschütztes Cast-Bild oder wechsle das Modell." Plus Hinweis, dass kein Guthaben belastet wurde.
2. **Vorab-Warnung statt Fehlschlag.** Wenn beim Seedance-Referenz-Slot ein Foto mit echter Person hochgeladen wird, warnt das Studio schon vor dem Start und schlägt die personensicheren Wege vor (geschützter Cast-Anker bzw. ein Modell ohne diese Sperre).
3. **@-Erwähnung von Uploads im Prompt.** Der Kunde erwartet die von anderen Plattformen gewohnte `@bild`-Syntax. Uploads und Bibliothekselemente bekommen einen Kurznamen; `@` im Prompt öffnet eine Auswahl und verknüpft das Bild mit dem passenden Referenz-Slot. Kein neuer Anbieterweg, nur Bedienung.
4. **Charakter-Werkzeug: Freistellen sauberer.** Die Beschwerde "entfernt den Hintergrund schlecht und zerstört das Charakter-Referenzblatt" wird zuerst reproduziert; danach: Freistellen wird optional statt automatisch, und das Original bleibt als Variante erhalten, damit das Referenzblatt nie überschrieben wird.

## Technische Details

- Fehlerabbildung zentral in der Antwortnormalisierung der `generate-*-video`-Funktionen plus Client-Mapper; keine Änderung an Preisen, Gates oder Routen.
- Personen-Vorprüfung clientseitig als Warnung (nicht blockierend), Serverentscheid bleibt maßgeblich.
- `@`-Syntax rein im Prompt-Eingabefeld des AI Video Studio, gemappt auf die bestehenden Referenz-Slots des Capability-Contracts (Slot-Limits unverändert).
- Charakter-Freistellen: Ausgabe als zusätzliche Variante, Ursprungsbild unangetastet.

## Rückmeldung an den Kunden

Antwortvorschlag: kein Guthaben verbraucht, Ursache war die Personensperre des Anbieters bei Referenzbildern, empfohlener Weg heute (geschützter Cast-Anker oder anderes Modell), und die vier Verbesserungen oben sind in Arbeit.
