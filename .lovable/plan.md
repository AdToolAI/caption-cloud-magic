
Problem:
Die verbleibenden deutschen Texte im Post Time Adviser kommen nicht mehr aus den React-Komponenten, sondern aus den Backend-Daten selbst. Die UI nutzt bereits `t('postingTimes...')`, aber die Slot-`reasons` werden von den Backend-Funktionen auf Deutsch erzeugt und dann direkt angezeigt.

Was ich gefunden habe:
- `src/pages/PostingTimes.tsx`, `TopSlotsListPremium.tsx`, `TopSlotsList.tsx`, `HeatmapCalendarPremium.tsx`, `HeatmapCalendar.tsx` sind bereits auf i18n umgestellt.
- Die deutschen Texte im Screenshot stammen aus `slot.reasons[0]` bzw. `slot.reasons.map(...)`.
- Diese Reasons werden in zwei Backend-Funktionen hart auf Deutsch erzeugt:
  1. `supabase/functions/posting-times-api/index.ts`
     - z. B. `Prime-Time Abends`, `Wochenend-Entspannung`, `Basiert auf Branchen-Durchschnitten`, `Saisonal angepasst`
  2. `supabase/functions/generate-posting-slots/index.ts`
     - z. B. `Historisch starke Zeit`, `Positiver Trend (30d)`, `Branchen-Peak-Zeit`

Implementierungsplan:
1. `posting-times-api` sprachfähig machen
- Request-Body um `language` erweitern (`en`/`de`/`es`).
- Alle festen Reason-Texte dort in sprachabhängige Labels umwandeln.
- Plattform-Peak-Reasons nicht mehr als fertige deutsche Strings speichern, sondern pro Sprache ausgeben.
- Auch Sammelgründe wie:
  - seasonal boosted/adjusted
  - based on industry averages
  - personalized + industry trend
  lokalisieren.

2. `generate-posting-slots` ebenfalls lokalisieren
- Die dort erzeugten `reasons` auf Englisch umstellen oder besser ebenfalls sprachabhängig generieren.
- Wichtig: Diese Funktion schreibt in `posting_slots`; deshalb müssen künftig neu generierte Slots keine deutschen Reasons mehr speichern.

3. Frontend-Request erweitern
- In `src/hooks/usePostingTimes.ts` die aktive Sprache mitsenden:
  - `body: { platform, days, tz, language }`
- Query-Key um `language` ergänzen, damit beim Sprachwechsel korrekt neu geladen wird und kein alter Cache wiederverwendet wird.

4. Caching sauber machen
- In `posting-times-api` den Cache-Key ebenfalls um `language` erweitern.
- Sonst könnte bei englischer UI weiterhin eine zuvor auf Deutsch gecachte Antwort zurückkommen.

5. Bestehende deutsche Slot-Daten berücksichtigen
- Da `posting_slots.reasons` bereits deutsch in der DB liegen können, reicht eine reine UI-Änderung nicht.
- Ich würde beim Laden aus `posting_slots` die Reasons serverseitig überschreiben bzw. normalisieren:
  - entweder vorhandene gespeicherte Reasons ignorieren und aus `features`/Score neu sprachabhängig ableiten
  - oder mindestens bekannte deutsche Alt-Texte per Mapping in die gewünschte Sprache umwandeln.
- So sieht der Nutzer sofort Englisch, auch bevor ein kompletter Regenerationslauf alle Slots neu schreibt.

6. Optional robuster Schritt
- Falls gewünscht, zusätzlich die gespeicherten `posting_slots` für alle Nutzer bei neuer Generierung in neutraler Form halten:
  - statt lokalisierter Texte lieber Reason-Codes / Features speichern
  - Texte erst beim Response der API in die Zielsprache rendern.
- Das wäre die nachhaltigste Lösung gegen zukünftige Sprachmischungen.

Betroffene Dateien:
- `src/hooks/usePostingTimes.ts`
- `supabase/functions/posting-times-api/index.ts`
- `supabase/functions/generate-posting-slots/index.ts`

Technische Details:
```text
Aktuelle Ursache:
UI zeigt slot.reasons direkt an
        ↓
posting-times-api liest/generiert reasons
        ↓
reasons sind im Backend deutsch hardcodiert
        ↓
englische UI zeigt trotzdem deutsche Inhalte
```

Empfohlene Umsetzung:
```text
Frontend sendet language
        ↓
posting-times-api lokalisiert Response anhand language
        ↓
Cache getrennt pro Sprache
        ↓
Alt-Daten werden serverseitig normalisiert
        ↓
UI bleibt sprachkonsistent
```

Erwartetes Ergebnis:
- Die gesamte Posting Times Ansicht ist in EN/DE/ES konsistent.
- Kein deutscher Slot-Reason mehr in der englischen UI.
- Sprachwechsel aktualisiert auch die API-Daten korrekt statt nur statische Labels.
