## Ziel
Wenn im Briefing eindeutig `15 Sekunden` steht, darf im Production Plan und im Board-Toggle nicht mehr `30s` stehen — auch nicht im `Lokaler Fallback-Plan`.

## Diagnose
Der Screenshot zeigt weiterhin `Lokaler Fallback-Plan` mit `30s`. Das bedeutet: Der aktive Pfad ist nicht der volle Backend-Parser, sondern der clientseitige Fallback. Genau dort muss die Briefing-Dauer vor dem Anzeigen des Sheets hart durchgesetzt werden.

Zusätzlich gibt es zwei wahrscheinliche Ursachen:
- Der aktuelle Sync greift erst, wenn der Fallback bereits gebaut wurde. Wenn der Fallback-Plan selbst noch `30s` enthält, zeigt das Sheet weiterhin `30s`.
- Der Nutzer testet auf `useadtool.ai`; falls das die veröffentlichte Domain ist, sieht er ggf. noch den letzten veröffentlichten Build, nicht automatisch die aktuelle Preview-Version.

## Umsetzung

### 1. Kanonische Briefing-Dauer als Single Source of Truth
Ich ergänze/verschärfe einen zentralen Resolver im Client-Fallback, der ausschließlich den echten Briefing-Text liest und den Board-Wert ignoriert.

Er erkennt unter anderem:
- `Gesamtdauer: 15 Sekunden`
- `Gesamtdauer des Videos: 15 Sekunden`
- `15 Sekunden / 3 Szenen à 5s`
- `3 Szenen à 5 Sekunden`
- `3 Szenen insgesamt 15 Sekunden`
- Zeitfenster wie `0–5s`, `5–10s`, `10–15s`
- Varianten mit `Sek.`, `sec`, `s`, Gedankenstrich/Bindestrich und Komma-Zahlen

Wichtig: Der automatisch angehängte Board-Block `Total duration: 30s` darf nie als stärkere Quelle zählen als der ursprüngliche Briefing-Text.

### 2. Dauer vor dem Sheet hart auf den Plan anwenden
Nach jedem Plan-Ergebnis — Backend-Plan, Late-Arrival-Plan und Local-Fallback — wird nochmal geprüft:

```text
Briefing-Dauer erkannt? 
→ plan.project.totalDurationSec = erkannte Dauer
→ Szene-Dauern passend neu verteilen oder auf Zeitfenster setzen
→ plan._meta.debug.canonical_timing speichern
```

Damit kann kein Plan mehr mit `30s` ins Sheet gelangen, wenn das Briefing eindeutig `15s` sagt.

### 3. Board-Toggle sofort synchronisieren
Sobald die kanonische Dauer erkannt wurde, wird vor dem Öffnen des ProductionPlanSheets ausgeführt:

```text
onUpdateBriefing({ duration: 15 })
```

Das passiert für:
- erfolgreichen Backend-Plan
- Local-Fallback-Plan
- später nachgeladenen Backend-Plan

Zusätzlich bleibt der bestehende Sheet-Effect als zweite Sicherung bestehen.

### 4. sichtbarer Diagnose-Chip
Im Plan-Summary-Chip soll eindeutig sichtbar werden:

```text
Skript-Dauer verwendet · 15s
```

Wenn der Fallback aktiv ist:

```text
Lokaler Fallback · Skript-Dauer 15s
```

So sieht man sofort, ob Script-Wins wirklich gegriffen hat.

### 5. Mini-Test direkt gegen dein Briefing
Ich ergänze eine kleine isolierte Testdatei oder lokale Testfunktion für genau dieses Muster:

```text
15 Sekunden / 3 Szenen à 5s
```

Erwartung:

```text
Gesamtdauer: 15s
Szenen: 3
S01: 5s
S02: 5s
S03: 5s
Board patch: duration=15
```

### 6. Veröffentlichung beachten
Wenn du auf `useadtool.ai` testest, muss nach dem Fix nochmal veröffentlicht werden. Sonst prüfst du eventuell weiterhin den alten Stand, obwohl die Preview bereits korrigiert ist.

## Ergebnis
Nach dem Fix kann dieser Widerspruch nicht mehr auftreten:

```text
Briefing: 15 Sekunden
Production Plan: 30s
Board-Toggle: 30s
```

Stattdessen wird der Plan direkt mit `15s` geöffnet und der Toggle automatisch auf `15s` gesetzt.