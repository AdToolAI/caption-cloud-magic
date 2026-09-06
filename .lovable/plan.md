# Flagship-first Modellauswahl im AI Video Studio

Der Kunde sieht zuerst 720p-, Lite- und Draft-Modelle. Das Audit bestätigt: die Liste ist nach den Gruppen `recommended → audio → fast → premium` sortiert (`ModelSelector.tsx:35`), also stehen Draft-Modelle ganz oben und die 1080p-Flaggschiffe ganz unten. Dazu kommen echte Datenfehler in der Registry, die Modelle schlechter aussehen lassen, als sie sind.

## Was sich ändert

### 1. Reihenfolge: Flaggschiffe zuerst
Neue Gruppenreihenfolge und Labels:

```text
Flaggschiff (1080p+)  →  Native Audio & Dialog  →  Spezialisten (V2V, Referenz)  →  Entwurf & Günstig
```

Innerhalb jeder Gruppe absteigend nach Auflösung, dann nach Generation. Draft/Lite-Modelle (`seedance-mini`, `wan-standard`, `kling-2.5-turbo`, `veo-3.1-lite-720p`, `luma-standard/-pro`, `pika-2-2-*`) landen geschlossen in der letzten Gruppe. Nichts wird entfernt — nur neu einsortiert.

### 2. Modelle richtig zuordnen
`group` wird pro Eintrag nach echter Spec gesetzt, nicht nach Preis: alles mit nativem 1080p (Kling 3, Kling Omni, Veo 3.1 Fast/Pro, Wan 2.6 Pro, Wan 2.7 Pro, Hailuo Pro, LTX Fast/Pro, Vidu, HappyHorse Pro, Seedance 2.5) in die Flaggschiff-Gruppe.

### 3. Falsche/verschwiegene Auflösungen korrigieren
- **Kling 2.5 Turbo**: Registry zeigt 720p, das Backend rendert real 1080p (`generate-kling-video/index.ts:38`) → Registry auf 1080p.
- **Hailuo Std/Pro**: `hailuoVideoCredits.ts:16` erlaubt 768p **und** 1080p, die UI bietet keine Wahl → `resolutions: ['1080p','768p']` ergänzen.
- **Seedance 2.5**: Default von 720p auf die höchste freigegebene Stufe heben, 480p bleibt als Sparoption wählbar.
- **LTX Fast**: Hinweis in der UI, dass 2k/4k nur bis 10 s möglich sind (Backend erzwingt sonst 1080p, `generate-ltx-video/index.ts:182`).

Jede neu sichtbare Stufe bekommt vorher eine geprüfte Preiszeile im Katalog (Margenuntergrenze 1,75×). Wo kein geprüfter Einkaufspreis vorliegt, bleibt die Stufe gesperrt statt margenschädlich offen.

### 4. Profi-Regler, die der Provider schon kann
Heute gibt es in `ToolkitGenerator.tsx` weder Seed noch Negativ-Prompt noch Kamerasteuerung, obwohl die Edge Functions sie akzeptieren. Neu, jeweils nur bei Modellen, die es können:
- **Seed** (Kling, Veo, Wan, Pika, Vidu) — für reproduzierbare Wiederholungen.
- **Negativ-Prompt** (Kling, Veo, Wan, Pika).
- **Kamerabewegung** für Luma — `LUMA_CAMERA_CONCEPTS` (`lumaVideoCredits.ts:81-93`) existiert bereits und wird nirgends benutzt.

Alles in einem einklappbaren Block „Erweiterte Steuerung", damit die Grundansicht schlank bleibt.

### 5. Altlasten kennzeichnen
`wan-standard` (2.5), `seedance-mini` (Gen 1) und `luma-standard/-pro` (Ray 2) bekommen den Hinweis „Vorgänger-Generation", mit Nennung des Nachfolgers. Sora-2-Reste (`aiVideoCredits.ts:152`, beide Preiskataloge, `LEGACY_ROUTE_TO_MODEL`) und die unerreichbare SKU `wan-pro` werden bereinigt. Vidu-IDs heißen weiter `vidu-q2-*`, das Anzeige-Label wird auf Q3 vereinheitlicht.

### 6. Katalog-Drift schließen
- `kling-2.6`: `maxDuration` 15 (Client) vs. 10 (Server) vs. Registry [5,10] → einheitlich.
- `seedance-mini`: `minDuration` 3 (Client) vs. 5 (Server) → einheitlich.
- Test in `src/test/pricing-catalog-parity.test.ts` erweitern: jede Registry-ID hat eine Katalogzeile, jede Katalogzeile ist erreichbar, Dauern stimmen überein.

## Technische Details

Betroffen: `src/config/aiVideoModelRegistry.ts` (Gruppen, `resolution`/`resolutions`, Badges), `src/components/ai-video/ModelSelector.tsx` (`GROUP_ORDER`, Labels), `src/components/ai-video/ToolkitGenerator.tsx` (Block „Erweiterte Steuerung"), `src/config/hailuoVideoCredits.ts`/`lumaVideoCredits.ts`, `src/lib/cost/videoPricingCatalog.ts` + `supabase/functions/_shared/videoPricingCatalog.ts`, `src/config/aiVideoCredits.ts` (Sora-Rest), Tests.

Nicht angefasst: Generierungs-Pipeline, Lip-Sync-Kette, Wallet-/Abrechnungslogik (außer Preiszeilen für neu freigeschaltete Stufen), Director's Cut, Composer-Pfade. Alle Texte EN/DE/ES.
