# Audit: Briefing → Storyboard → Clip-Generierung

Ich habe die komplette Strecke geprüft (Briefing-Formular, `analyze-briefing`, Produktionsplan, Storyboard-Szenen, Provider-Registry, `compose-video-clips`). Der Flow funktioniert grundsätzlich, aber es gibt sieben bestätigte Fehler — drei davon führen dazu, dass der Nutzer einen Provider auswählt und heimlich einen anderen bekommt.

## Bestätigte Befunde

### A. Provider werden im Backend still auf Hailuo umgeschrieben
`compose-video-clips/index.ts:1941-1956` schreibt jede nicht unterstützte Quelle ohne Nutzer-Hinweis auf `ai-hailuo` um und speichert das in der DB.
Nicht in der Allowlist (`_shared/composer-ai-sources.ts:8-20`): **`ai-vidu`** und **`ai-kling-omni`** — beide sind im Storyboard aber wählbar. Das ist die Ursache der „springt auf Hailuo"-Beschwerden.

### B. Kling 3.0 Omni verliert beim Auswählen seine Fähigkeiten
`modelMapping.ts:146` mappt jedes Kling-Modell auf `ai-kling` — Omni-Spezialfall fehlt. Nativer Dialog/Lip-Sync und 7 Referenzbilder gehen verloren. Der korrekte Mapper existiert bereits (`toolkitModelToClipSource.ts:13-15`), wird aber im Picker nicht verwendet.

### C. Zwei widersprüchliche Dauer-Tabellen
`providerCapabilities.ts` ist eine handgepflegte Schattenkopie der Registry und weicht ab:
- Vidu: `[5]` statt real `[4,5,6,8,10,12,16]`
- Seedance (v1): `[5,8,10,12]` statt `[3,5,8,10,12,15]`
- Hailuo: `[6,10]` ohne Pro-Unterscheidung (Pro kann nur 6s)
- Tote Einträge für LTX/Grok, die im Storyboard gar nicht existieren

### D. Registrierte, aber unerreichbare/kaputte Modelle
- **LTX** und **Grok**: vollständig in der Registry, aber nicht in `COMPOSER_FAMILIES` (`modelMapping.ts:22`) → im Storyboard unsichtbar
- **Pika 2.2**: wählbar, aber Registry markiert beide Varianten als `status: 'maintenance'` (fal.ai nicht konfiguriert)

### E. Briefing-Felder, die nie in der Szene ankommen
- `logoUrl` wird im Briefing gesammelt, aber weder von `analyze-briefing` noch von `useApplyProductionPlan` gelesen
- `speakerMap` wirkt nur im Deep-Parse-Pfad; beim KI-Storyboard-Button (`storyboard.ts:42-57`) fehlt das Feld komplett
- `preferStock` / `videoMode` existieren nur im Storyboard-Pfad, nicht im Deep-Parse-Pfad
- Auflösung (`resolutions`) ist pro Modell definiert, aber im Storyboard nirgends wählbar

### F. Stille Fehler, die der Nutzer nie sieht
- `useApplyProductionPlan.ts:914-921`: Prüfung auf geschützte Lip-Sync-Szenen ist „fail-open" — bei Query-Fehler werden geschützte Szenen überschrieben
- `:969` Voice-Fallback und `:1010` „Lip-Sync-Szene ohne Cast" nur als `console.warn`
- `:1110` Fehlermeldung ist hart auf Deutsch, obwohl alle Nachbarn `tx({de,en,es})` nutzen

### G. Instabile Effekte im Produktionsplan
`ProductionPlanSheet.tsx`: drei `useEffect`s (Slot-Hydrator ~315-381, Dialog-Bind ~553-590, Auto-Casting ~600-660) mutieren dasselbe `plan`-State, jeweils über JSON-Signaturen entkoppelt. Die Auto-Cast-Signatur serialisiert nur `speakerMentionKey`/`speakerCharacterId`, nicht die Dialogtexte — Änderungen am Dialog lösen keine Neuzuordnung aus.

## Umsetzungsplan

**Schritt 1 — Provider-Wahrheit vereinheitlichen (kritisch)**
- `ai-vidu` und `ai-kling-omni` in `compose-video-clips` implementieren oder aus dem Storyboard-Picker entfernen. Kein stiller Fallback mehr: nicht unterstützte Quelle → sichtbarer, lokalisierter Fehler statt heimlichem Hailuo-Rewrite.
- Picker in `SceneCard.tsx` auf `toolkitModelToClipSource` umstellen, damit Kling Omni korrekt geroutet wird.
- Pika ausblenden, solange `status: 'maintenance'`; LTX/Grok entweder freischalten oder aus der Registry-Anzeige nehmen.

