

## Abgelaufene Posts automatisch neu planen + Gruener Erledigungshaken

### Problem
Posts deren Uhrzeit bereits vergangen ist, bleiben unveraendert stehen. Es fehlt ein visueller "erledigt"-Indikator und ein automatisches Verschieben verpasster Posts.

### Aenderungen

| Datei | Aenderung |
|---|---|
| `src/components/dashboard/WeekDayCard.tsx` | 1) Neuen Status `missed` hinzufuegen (rot/orange, "Verpasst") mit automatisch berechneter neuer Zeit. 2) Bei `published`-Status: grosser gruener leuchtender Haken mit Glow-Effekt (`shadow-[0_0_8px_rgba(34,197,94,0.6)]`) statt kleinem Status-Badge. 3) Logik: wenn `post.status !== 'published'` und aktuelle Uhrzeit > `suggestedTime` am selben Tag → als `missed` anzeigen mit neuer vorgeschlagener Zeit (+2h oder naechster sinnvoller Slot). |
| `src/pages/Home.tsx` | In `loadDashboardData`: beim Mappen der Posts pruefen ob Posting-Zeit ueberschritten ist (Vergleich `now` mit `suggestedTime` am heutigen Tag). Wenn ja und Status nicht `published`: neuen `suggestedTime` berechnen (aktuelle Zeit + 1-2h, aufgerundet auf :00/:30) und Status auf `missed` setzen. Optional: Starter-Plan in DB updaten mit neuer Zeit. |

### Status-System erweitert

| Status | Farbe | Icon | Bedeutung |
|---|---|---|---|
| suggested | Grau | Sparkles | KI-Vorschlag |
| scheduled | Gelb | Clock | Geplant |
| missed | Orange/Rot | AlertCircle | Verpasst, neue Zeit gesetzt |
| published | Gruen + Glow | CheckCircle2 | Erledigt ✓ |

### Gruener Haken bei Published
- Grosser `CheckCircle2`-Icon mit gruener Farbe und CSS-Glow
- Gesamte Post-Karte bekommt gruenen Rand + leichten gruenen Hintergrund
- Status-Label "Erledigt ✓" prominent angezeigt

### Auto-Reschedule Logik (client-seitig in Home.tsx)
```text
Fuer jeden Post am heutigen Tag:
  if (status !== 'published' && now > suggestedTime):
    → Neue Zeit = naechste volle/halbe Stunde + 1h
    → Falls > 22:00 → auf morgen 09:00 verschieben
    → Status = 'missed' (visuell orange)
    → User kann ueber "Bearbeiten" neue Zeit waehlen
```

