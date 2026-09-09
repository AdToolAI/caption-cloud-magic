# v516 — Seedance 2.5 Video-Input: Abrechnungs- und Margen-Audit

Stand: 10.09.2026 · **Read-only.** Keine Preise, keine Routen, keine Modellverfügbarkeit geändert. Keine bezahlten Tests ausgeführt.
Quellen: Produktionscode, `ai_video_generations`, `ai_video_transactions`, `composer_continuity_queue`, `composer_scenes`, BytePlus-Septemberabrechnung (v514), Replicate-Preismatrizen (v515).
Umrechnung durchgehend USD→EUR mit dem in v514 aus der echten Rechnung abgeleiteten Kurs (1 EUR = 1,1498 USD); Nettorechnung `brutto ÷ 1,19 × 0,90` (19 % MwSt., 10 % Zahlungsgebühren-Reserve).

---

## Kurzfassung

**Die 4,2× stimmen — aber es ist noch kein einziger Euro davon angefallen.** Grund: **jeder** bisher versuchte Video-Input-Job ist beim Provider mit HTTP 400 abgeprallt, bevor eine Abrechnung entstand. Drei Versuche insgesamt, alle fehlgeschlagen, alle korrekt zurückerstattet.

Das Risiko ist trotzdem real und akut: Sobald ein Video-Input-Job durchläuft, verkaufen wir zum Normalpreis (€0,3333/s brutto) etwas, das €0,84/s Providerkosten verursacht. Das ist kein dünner Deckungsbeitrag, sondern ein **Verlust von rund €0,59 pro Sekunde** — bei 15 s knapp **€10 Verlust pro Clip**.

---

## 1. Alle Routen mit Video-Input

| # | Feature (Frontend) | Backend | ModelArk-Request | Modus | Auflösung | Kundenpreis | Providerkosten erwartet | Reale Kosten |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | AI Video Studio → Referenz-Video-Slot (`ToolkitGenerator.tsx`, sichtbar weil `capabilities.v2v: true`) | `generate-seedance25-video` | `content[]` mit `type: video_url`, `role: reference_video` | `v2v` | 720p (480p im Spec gesperrt) | €0,3333/s brutto | $0,9676/s = **€0,8415/s** | **noch nie abgerechnet** |
| B | Composer → Nahtloser Übergang (v426, `transition: clip-reference`) | `compose-video-clips` → `createSeedance25Task` (`_shared/modelark.ts`) | Vorgänger-Clip als `reference_video` neben Referenzbildern | intern `references` + Video | 720p (`pro`) / 480p (`standard`) | €0,3333 bzw. €0,1932/s | €0,8415 bzw. €0,3743/s | **nie ausgelöst** |
| C | Composer → Szenen-Upload für Runway Aleph | `compose-video-clips` | – | – | – | – | – | Route stillgelegt (`runway_route_retired`), fällt auf Hailuo zurück |
| D | Spec-Modus `edit` (Video-Bearbeitung) | – | – | `edit` | 720p | €0,3333/s | €0,8415/s | **kein UI-Einstieg, nie aufgerufen** |

Weitere versteckte Video-Input-Helfer existieren nicht: die Suche nach `referenceVideoUrls` trifft ausschließlich `modelark.ts`, `generate-seedance25-video`, `compose-video-clips`, `videoRequestPreflight` und `ToolkitGenerator`.

**Der zentrale Fehler in der Preislogik:** In `videoModelSpecs.ts` zeigen *alle* Seedance-2.5-Modi — `t2v`, `i2v`, `firstLast`, `reference`, `v2v`, `edit` — auf dieselben zwei Preis-Tiers `seedance-2-5` (720p) und `seedance-2-5-480p`. Der Katalog kennt keinen Video-Input-Tarif. Der Modus `reference` erlaubt zusätzlich `videos: { min: 0, max: 10 }`, d. h. **auch ein als „reference" abgerechneter Job kann ein Video enthalten** und würde zum Normalpreis laufen.

---

## 2. Bestätigung der Provider-Rate

