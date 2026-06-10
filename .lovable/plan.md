## Diagnose

Der Preview-Hänger zwischen Szene 2 → 3 kommt nicht vom Video selbst, sondern vom **Ping-Pong-Buffer** in `src/components/video-composer/ComposerSequencePreview.tsx`:

- Es gibt nur **zwei** Video-Slots (`A`/`B`).
- Szene N+1 wird erst dann in den freien Slot geladen, **nachdem** der Crossfade auf Szene N abgeschlossen ist (`preloadSlot(fromSlot, toIdx + 1)`, Zeile 437).
- Bei kurzen oder bereits beendeten Szenen (typisch nach Lip-Sync, weil das MP4 oft nur so lang ist wie das VO) hat der Slot für Szene 3 dann **nur ein paar hundert ms** Zeit zum Buffern.
- Ist `standby.readyState < 2`, wartet `performTransition` bis zu **`STANDBY_BUDGET_MS = 1200ms`** auf `canplay`/`loadeddata` und macht **zusätzlich** den 400ms-Crossfade — genau die 1.5–3s Standbild, die der User sieht.
- Verstärkt wird das Ganze dadurch, dass bei Two-Shot-Szenen das `clipUrl` nach `lipSyncAppliedAt` getauscht wird → der bereits in Slot B vorgeladene src wird invalidiert und neu geladen.

## Ziel

Pipeline und Qualität bleiben unverändert (gleiche Renderkette, gleiche Lip-Sync-Logik, gleicher Crossfade-Look). Wir verbessern nur das **clientseitige Buffering** im Preview-Player, sodass kein Standbild mehr entsteht.

## Änderungen (alle in `ComposerSequencePreview.tsx`)

1. **Dritter "Prefetch"-Slot (unsichtbar)**
   - Neuen `videoCRef` als `<video preload="auto" muted playsInline className="hidden" />` einbauen.
   - Slot C hält immer `sceneIdx + 2`. Wenn der Crossfade auf Szene N+1 startet, ist Szene N+2 bereits gebuffert und kann instant in den frei werdenden Slot übernommen werden (per `src`-Swap statt neuem Download — die HTTP-Response liegt bereits im Browser-Cache).
   - Mapping über erweitertes `slotMapRef = { A, B, C }` + `setSrcForSlot('C', …)`.

2. **Frühere Preload-Kette**
   - Beim Reset/Init zusätzlich `preloadSlot('C', 2)`.
   - Nach jedem Übergang: `preloadSlot(fromSlot, toIdx + 1)` **und** `preloadSlot('C', toIdx + 2)`.
   - Beim Scrub analog Szene `idx + 2` warm halten.

3. **Standby-Budget halbieren, wenn schon gebuffert**
   - `STANDBY_BUDGET_MS` von 1200 → 1500ms als Hard-Fallback bleiben, aber:
   - Vor dem Crossfade prüfen: ist `standby.readyState >= 3` (HAVE_FUTURE_DATA), sofort starten. Ist nur `>= 2`, kurz (max. 200ms) warten, sonst Hard-Cut + parallel weiterladen — ohne Standbild, weil der vorherige Slot bis zur fertigen Anzeige sichtbar bleibt.

4. **HTTP-Prewarm beim Mount/Reset**
   - Für alle `playable[i].clipUrl` (Videos) ein leichter `fetch(url, { method: 'GET', mode: 'cors', cache: 'force-cache' })` mit `Range: bytes=0-524287` im Hintergrund (Promise-Pool, max. 2 parallel). Lädt nur die ersten 512KB jedes Clips → Moov-Atom + erste Frames sind im Browser-Cache, das nachgelagerte `el.src=…` startet sofort.
   - Nur einmal pro `playable`-Set, abgebrochen bei Unmount via `AbortController`.

5. **Stabilisierung bei Lip-Sync-Updates**
   - Memoisieren des Preload-Keys über `${scene.id}::${scene.clipUrl}::${scene.lipSyncAppliedAt ?? ''}`. So wird ein bereits gebufferter Clip nicht durch identischen Re-Render verworfen, aber ein echter Lip-Sync-Swap löst korrekt einen Re-Preload aus.

## Was NICHT angefasst wird

- Render-/Lip-Sync-Pipeline (`compose-video-clips`, `compose-dialog-segments`, Sync.so usw.) bleibt unverändert.
- Crossfade-Optik (400ms), Watchdog, Audio/VO-Sync, Mute-Logik, Image-Scene-Pfad — alles unverändert.
- Keine DB-/Edge-Function-Änderungen, keine neuen Tabellen.

## Erwartung

- Übergang Szene 2→3 (und jeder weitere) ist instant, weil Szene 3 schon **vor** dem Crossfade vollständig im Cache liegt.
- Bei langsamem Netz greift weiterhin der Hard-Fallback nach 1.5s, statt mit blackscreen einzufrieren.

## Validierung

- Composer-Preview öffnen, 3+ Szenen abspielen, jeden Übergang prüfen.
- DevTools → Netzwerk: Szene N+2 sollte bereits beim Abspielen von Szene N geladen sein (`Status 206` Range-Request).
- Console: keine `[Preview] standby budget exceeded`-Warnungen mehr (Telemetry-Log wird im Zuge der Änderung ergänzt).
