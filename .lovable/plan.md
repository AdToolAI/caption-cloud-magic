

## Erweiterte Wochenuebersicht mit Post-Details, Upload & Bearbeitung

### Problem
Die aktuelle Wochenuebersicht zeigt nur Tagesnummern und kleine Farbstreifen pro Plattform. Es fehlen: Content-Beschreibung, Uhrzeit, Erledigungsstatus (gruen), Upload-Moeglichkeit und Inline-Bearbeitung.

### Loesung

Die 7-Tage-Grid-Ansicht wird zu erweiterbaren Tageskarten umgebaut. Jeder Tag zeigt Posts mit Details, Uhrzeit, Status und Aktionsbuttons.

```text
┌─ MI 25 (heute) ────────────────────────────────┐
│ ✅ 18:00  📷 Instagram                         │
│ "5 Tipps fuer bessere Reels"                   │
│ [Bearbeiten] [Hochladen]                       │
├─────────────────────────────────────────────────┤
│ ⏳ 20:00  🎵 TikTok                            │
│ "Behind the Scenes deines Workflows"           │
│ [Bearbeiten] [Hochladen]                       │
└─────────────────────────────────────────────────┘
```

### Aenderungen

| Datei | Aenderung |
|---|---|
| `src/components/dashboard/WeekDayCard.tsx` | NEU — Einzelne Tageskarte: zeigt Posts mit Uhrzeit, Plattform-Badge, Content-Idee/Caption, Status-Indikator (gruen=erledigt, gelb=geplant, grau=offen). Buttons: "Bearbeiten" (oeffnet Inline-Editor oder navigiert zu Post-Generator mit Prefill), "Hochladen" (Datei-Upload der direkt in calendar_events + post-generator Pipeline geht). |
| `src/components/dashboard/WeekPostEditor.tsx` | NEU — Inline-Edit-Dialog: Caption bearbeiten, Hashtags anpassen, Bild/Video hochladen. Speichert als calendar_event und triggert optional den AI Post Generator fuer Text-Optimierung. |
| `src/pages/Home.tsx` | Wochenuebersicht: weekDays-Daten erweitern um content_idea, suggested_time, tips, status pro Post. Grid von 7-Spalten-Dots zu vertikaler Tageskarten-Liste oder scrollbares horizontales Layout umbauen. Upload-Handler der Medien in Storage speichert und calendar_event erstellt. |
| `src/pages/Home.tsx` (loadDashboardData) | Starter-Plan Posts und echte calendar_events mit vollen Daten laden (content_idea, caption, time, status). Status "created"/"published" = gruen, "scheduled" = gelb, "suggested"/"draft" = grau. |

### Datenfluss: Upload → Auto-Post

```text
User klickt "Hochladen" bei Tag X
  → Datei-Upload in Storage (media bucket)
  → Neuer calendar_event wird erstellt (Datum/Uhrzeit vom Slot)
  → Optional: AI Post Generator Edge Function wird aufgerufen (Caption + Hashtags generieren)
  → calendar_event wird aktualisiert mit generiertem Text
  → Wochenuebersicht refresht → Post erscheint als "geplant" (gelb)
  → Bei Veroeffentlichung → Status wird "published" (gruen)
```

### Status-Farben

| Status | Farbe | Bedeutung |
|---|---|---|
| suggested/draft | Grau | Vorgeschlagen, noch nicht bearbeitet |
| scheduled | Gelb/Primary | Geplant, wartet auf Veroeffentlichung |
| published/created | Gruen | Erledigt/Veroeffentlicht |

### Implementierungsreihenfolge

1. WeekDayCard-Komponente mit erweiterter Darstellung (Details, Zeit, Status-Farben)
2. Home.tsx weekDays-Daten erweitern (volle Post-Infos statt nur platform)
3. WeekPostEditor-Dialog fuer Inline-Bearbeitung (Caption, Hashtags, Media-Upload)
4. Upload-Flow: Storage + calendar_event erstellen + optional AI Post Generator aufrufen
5. Status-Tracking: Gruen faerben wenn Post erledigt/veroeffentlicht