| Quelle | Seedance 2.5 720p ohne Video-In | mit Video-In | Faktor |
| --- | --- | --- | --- |
| Replicate-Preismatrix (Live-Abruf 09.09.2026) | $0,2312/s | $0,9676/s | 4,19× |
| BytePlus-Rechnung September (real gemessen) | $0,2318/s | **nicht enthalten** | – |
| ModelArk-SKU-Katalog | `…-inference-non-video-in-480p-720p`, $0,0107/K Token | Video-In-SKU **nicht in unserer Rechnung** | – |

Der Nicht-Video-Wert ist damit doppelt belegt (Rechnung und Replicate weichen um 0,3 % ab). Der Video-Input-Wert ist **nur über Replicate belegt**, nicht über unser BytePlus-Konto — Replicate hat sich bei allen anderen Seedance-Positionen aber als exakter Pass-Through der ByteDance-Liste erwiesen, deshalb ist $0,9676/s die derzeit belastbarste Zahl. Auch 480p ist betroffen: $0,1028 → $0,4304/s, ebenfalls 4,19×.

Der SKU-Name selbst („non-video-in") beweist, dass ByteDance zwei getrennte Positionen führt. Der Aufschlag ist also strukturell, nicht Replicate-spezifisch.

---

## 3. Warum die teure SKU in der Septemberabrechnung fehlt — die exakte Ursache

**Weil kein einziger Video-Input-Job jemals erfolgreich war.** Alle drei Versuche in `ai_video_generations` mit `parity_mode = 'v2v'` sind mit HTTP 400 bei der Task-Erstellung gescheitert — also *bevor* ModelArk Tokens erzeugt und abrechnet:

| Datum | Dauer | Kundenpreis | Fehler des Providers |
| --- | --- | --- | --- |
| 07.09. 17:35 | 12 s | €3,96 | `InvalidParameter` — „first/last frame content cannot be mixed with reference media content" (unser Payload schickte Startbild **und** Video) |
| 09.09. 13:08 | 15 s | €4,95 | `InputVideoSensitiveContentDetected.PrivacyInformation` — „input video may contain real person" |
| 09.09. 13:09 | 15 s | €4,95 | identisch |

Alle drei wurden korrekt und vollständig erstattet (Abbuchung €3,17/€3,96/€3,96 inkl. Founder-Rabatt, jeweils Gegenbuchung in gleicher Höhe). Kein Kunde hat für einen dieser Fehlversuche gezahlt.

Die anderen möglichen Erklärungen wurden geprüft und **ausgeschlossen**:
- *Andere SKU?* Nein — gescheiterte Tasks erzeugen laut v514 grundsätzlich keine Abrechnungszeile (50 Fehl-Jobs im September, null Rechnungspositionen).
- *Anderer Abrechnungszyklus?* Nein — die beiden Versuche vom 09.09. liegen zwar im laufenden Zyklus, sind aber ebenfalls gescheitert.
- *Composer-Übergänge nutzen doch kein Video?* Korrekt, und zwar bisher nie: `composer_continuity_queue` ist leer, und **keine einzige** Szene in `composer_scenes` hat eine `continuity_source_clip_url`. Der v426-Pfad ist gebaut, aber in Produktion noch nie gelaufen.
- *Verzögerte Abrechnungsdaten?* Nicht relevant, da keine erfolgreiche Generierung existiert.

**Nebenbefund (eigener Fehler, nicht Provider):** Der erste Versuch beweist einen Payload-Bug — wir haben Startbild und Referenzvideo gleichzeitig gesendet, obwohl ModelArk genau einen Input-Modus akzeptiert. Der Preflight in `videoRequestPreflight.ts` hat das durchgelassen. Kostenneutral, weil der Provider abgelehnt hat, aber es ist eine echte Lücke im Exklusiv-Slot-Vertrag.

**Zweiter Nebenbefund:** ModelArk blockt Videos mit erkennbaren echten Personen grundsätzlich (`PrivacyInformation`) — dieselbe Schranke, die wir bei Cast-Porträts schon kennen (v422). Für nahtlose Übergänge zwischen Szenen mit Menschen ist der Video-Input-Weg damit **fachlich weitgehend versperrt**, unabhängig vom Preis.

---

## 4. Kundenpreis gegen echte Kosten

720p, alles pro Sekunde:

| | Brutto | davon MwSt. (19 %) | Netto | Zahlungsreserve (10 %) | Erlös nach Abzügen | Providerkosten | Deckungsbeitrag | Faktor |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Ohne Video-Input, Standard** | €0,3333 | €0,0532 | €0,2801 | €0,0280 | €0,2521 | €0,2016 | **+€0,0505** | 1,25× |
| Ohne Video-In, Founder −10 % | €0,3000 | €0,0479 | €0,2521 | €0,0252 | €0,2269 | €0,2016 | +€0,0253 | 1,13× |
| **Mit Video-Input, Standard** | €0,3333 | €0,0532 | €0,2801 | €0,0280 | €0,2521 | **€0,8415** | **−€0,5894** | **0,30×** |
| Mit Video-In, Founder −10 % | €0,3000 | €0,0479 | €0,2521 | €0,0252 | €0,2269 | €0,8415 | **−€0,6146** | **0,27×** |
| Mit Video-In, Alt-Founder −20 % | €0,2666 | €0,0426 | €0,2241 | €0,0224 | €0,2017 | €0,8415 | **−€0,6398** | **0,24×** |

480p:

| | Erlös nach Abzügen | Providerkosten | Deckungsbeitrag | Faktor |
| --- | --- | --- | --- | --- |
| Ohne Video-In, Standard | €0,1461 | €0,0903 | +€0,0558 | 1,62× |
| Ohne Video-In, Founder −10 % | €0,1315 | €0,0903 | +€0,0412 | 1,46× |
| **Mit Video-In, Standard** | €0,1461 | **€0,3743** | **−€0,2282** | **0,39×** |
| Mit Video-In, Founder −10 % | €0,1315 | €0,3743 | −€0,2428 | 0,35× |

Pro typischem Clip: **15 s / 720p** = €5,00 brutto beim Kunden, €12,62 Providerkosten → **−€8,84 Verlust**. **30 s / 720p** = €10,00 brutto, €25,25 Kosten → **−€17,60**.

**Einstufung:**
- 🔴 **Verlustbringend:** jede Seedance-2.5-Generierung mit Video-Input, in jeder Auflösung, für jede Kundengruppe. Auch Modus `reference` ist betroffen, sobald ein Video mit im Payload liegt.
- 🟡 **Unter 1,20× nach Founder-Rabatt:** Seedance 2.5 720p ohne Video-Input (1,13×) — bereits aus v514 bekannt, unverändert offen.
- 🟢 Unauffällig: Seedance 2.5 480p (1,46× Founder), Seedance 2.0/2.0 Fast.

---

## 5. Vorschlag für die Preisstruktur (nicht umgesetzt)

Empfohlen ist eine **saubere Trennung in zwei Produkte**, kein versteckter Zuschlag:

| Produkt | Modi | 720p brutto | 480p brutto | Faktor Standard | Faktor Founder −10 % |
| --- | --- | --- | --- | --- | --- |
| Seedance 2.5 Standard | t2v, i2v, first/last, Referenz**bilder** | €0,3333/s (unverändert, bzw. die aus v513/v514 vorgeschlagene Anhebung) | €0,1932/s | 1,25× | 1,13× |
| **Seedance 2.5 Video-Referenz** | v2v, edit, Referenz **mit Video**, nahtloser Übergang | **€1,25/s** | **€0,56/s** | 1,12× | 1,01× |
| Seedance 2.5 Video-Referenz, Zielmarge 1,45× | | **€1,62/s** | **€0,72/s** | 1,45× | 1,31× |

Technisch heißt das: zwei zusätzliche Katalog-Tiers (`seedance-2-5-video-in`, `seedance-2-5-480p-video-in`), und die Tier-Auswahl darf nicht mehr am Modell hängen, sondern muss am **tatsächlichen Payload** entscheiden — sobald ein `reference_video` mitgeht, greift der teure Tarif. Der Modus `reference` braucht dafür eine Verzweigung.

Dazu drei Regeln:
1. **Preisanzeige vor der Generierung.** Sobald der Nutzer ein Video in den Referenz-Slot legt, ändert sich der angezeigte Preis sichtbar, mit kurzer Begründung („Video-Referenz — höherer Providertarif").
2. **Kein stiller Aufschlag, keine Nachbelastung.** Der Deckel wird vorab reserviert, die Korrektur läuft wie beim Video-Enhance über eine idempotente Gutschrift.
3. **Im Composer** muss der nahtlose Übergang als kostenpflichtige Option erkennbar sein, nicht als unsichtbare Qualitätsverbesserung.

Bis dahin die vorsichtige Zwischenlösung (ebenfalls noch nicht umgesetzt, auf deine Freigabe): den Video-Input-Pfad **fail-closed sperren**, statt ihn zum Normalpreis laufen zu lassen. Der Weg ist ohnehin durch den Personen-Filter des Providers weitgehend blockiert, und wir würden nichts verlieren, was heute funktioniert.

---

## 6. Ist der teure Weg für Übergänge überhaupt nötig?

| Ansatz | Wie | Providerkosten (720p, 5 s Übergang) | Qualität | Aufwand | Ersparnis |
| --- | --- | --- | --- | --- | --- |
| **Video-Input Seedance 2.5** (heute vorgesehen) | Vorgänger-Clip als `reference_video` | **€4,21** | theoretisch bestes Bewegungs-Matching; **praktisch blockiert**, sobald Menschen im Bild sind | gebaut, aber nie erfolgreich | – |
| **Frame-Chain / Last-Frame → First-Frame** (v426 bereits vorhanden) | Letztes Bild des Vorgängers wird Startbild des Nachfolgers | **€1,01** | für Schnitt-Übergänge praktisch gleichwertig; kein Bewegungsimpuls über die Naht hinweg | **null** — Code existiert, ist der Standardpfad | **€3,20 je Übergang, 76 %** |
| **First+Last-Frame-Brücke** | Eigener kurzer Brücken-Clip zwischen Endbild A und Startbild B | €1,01 (+1 Clip) | sehr weiche Übergänge, volle Kontrolle | gering, Modus existiert | ~70 % |
| Kling 3.0 Omni v2v | 1080p, Video-Referenz | €1,00 | hohe Qualität, aber **kein Audio mit `reference_video`** und andere Bildanmutung als Seedance | mittel, Route existiert | 76 % |
| Seedance 2.0 v2v | – | – | – | Modus nicht freigeschaltet | – |

**Klare Empfehlung:** Der teure Weg ist **nicht nötig**. Der bereits implementierte Frame-Chain-Pfad erreicht bei realen Schnitten praktisch dasselbe Ergebnis zu einem Viertel der Kosten und stolpert nicht über den Personen-Filter. Der Video-Input sollte höchstens als bewusst gewählte, sichtbar teurere Premium-Option bestehen bleiben — nicht als Automatik im Hintergrund.

---

## 7. Routing-Entscheidungen — unverändert übernommen

- Seedance 2.5: bleibt direkt auf ModelArk. ✔
- Seedance 1 Lite: bleibt auf Replicate (direkt 7,5 % teurer). ✔
- Seedance 2.0 / 2.0 Fast: Migration nur nach bestätigter Feature-Parität, Begründung ausschließlich Volumenbündelung und Verhandlungsposition — **nicht** Kostenersparnis. Vorbereitet, nicht ausgeführt.
- Kundenpreise: unverändert. ✔

---

## 8. BytePlus-Rabattszenarien

Faktoren nach 19 % MwSt. und 10 % Zahlungsreserve, Standardkunde (Founder −10 % in Klammern):

| Rabatt | 2.5 480p | 2.5 720p | 2.0 720p | 2.0 Fast 720p | **2.5 720p mit Video-In** |
| --- | --- | --- | --- | --- | --- |
| 0 % | 1,62× (1,46×) | 1,25× (1,13×) | 1,86× (1,67×) | 1,81× (1,63×) | **0,30× (0,27×)** |
| 5 % | 1,70× (1,53×) | 1,32× (1,19×) | 1,96× (1,76×) | 1,91× (1,72×) | **0,32× (0,28×)** |
| 10 % | 1,80× (1,62×) | 1,39× (1,25×) | 2,07× (1,86×) | 2,01× (1,81×) | **0,33× (0,30×)** |
| 15 % | 1,90× (1,71×) | 1,47× (1,32×) | 2,19× (1,97×) | 2,13× (1,92×) | **0,35× (0,32×)** |
| 20 % | 2,02× (1,82×) | 1,56× (1,41×) | 2,32× (2,09×) | 2,26× (2,03×) | **0,37× (0,33×)** |

(Für 2.0 / 2.0 Fast unter der Annahme, dass ModelArk den Replicate-Listenpreis stellt — bei 2.5 hat sich diese Annahme bestätigt.)

**Wert der Verhandlung, gerechnet auf das reale Volumen der letzten 120 Tage** (1.641 s Seedance 2.5 720p + 951 s gescheiterte, die uns nichts kosten): 10 % Rabatt sparen rund **€33 pro Quartal**. Das ist bei heutigem Volumen wenig — die Verhandlung lohnt als Vorbereitung auf Wachstum, nicht als kurzfristige Maßnahme.

Und die entscheidende Aussage der Tabelle: **kein Rabatt der Welt repariert den Video-Input-Tarif.** Selbst bei 20 % bleiben wir bei 0,37× — also tief im Verlust. Das ist ausschließlich eine Preis- oder Routing-Entscheidung, keine Einkaufsfrage.

---

## 9. Noch benötigte bezahlte Tests

Zwei Tests aus v515 sind durch dieses Audit **hinfällig** geworden (Test 3 zum Video-Input-SKU ist durch die drei realen Fehlversuche und die Replicate-Matrix hinreichend beantwortet — bzw. würde am Personen-Filter scheitern). Es bleiben:

| # | Zweck | Modell / Route | Konfiguration | Geschätzte Kosten | Warum nötig |
| --- | --- | --- | --- | --- | --- |
| 1 | Ist `dreamina-seedance-2-0-260128` in unserem Konto/Region freigeschaltet, und welche Rate berechnet BytePlus? | Seedance 2.0 · ModelArk | T2V, 480p, 4 s, ohne Audio | ≈ $0,32 | Ohne bestätigte Verfügbarkeit und Rate ist die Migrationsentscheidung reine Spekulation |
| 2 | dasselbe für die schnelle Variante | Seedance 2.0 Fast · ModelArk | T2V, 480p, 4 s | ≈ $0,28 | wie oben |
| 3 | Echte Video-In-Rate auf **unserem** Konto messen | Seedance 2.5 · ModelArk | 480p, 4 s, Referenzvideo **ohne Personen** (z. B. Landschaft) | ≈ $0,42–1,72 | Einzige Möglichkeit, die $0,4304/s an unserer eigenen Rechnung zu belegen; Personen-freies Material umgeht den Privacy-Filter |
| 4 | Günstigere Draft-Stufe bewerten | Seedance 2.0 Mini · ModelArk | T2V, 480p, 4 s | ≈ $0,20 (unbekannt) | Optional, nur bei Interesse an einer Economy-Stufe |

Gesamt: **4 Calls, ca. $1,20–2,60.** Empfehlung: Test 3 zuerst, danach 1 und 2 gemeinsam. Nichts davon wurde gestartet.

---

## Fazit

| Frage | Antwort |
| --- | --- |
| Normale Seedance-Abrechnung | Bestätigt: $0,2318/s (720p) und $0,1039/s (480p), doppelt belegt über eigene Rechnung und Replicate-Liste |
| Video-Input-Abrechnung | 4,19× teurer ($0,9676/s bzw. $0,4304/s), SKU-getrennt („non-video-in") — bei uns **noch nie angefallen**, weil alle drei Versuche mit HTTP 400 scheiterten |
| Margenrisiko | Jede Video-Input-Generierung wäre bei 0,24–0,39× ein klarer Verlust; zusätzlich bleibt 2.5 720p ohne Video mit 1,13× für Founder zu dünn |
| Übergangs-Alternativen | Ja, der teure Weg ist vermeidbar — Frame-Chain kostet 76 % weniger, ist bereits gebaut und umgeht den Personen-Filter des Providers |
| Direct vs. Replicate | 2.5 direkt behalten, 1 Lite bei Replicate, 2.0/2.0 Fast nur zur Volumenbündelung — deine Einschätzung wird durch die Zahlen vollständig gestützt |
| BytePlus-Rabatt | 5–20 % verbessern die normalen Tarife spürbar, sind beim heutigen Volumen aber nur ~€33/Quartal wert und lösen das Video-Input-Problem nicht |