**Schritt 2 — Eine einzige Fähigkeits-Quelle**
- `providerCapabilities.ts` von handgepflegter Tabelle auf abgeleitete Werte aus `aiVideoModelRegistry` umbauen (Dauern, Lip-Sync-Fähigkeit, Referenz-Limits), inklusive Pro/Standard-Unterscheidung. Danach kann Dauer-Snapping keine unmöglichen Werte mehr erzeugen.

**Schritt 3 — Briefing-Felder vollständig durchreichen**
- `logoUrl`, `speakerMap`, `preferStock`/`videoMode` in beiden Analyse-Pfaden (`storyboard.ts` und `deep/index.ts`) akzeptieren und in Prompt/Szene verwenden.
- Auflösung pro Szene sichtbar machen (nur dort, wo das Modell mehrere Stufen kann).

**Schritt 4 — Fehler sichtbar machen**
- Lip-Sync-Schutzprüfung auf „fail-closed" umstellen (bei Query-Fehler abbrechen statt überschreiben).
- Voice-Fallback und „Lip-Sync ohne Cast" als Preflight-Warnung im Produktionsplan zeigen, nicht nur in der Konsole.
- Deutschen Hardcode-Fehler auf `tx({de,en,es})` umstellen.

**Schritt 5 — Produktionsplan-Effekte konsolidieren**
- Die drei Effekte in eine einzige Normalisierungsfunktion zusammenführen, die auf jeden Plan-Wechsel einmal deterministisch läuft; Dialogtexte in die Auto-Cast-Signatur aufnehmen.

**Schritt 6 — Lip-Sync-Provider hart einschränken**
Sobald Lip-Sync für eine Szene aktiv ist, sind nur noch **Hailuo** und **Happy Horse** als Plate-Provider zulässig.
- `lipsyncMasterProvider.ts` wird zur alleinigen Wahrheit: erlaubte Liste = `ai-hailuo`, `ai-happyhorse`.
- Aktiviert der Kunde Lip-Sync bei einem anderen Provider, erscheint ein Dialog: „Lip-Sync benötigt einen zertifizierten Plate-Provider" mit genau zwei Buttons (Hailuo / Happy Horse) und Abbrechen. Kein stiller Auto-Wechsel — die Szene bleibt unverändert, bis der Kunde wählt.
- Umgekehrt: wechselt der Kunde bei einer Lip-Sync-Szene auf einen nicht zulässigen Provider, erscheint derselbe Dialog mit der zusätzlichen Option „Lip-Sync für diese Szene deaktivieren".
- Im Modell-Picker werden nicht zulässige Modelle bei aktivem Lip-Sync ausgegraut mit Hinweis-Tooltip statt einfach zu verschwinden.
- Serverseitig spiegelt `compose-video-clips` die Regel: Lip-Sync-Szene mit fremdem Provider → klarer, lokalisierter Fehler statt Rewrite.
- Die Briefing-Automatik (`pickClipSourceForDuration`) darf für Dialog-Szenen ebenfalls nur noch diese beiden vorschlagen.

Anmerkung: Seedance 2.5 war zwar als Plate zertifiziert (v418), scheitert aber in der Praxis regelmäßig am ModelArk-Personenschutz. Die Einschränkung beseitigt genau diese Fehlerklasse — der Vorschlag ist aus meiner Sicht richtig. Seedance bleibt für alle Nicht-Dialog-Szenen (bis 30 s) uneingeschränkt verfügbar.



## Technische Details

Betroffene Dateien: `supabase/functions/_shared/composer-ai-sources.ts`, `supabase/functions/compose-video-clips/index.ts`, `src/lib/video-composer/modelMapping.ts`, `src/lib/video-composer/providerCapabilities.ts`, `src/components/video-composer/SceneCard.tsx`, `src/components/video-composer/ProductionPlanSheet.tsx`, `src/hooks/useApplyProductionPlan.ts`, `supabase/functions/analyze-briefing/storyboard.ts` und `deep/index.ts`, `src/config/aiVideoModelRegistry.ts`.

Keine Datenbank-Migration nötig. Bestehende Szenen mit `ai-vidu`/`ai-kling-omni` wurden durch den Rewrite bereits auf `ai-hailuo` gesetzt und bleiben unverändert gültig.
