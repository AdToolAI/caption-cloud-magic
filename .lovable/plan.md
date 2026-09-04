# Stand: umgesetzt — und was für die Freigabe noch fehlt

## Bereits erledigt (im Code belegt)

- **Topaz zurück auf Test-Allowlist.** Die aktive Flag-Liste ist leer, die drei Topaz-Modelle stehen auf „nicht global freigeschaltet", die drei Server-Schalter stehen auf `false`, und nur der exakte Wert `true` schaltet global frei. Dein Konto ist als einziges in der Testliste hinterlegt und kann alle drei Modelle vollständig durchlaufen.
- **Offizielle Rate Cards hinterlegt**, mit Abrufdatum im Code:
  - Topaz Upscale: Stufentabelle nach Ausgabe-Megapixeln (24 MP $0.05 · 48 MP $0.10 · 96 MP $0.20 · 168 MP $0.29 · 512 MP $0.82, plus Zwischenstufen).
  - Dust & Scratch $0.08 pro Unit (1 Unit angenommen), Colorization $0.08 pro Unit (2 Units angenommen).
- **Formulierung korrigiert.** „Unbestätigt" heißt jetzt ausdrücklich: offizielle Preisregel bekannt, noch nicht gegen einen echten Lauf abgeglichen — nicht „geschätzt".
- Tests 42/42, Typprüfung und Build sauber.

## Eine Abweichung zu deiner Vorgabe, die du kennen solltest

Du nennst für Clarity Pro $0.03 pro Ausgabe-Megapixel. Das gilt für das Clarity-Produkt bei Replicate, das wir nicht anbinden. Wir rufen `philz1337x/clarity-upscaler` auf, und dieses Modell wird nach GPU-Zeit abgerechnet (A100, veröffentlichter Median $0.016 pro Lauf). Deshalb ist Clarity als Pauschale pro Lauf hinterlegt, und die verkauften 0,03 € / 0,06 € bleiben auskömmlich. Sollen wir stattdessen auf das $0.03/MP-Modell wechseln, ist das eine Produktentscheidung mit direkter Preisfolge — sag Bescheid, dann rechne ich beide Varianten durch.

## Was noch offen ist: die echten Validierungsläufe

Das ist der einzige verbleibende Schritt vor der globalen Freischaltung.

### 1. Erwartungswerte vorher festschreiben

Pro geplantem Lauf halte ich vorab fest: Eingabemaße und Megapixel, gewählte Einstellungen, erwartete Ausgabemaße, erwartete Kostenstufe, erwartete Providerkosten, angezeigter Endpreis.

### 2. Vier Läufe über dein Konto

| # | Modell | Zweck |
| --- | --- | --- |
| 1 | Topaz Upscale | kleines Bild, 4×, High Fidelity V2, Gesichts-Verbesserung an — prüft Parameterübertragung und Kostenstufe |
| 2 | Topaz Upscale | Grenzfall knapp unter/über einer Stufengrenze — prüft, ob der Anbieter deckelt oder rundet |
| 3 | Dust & Scratch | tatsächlicher Unit-Verbrauch |
| 4 | Colorization | tatsächlicher Unit-Verbrauch (Annahme: 2) |

### 3. Je Lauf geprüft

Preisvorschau → Wallet-Abbuchung → tatsächlich an den Anbieter gesendete Parameter → tatsächliche Ausgabemaße und Dateigröße → tatsächliche Anbieterkosten/Units laut Replicate-Abrechnung → Ergebnis in der Mediathek → Download.

### 4. Refund-Pfad

Ein bewusst fehlschlagender Lauf: genau eine Rückerstattung, keine doppelte bei Wiederholung.

### 5. Ergebnis und Freigabe

Kurze Tabelle je Lauf: erwartet · tatsächlich · Abweichung · Verdikt. Erst nach deiner Freigabe gehen die drei globalen Schalter auf `true` und die Modelle in die aktive Flag-Liste. Bei Abweichung wird zuerst die Rate Card korrigiert, dann erneut gemessen.

## Was ich von dir brauche

Die Läufe kosten echtes Guthaben und starten im Studio unter deinem Konto. Entweder du klickst die vier Läufe durch und ich lese Abrechnung, Wallet und Mediathek gegen die Erwartungswerte — oder du gibst mir für einen kurzen Zeitraum grünes Licht, sie im Preview mit deiner Sitzung selbst auszulösen.

## Technische Details

- Vergleichsquelle für die tatsächlichen Kosten: die Replicate-Prediction je Lauf (`metrics`, `output`-Maße) sowie der am Lauf gespeicherte Preis-Snapshot in `picture_enhance_runs`.
- Nach bestandener Messung entfällt `costUnverified` für die bestätigten Modelle; `PROVIDER_PRICING_VERSION` wird hochgezählt, alte Läufe behalten ihren Snapshot.
- Weicht die Ausgabegröße von der Erwartung ab, ändert sich nur die Stufenzuordnung in der Rate Card — Margen-Kurve, Wallet- und Refund-Logik bleiben unverändert.
