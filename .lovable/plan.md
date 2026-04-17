

## Befund

Zwei separate Probleme:

### Problem 1: Kein Sound im Export (Hauptbug)

`useComposerPersistence.ts` speichert `assembly_config` **nur beim ersten Insert** eines Projekts. Spätere Änderungen (Voiceover hinzufügen, Musik wählen, Untertitel generieren) leben nur im React-State (`updateAssembly` in `VideoComposerDashboard.tsx` Zeile 296–301 ruft nur `setProject`). Es gibt **keinen einzigen** `UPDATE composer_projects SET assembly_config = ...` im Code.

**Beweis aus DB:** Letzter Composer-Render (`6ed30e9f-9b6d-417c-89df-65348a91eff6`) hat in der DB `"music": null, "voiceover": null` — obwohl in der Preview Sound zu hören war (weil dort der lokale State genutzt wird). `compose-video-assemble` liest aber `assembly_config` aus der DB → leerer `voiceoverUrl`/`musicUrl` → Lambda rendert mit `muted: true` → MP4 ohne Audio-Spur (`r41_audioMuxed: false` im Logging bestätigt).

### Problem 2: „Zusammengekrampfte" Untertitel/Overlays

Im Screenshot überlappen das obere Overlay („Über 500 Creator skalieren bereits.") und das untere („Skaliere dein Marketing mit KI.") visuell mit der Bottom-Padding-Zone der Subtitle-Renderer. Beide sind **globale Text-Overlays** (aus der Migration), keine echten Untertitel — aber sie nutzen `fontSize: 'lg'` ohne ausreichendes Padding und ohne Background, daher wirkt der Text gequetscht und schwer lesbar bei stark texturiertem Video-Hintergrund.

Konkret in `TextOverlayRenderer` (gerendert via `ComposedAdVideo.tsx`): keine line-height-Kontrolle, kein Min-Padding, kein Max-Width. Bei langen Sätzen umbricht der Text eng am Rand.

## Plan

### Fix 1 — `assembly_config` bei jeder Änderung in der DB persistieren (kritisch)

In `src/components/video-composer/VideoComposerDashboard.tsx`:
- `updateAssembly` ergänzen: nach `setProject` zusätzlich asynchron in `composer_projects` schreiben (debounced 800 ms, damit bei schnellen Slider-Änderungen nicht jeder Tick einen DB-Call löst).
- Außerdem **vor jedem Render-Trigger** (in `AssemblyTab.handleRender`, vor `supabase.functions.invoke('compose-video-assemble', ...)`) ein **synchrones Flush** der aktuellen `assemblyConfig` durchführen, damit der Edge-Function-Aufruf garantiert die neuesten Audio-URLs sieht. Das deckt Race Conditions ab (User klickt sofort nach Voiceover-Generierung auf Render).

In `useComposerPersistence.ts`:
- Eine neue Funktion `persistAssemblyConfig(projectId, assemblyConfig)` hinzufügen, die `supabase.from('composer_projects').update({ assembly_config, updated_at: now }).eq('id', projectId)` ausführt. Wird von beiden Stellen oben benutzt.

### Fix 2 — Text-Overlay Lesbarkeit verbessern

In `src/remotion/components/TextOverlayRenderer.tsx` (oder wo auch immer die Overlays gerendert werden — wird beim Edit lokalisiert):
- `line-height: 1.3` setzen
- `padding: 12px 24px` als Mindest-Innenabstand
- `max-width: 80%` und `word-break: keep-all` für vernünftige Umbrüche
- Bei `style.backgroundColor === 'transparent'` automatisch eine **stärkere Text-Shadow** (`0 2px 8px rgba(0,0,0,0.85), 0 0 4px rgba(0,0,0,0.6)`) für Lesbarkeit ohne Kasten
- Position-Padding erhöhen: `top` und `bottom` Positionen mindestens 8 % vom Rand entfernt halten, damit sie nicht mit eventuellen Untertiteln (Bottom-Padding 12 %) kollidieren

### Fix 3 — Untertitel-Renderer Padding leicht erhöhen

In `src/remotion/templates/ComposedAdVideo.tsx` `SubtitleSegmentRenderer`:
- `padding: '18px 32px'` (statt `14px 28px`) für luftigeres Erscheinungsbild
- `lineHeight: 1.35` (statt 1.4) — minimal kompakter aber ausgewogener
- Bei langen Subtitle-Texten: `maxWidth: '85%'` (statt 90%) für bessere Lesbarkeit

## Geänderte Dateien

- `src/hooks/useComposerPersistence.ts` — neue `persistAssemblyConfig`-Funktion
- `src/components/video-composer/VideoComposerDashboard.tsx` — `updateAssembly` debounced DB-Write
- `src/components/video-composer/AssemblyTab.tsx` — Pre-Render synchroner Flush
- `src/remotion/components/TextOverlayRenderer.tsx` — Padding/Shadow/Lesbarkeit
- `src/remotion/templates/ComposedAdVideo.tsx` — Subtitle-Padding-Tuning

## Verify

1. **Audio im Export:** Voiceover generieren → Musik wählen → Render starten → fertiges MP4 herunterladen → Audio-Spur ist hörbar (auch außerhalb des Browsers, z. B. in VLC)
2. **DB-State:** Nach jeder Voiceover-/Musik-Änderung ist `composer_projects.assembly_config` in der DB aktualisiert (per psql verifizierbar)
3. **Race Condition:** Direkt nach Voiceover-Generierung „Render" klicken → Audio ist trotzdem im finalen Video enthalten
4. **Lesbarkeit:** Text-Overlays haben sichtbares Padding und sind auch ohne Background-Box gut lesbar; Untertitel und Overlays überlappen nicht mehr visuell

