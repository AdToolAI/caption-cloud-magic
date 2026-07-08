# Provider-Risk-Warnung im Kosten-Bestätigungs-Dialog

## Entscheidungen aus Q&A

- **Keine Auto-Migration.** Kling & andere Provider bleiben wählbar. Nutzer entscheidet selbst.
- **Reine Aufklärung + Haftungsausschluss** im bestehenden Kosten-Fenster vor "Clip generieren".
- **Refund-Ausschluss betrifft ausschließlich Lipsync-Artefakte** (Ghost-Mouthing, Mund-Fehler, Sync-Drift). Lambda-Timeouts, Sync.so-Ausfälle, Netzwerkfehler etc. bleiben refundfähig wie gehabt.

## Provider-Klassifikation (eine zentrale Stelle)

Neue Konstante `LIPSYNC_SAFE_PROVIDERS = ['ai-hailuo', 'ai-happyhorse']` in `src/config/lipsyncProviderSafety.ts`.

Helper: `isLipsyncRisky(clipSource, hasLipsync, speakerCount)` → boolean.
Trigger: `hasLipsync === true` UND `clipSource ∉ LIPSYNC_SAFE_PROVIDERS`. Bei N≥2 wird die Warnung schärfer formuliert, aber gleicher Mechanismus.

## Kosten-Bestätigungs-Dialog

Ort: das bestehende Modal, das beim Klick auf "Clip generieren" die Kosten pro Provider auflistet. (Konkret: der Confirm-Step im Composer vor `compose-video-clips`-Dispatch — Datei-Lokalisierung Teil der Implementation.)

**Bestehende Struktur bleibt.** Wir fügen nur einen konditionalen Warn-Block hinzu, wenn `isLipsyncRisky(...)` true ist:

```
┌─────────────────────────────────────────────────┐
│  Kostenübersicht                                │
│  [bestehende Cost-Breakdown-Tabelle]            │
│                                                 │
│  ⚠️  Hinweis zu Lipsync mit {ProviderName}      │
│                                                 │
│  {ProviderName} liefert bei Lipsync-Szenen      │
│  {N≥2 ? "mit mehreren Sprechern " : ""}nicht    │
│  zuverlässige Ergebnisse. Es kann zu            │
│  Ghost-Mouthing, verzerrten Gesichtern und      │
│  falschen Mundbewegungen kommen.                │
│                                                 │
│  Für stabile Lipsync-Renderings empfehlen wir   │
│  Hailuo oder HappyHorse.                        │
│                                                 │
│  Wenn du trotzdem fortfährst:                   │
│  • Die Plattform übernimmt keine Haftung für    │
│    Lipsync-bezogene Bildfehler.                 │
│  • Eine Rückerstattung der Credits für          │
│    Lipsync-Artefakte ist in diesem Fall         │
│    ausgeschlossen.                              │
│  • Andere Fehlerarten (Timeouts, System-        │
│    ausfälle) bleiben weiter refundfähig.        │
│                                                 │
│  ☐  Ich habe die Risiken verstanden und         │
│      möchte trotzdem fortfahren.                │
│                                                 │
│  [Abbrechen]      [Trotzdem generieren]         │
└─────────────────────────────────────────────────┘
```

- Checkbox muss aktiv sein, sonst ist "Trotzdem generieren" disabled.
- Ohne Risiko-Fall: Dialog verhält sich exakt wie heute, kein Warn-Block, kein Extra-Klick.
- Copy in DE + EN + ES (Core-Localization-Regel).

## Consent-Protokollierung (für den Refund-Ausschluss)

Damit der Ausschluss nachvollziehbar ist:

- Beim Bestätigen wird auf der Szene / im Job-Record markiert: `risky_provider_acknowledged: true`, `acknowledged_provider: 'ai-kling'`, `acknowledged_at: <timestamp>`.
- Feld sitzt in einer bestehenden Job-Metadata-Spalte (z.B. `composer_scenes.metadata` oder analog `dialog_shots`) — kein neues Schema, nur ein Key mehr im JSONB.
- Der Credit-Refund-Automat (siehe Memory `Credit Refund Automation`) prüft diesen Key vor Refund: wenn `true` und Fehlerkategorie = `lipsync_artifact`, kein Auto-Refund. Andere Fehlerkategorien (Lambda-Timeout, Provider-500, Sync.so-Terminal) refunden unverändert.

## Was NICHT geändert wird

- Kein Rollback des v171/v172-Plate-Prompts.
- **Keine Auto-Migration Kling → Hailuo.**
- Kein neuer Overlay-Layer, kein Preclip-Change.
- Kein Blockieren von Kling im Provider-Picker — nur Aufklärung.
- Bestehende Pika- und HappyHorse-Migrationen in `compose-video-clips` bleiben unangetastet (die haben andere Gründe).

## Deliverables

1. **`src/config/lipsyncProviderSafety.ts`** — `LIPSYNC_SAFE_PROVIDERS` + `isLipsyncRisky` Helper (~20 Zeilen).
2. **Kosten-Bestätigungs-Dialog** (bestehende Modal-Komponente) — konditionaler Warn-Block + Consent-Checkbox + Disabled-Logik für den Confirm-Button.
3. **Job-Dispatch** (`compose-video-clips` Client-Aufruf + Edge-Function-Read) — `risky_provider_acknowledged` durchreichen und in Scene-Metadata persistieren.
4. **Credit-Refund-Automat** — Fehlerkategorie-Check: bei `lipsync_artifact` + `risky_provider_acknowledged === true` → kein Refund, sonst wie bisher.
5. **Localization** — DE/EN/ES Strings für Warn-Block.
6. **`mem/architecture/lipsync/v209-risky-provider-consent.md`** — Diagnose (Kling N≥2 Ghost-Mouthing), Entscheidung (Consent statt Auto-Migration), Refund-Regel.
7. **`mem/architecture/lipsync/provider-compatibility-matrix.md`** — Kling-Zeile aktualisieren: "Multi-Speaker Lipsync unzuverlässig — User-Consent erforderlich".

## Verifizierung

- Kling + Lipsync + N=3 auswählen → Dialog zeigt Warn-Block mit "mehreren Sprechern"-Text, Confirm disabled ohne Checkbox.
- Hailuo + Lipsync → Dialog unverändert, keine Warnung.
- Kling ohne Lipsync (B-Roll) → Dialog unverändert, keine Warnung.
- Nach Bestätigung: `composer_scenes.metadata.risky_provider_acknowledged = true`.
- Simulierter Lipsync-Artefakt-Fehler bei bestätigter Szene → kein Auto-Refund; simulierter Lambda-Timeout bei gleicher Szene → Refund läuft normal.
