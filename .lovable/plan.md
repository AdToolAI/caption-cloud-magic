# Szenenkarte: Skript-Bereich sichtbar machen + Director Score entschärfen

Zwei UI-Probleme in der aufgeklappten Szenenkarte.

## 1) Skript-Studio fehlt bei neuen Szenen

Der Block "AUDIO & VOICEOVER" wird immer gezeigt, das Skript-Studio darunter aber nur, wenn
"Dialog & Lip-Sync" für die Szene eingeschaltet ist. Bei einer neu erstellten Szene ist das aus,
also bleibt unter der Überschrift eine leere Fläche — es sieht aus, als wäre der Skript-Bereich
verschwunden.

Änderung: Wenn Dialog & Lip-Sync aus ist, erscheint an genau der Stelle ein erklärender
Platzhalter statt Leere:

```text
AUDIO & VOICEOVER
Skript-Studio, Lip-Sync und Director Score
┌──────────────────────────────────────────────────────────────┐
│  Skript-Studio ist für diese Szene noch nicht aktiv.        │
│  Aktiviere Dialog & Lip-Sync, um Sprechertext zu schreiben,  │
│  Voiceover zu erzeugen und Lip-Sync zu rendern.              │
│  [ Dialog & Lip-Sync aktivieren ]   [ Zum Umschalter ]       │
└──────────────────────────────────────────────────────────────┘
```

- "Dialog & Lip-Sync aktivieren" ruft exakt denselben bestehenden Umschalt-Pfad auf wie der
  Schalter im Block "Story & Engine" (inkl. Provider-Rückfrage, wenn das Modell kein
  zertifizierter Lip-Sync-Provider ist). Keine neue Logik, kein zweiter Persistenz-Pfad.
- "Zum Umschalter" scrollt zum Story-&-Engine-Schalter, damit klar ist, wo die Einstellung wohnt.
- Ist die Szene keine KI-Szene (Stock/Upload), zeigt der Platzhalter nur den Hinweis ohne Button.

## 2) Der "57 / Regisseur würde neu drehen"-Block

Zwei Ursachen für die unproduktive Anzeige:

- Die Achse "Aktion" liest ausschließlich das Feld "Was passiert in der Szene". Die pro Charakter
  eingetragenen Aktionen ("geht von rechts nach links", "setzt sich auf einen Stuhl",
  "schüttelt Samuel die Hand") werden ignoriert — deshalb "Keine Aktion", obwohl die Szene
  konkret durchgeplant ist.
- Die Sprache ist ein Urteil ("Regisseur würde neu drehen") statt eines Hinweises, und der Block
  ist im roten Alarm-Look, obwohl er nur beratend ist.

Änderungen:

- Aktions-Achse zusätzlich aus den Charakter-Aktionen speisen: konkrete Aktionszeilen zählen wie
  Szenenbeschreibung. Nur Auto-Platzhalter-Zeilen zählen weiterhin nicht.
- Verdikt-Texte neutral: "Drehbereit" / "Optimierbar" / "Noch Lücken" (analog EN/ES) — kein
  Aufruf zum Neu-Drehen.
- Ruhigerer Look: Der Block bleibt eingeklappt und wird nicht mehr rot/glühend, sondern dezent
  eingefasst; die Zahl behält ihre Farbe, damit die Ampel-Info bleibt.
- Der Block bleibt an derselben Stelle, weiter aufklappbar mit allen Coach-Tipps.

## Technische Details

- `src/components/video-composer/SceneCard.tsx`: Platzhalter im Audio-Block rendern, wenn
  `scene.dialogMode !== true`; Button ruft `applyDialogModeToggle(true)` bzw. öffnet bei
  nicht zertifiziertem Provider dieselbe Provider-Rückfrage wie der bestehende Schalter.
- `src/lib/motion-studio/qualityScore.ts`: Aktions-Achse berücksichtigt zusätzlich die
  `[CastActions]`-Zeilen (Boilerplate via `isBoilerplateAction` weiterhin ausgeschlossen).
- `src/components/video-composer/director-console/DirectorQualityCoach.tsx`: Verdikt-Labels
  neutral formuliert (EN/DE/ES), Ring-/Shadow-Styling gedämpft.
- Keine Änderungen an Edge Functions, Prompt-Bau oder Lip-Sync-Pipeline.
