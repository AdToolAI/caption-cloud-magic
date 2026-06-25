## Ziel

Sobald **Lip-Sync** aktiviert ist (Engine `cinematic-sync` oder `sync-segments`), wird der Provider-Picker auf zwei Optionen reduziert:

- **HappyHorse** — Standard / Default-Auswahl (3–15s freie Länge)
- **Hailuo** — Nur als Fallback wählbar (6s / 10s)

Alle anderen 9 Provider (Kling, Veo, Wan, Seedance, Luma, Sora, Pika, Runway, Vidu, Kling-Omni) sind im Lip-Sync-Modus **nicht selektierbar** (ausgegraut oder ausgeblendet).

Sobald Lip-Sync deaktiviert wird → alle Provider wieder frei wählbar.

---

## Verhalten im Detail

1. **Auto-Default beim Aktivieren von Lip-Sync**
   Wenn der User Lip-Sync einschaltet und der aktuelle `clipSource` ein nicht-lipsync-fähiger Provider ist (z.B. Kling, Veo, Sora), wird automatisch auf **`ai-happyhorse`** umgestellt. Die Dauer wird dabei in den HappyHorse-Range (3–15s) geklemmt — bisheriger Wert bleibt erhalten, wenn er passt.

2. **Provider-Picker UI (Lip-Sync ON)**
   Nur zwei Buttons/Optionen sichtbar:
   - HappyHorse (Standard, Badge: "Empfohlen · 3–15s")
   - Hailuo (Badge: "Fallback · nur 6s/10s")
   Alle anderen Provider werden im Dropdown **gefiltert oder als disabled mit Tooltip** angezeigt: *"Nicht verfügbar mit Lip-Sync — nur HappyHorse oder Hailuo unterstützen Sync.so."*

3. **Wechsel HappyHorse ↔ Hailuo im Lip-Sync-Modus**
   Beim Wechsel zu Hailuo wird die Dauer auf den nächsten erlaubten Wert (6s oder 10s) gesnapped, mit Toast-Hinweis. Beim Wechsel zurück auf HappyHorse bleibt die Dauer wie sie ist (im 3–15s Range).

4. **Lip-Sync deaktivieren**
   Alle Provider werden wieder freigegeben, der zuletzt gewählte Provider bleibt aktiv.

5. **Backend-Schutz**
   `compose-video-clips/index.ts` blockt zusätzlich serverseitig: Wenn `engineOverride ∈ {cinematic-sync, sync-segments}` und `clipSource` weder `ai-happyhorse` noch `ai-hailuo` ist → 400 mit klarem Fehler. (Doppelte Absicherung gegen UI-Bypass.)

---

## Technische Umsetzung

**`src/lib/video-composer/providerCapabilities.ts`** (existiert bereits)
- Neue Helper: `getLipsyncPrimaryProvider()` → `'ai-happyhorse'`
- Neue Helper: `getLipsyncFallbackProvider()` → `'ai-hailuo'`
- Neue Helper: `isLipsyncEngine(engine)` → boolean
- `getLipsyncProviders()` Reihenfolge sicherstellen: HappyHorse zuerst, Hailuo danach

**`src/components/video-composer/SceneCard.tsx`** (Provider-Dropdown)
- `useEffect`: Wenn Lip-Sync-Engine aktiv und `clipSource` nicht lipsync-fähig → `onUpdate({ clipSource: 'ai-happyhorse' })` + Dauer clampen
- Provider-Dropdown im Lip-Sync-Mode auf `getLipsyncProviders()` reduzieren, andere als `disabled` mit Tooltip rendern
- Badges: HappyHorse "Empfohlen", Hailuo "Fallback · 6s/10s"

**`src/components/video-composer/SceneDialogStudio.tsx`**
- Default-Provider beim ersten Öffnen des Dialog-Studios: `ai-happyhorse` statt `ai-hailuo` (für `masterProvider` Logik aus letztem Turn)
- `userPickedProvider` fallback auf `'ai-happyhorse'` statt `'ai-hailuo'` setzen

**`src/lib/video-composer/validateSceneForCinematicSync.ts`**
- Bestehende Warnung `provider_no_lipsync_support` greift bereits; Message aktualisieren: *"Nur HappyHorse (empfohlen) oder Hailuo (Fallback) unterstützen Lip-Sync."*

**`supabase/functions/compose-video-clips/index.ts`** (Backend-Guard)
- Nach den bereits eingebauten Duration-Guards: zusätzlicher Check
  ```
  if (engine ∈ {cinematic-sync, sync-segments}
      && clipSource ∉ {ai-happyhorse, ai-hailuo})
    → 400 invalid_provider_for_lipsync
  ```

---

## Was unverändert bleibt

- Die gesamte Lip-Sync-Pipeline (`compose-dialog-segments`, `sync-so-webhook`, `poll-dialog-shots`, `dialog_shots`-Tabelle, Sync.so Pro Policy)
- Die Provider-Liste und Capabilities für **alle Nicht-Lipsync-Szenen** (B-Roll, normales Compose) — Kling, Veo, Sora etc. bleiben dort voll wählbar
- Refund-Automatik, Credit-Logik, Audio-/Voice-Pipeline
- Die in der letzten Runde gefixte Provider-aware Duration-Auswahl (Hailuo 6/10 Buttons, HappyHorse 3–15 Slider)

---

## Risiken / Edge Cases

- **Bestehende Szenen** mit z.B. `clipSource: 'ai-kling' + engineOverride: 'cinematic-sync'` (theoretisch in DB möglich): Beim nächsten Öffnen wird automatisch auf HappyHorse migriert — kein Daten-Verlust, nur Provider-Korrektur.
- **HappyHorse Multi-Speaker** ist laut Memory in `cinematic-sync` historisch 0/274 erfolgreich gewesen (silent Hailuo-Migration); jetzt ohne Migration könnte die Erfolgsrate für Multi-Speaker auf HappyHorse niedriger sein. Der User hat aber explizit gesagt, er weiß dass HappyHorse mit 4 Sprechern funktioniert hat — die Beta-Warnung im Validator macht das transparent, und Hailuo bleibt 1-Klick-Fallback.

---

## Akzeptanzkriterien

- Lip-Sync ON → Provider-Picker zeigt nur HappyHorse + Hailuo, alle anderen disabled mit Tooltip
- Neuer Szene mit Lip-Sync → HappyHorse ist vorausgewählt
- Wechsel auf Hailuo im Lip-Sync-Modus → Dauer snapped auf 6s/10s mit Toast
- Lip-Sync OFF → alle 11 Provider wieder frei wählbar
- Backend rejected explizit jeden Lip-Sync-Render mit Nicht-{HappyHorse,Hailuo}-Provider
