## Ziel
Der Universal Content Creator ist 8 Monate alt und funktioniert, aber ein Deep-Audit zeigt viele stille Divergenzen zwischen UI, Preview, Autosave und Render. Ich will die Pipeline in klaren Wellen aufräumen, ohne Motion Studio / Director's Cut / Composer anzufassen.

## Flow (Ist-Zustand)

```text
UI State (9x useState) ──► localStorage ("universal-creator-backup", 10s Poll)
                       └─► Supabase content_projects (customizations + audio_config)
                       └─► RemotionPreviewPlayer (inputProps live)
                       └─► render-with-remotion  ─┐
                       └─► render-universal-video ┴─► AWS Lambda ─► S3 ─► Webhook ─► video_renders ─► media_assets
```

## Wichtigste Fundstellen aus dem Audit

**Kritisch (verursacht direkt sichtbare Bugs):**
- `render-universal-video` sendet `musicVolume` statt `backgroundMusicVolume` → wird von Zod stumm verworfen, Musik läuft auf hartem Default 0.35 statt User-Wert.
- Musik-Slider zeigt Rohwert (z. B. 30%), Preview + Render nutzen aber sidechain-reduzierten Wert → User versteht die Skala nicht, denkt Slider ist kaputt.
- `selectedMusicUrl` und `projectId` liegen NICHT im localStorage-Backup → nach Reload keine Musik im Preview + doppelte DB-Rows bei jedem Save.
- `initiallyMuted` wird aus einem `ref` gelesen → Player-Mute-State ist nach Mount praktisch eingefroren.
- `render-universal-video` läuft synchron gegen Lambda mit 300s Timeout, aber Edge Functions timeouten nach 150s → Frontend sieht Fehler, obwohl Lambda noch läuft.

**Mittel:**
- Preview-Duration, Subtitle-Style-Defaults, Background-Asset-Mapping haben leicht unterschiedliche Werte zwischen Preview und Render.
- Zwei Render-Pfade (`render-with-remotion` vs `render-universal-video`) mit unterschiedlicher Credit-Logik (Reservation vs. Direct-Deduct) → inkonsistente Abrechnung.
- Kein Schema-Version-Flag im localStorage-Backup → alte Drafts überschreiben neue Defaults (genau das, was Sie in den letzten Runden erlebt haben).
- Export-Step hat gar keinen echten Live-Preview, nur eine Icon-Karte.

**Code-Qualität:**
- `UniversalCreatorVideo.tsx` ist ein 3212-Zeilen-Monolith.
- Debug-`console.log`-Effekte im Prod-Code.
- Vestigiale Felder (`audioConfig.voiceover_id`, `voiceover_volume`, `sound_effects`) werden nie geschrieben.
- Multi-Format-Render läuft sequenziell statt parallel.

## Umsetzung in 4 Wellen

### Welle 1 – Audio-Mix ehrlich & stabil (dringend)
1. `render-universal-video`: `musicVolume` → `backgroundMusicVolume` umbenennen, damit der Wert nicht mehr stumm verworfen wird.
2. Sidechain-Skalierung transparent machen: Slider zeigt genau das, was hörbar ist. Entweder kein Sidechain mehr oder kleines Info-Label „bei Voiceover reduziert auf X %". Slider = Realität.
3. `selectedMusicUrl` und `projectId` ins localStorage-Backup aufnehmen; Restore rehydriert beides.
4. `voiceoverVolume` sauber in `contentConfig` typisieren und im Restore-Pfad clampen.
5. `initiallyMuted` von Ref auf State umstellen, damit Play/Pause nach Interaktion konsistent bleibt.
6. Ein einziger `DEFAULT_SUBTITLE_STYLE`, den Preview und Render beide importieren.

### Welle 2 – Preview/Render-Parität
1. Live-Remotion-Preview in `PreviewExportStep` einbauen (gleicher Player wie in der Sidebar) – User sieht vor dem Credit-Spend genau, was rauskommt.
2. Zentraler `mapBackgroundAssetToRenderPayload()`, gemeinsam für Preview und Export-Payload.
3. Duration-Berechnung an einer Stelle bündeln (`computeDurationInFrames()`), Preview + Export teilen sich die Funktion.
4. Alle Divergenz-Konstanten (backgroundOpacity, animation, outlineStyle) in ein `universalCreator/defaults.ts`.

### Welle 3 – Persistence & State härten
1. Versioniertes localStorage-Schema (`{ version: 2, state: {...} }`) mit expliziter Migration.
2. Autosave in ein einziges `useAutosave(state)`-Hook konsolidieren; kein doppeltes Interval + Effekt mehr.
3. `projectId` in die URL (`?project=UUID`) für resumierbare Sessions und um Duplikat-Rows zu verhindern.
4. Restore-Guard: nur überschreiben, wenn kein aktuelles Feld gesetzt ist ODER Backup neuer als aktuelle Session – so kann ein alter Draft nichts mehr „zurückrollen".
5. Vestigiale Felder aus `audioConfig` entfernen.

### Welle 4 – Render-Pipeline & UX-Politur
1. `render-universal-video` auf Async-Invocation + Webhook umstellen (wie `render-with-remotion`); Credit-Modell auf Reservation/Commit vereinheitlichen.
2. Multi-Format-Render parallel via `Promise.all`.
3. „Retry"-Button für fehlgeschlagene Renders (nutzt die bereits refundeten Credits).
4. `media_assets.storage_path` korrekt setzen (kein S3-URL mehr).
5. Debug-`console.log`-Effekte entfernen, hardcoded deutsche Toasts durch `t()` ersetzen.
6. Optional: `UniversalCreatorVideo.tsx` in Sub-Module splitten (SceneBackground, TextOverlay, Transitions, SubtitleOverlay). Rein Refactor, keine Verhaltensänderung.

## Was NICHT angefasst wird
- Motion Studio / Video Composer / Director's Cut / Talking Head / Lip-Sync / Credit-Rates / Provider-Pipelines / bestehende Remotion-Composition-Logik selbst (nur Splitten).
- Kein neuer Storage-Bucket, keine DB-Migration außer `content_projects.customizations` optional versionieren.
- Keine Änderung an der Renderqualität oder den Lambda-Concurrency-Regeln.

## Verifikation pro Welle
- Welle 1: Slider 10 / 30 / 70 % → Preview UND Export klingen gleich, Werte überleben Reload.
- Welle 2: Export-Step-Preview zeigt exakt das gerenderte Ergebnis; Duration- und Subtitle-Style-Werte identisch.
- Welle 3: Nach Hard-Reload + Restore keine Duplikat-Rows in `content_projects`, kein Rückfall auf alte Volume-Werte.
- Welle 4: Fehlgeschlagener Render → Retry funktioniert ohne Doppelabbuchung; 3 Formate rendern parallel; keine 150s-Edge-Timeouts mehr.

## Reihenfolge / Rollout
Ich würde Welle 1 sofort umsetzen (löst die Ursachen der letzten Runden endgültig), dann nach Ihrer Freigabe Welle 2, 3, 4 einzeln. Sagen Sie mir einfach welche Welle ich starten soll – oder ob ich alle vier direkt hintereinander abarbeiten darf.