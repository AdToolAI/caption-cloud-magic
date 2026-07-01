## Was schon fertig ist
- Welle 1 (Audio ehrlich & stabil)
- Welle 2 (Preview/Render-Parität mit Live-Preview im Export-Step)
- Welle 3 (`?project=<id>` Resume + Hydration-Guard + debounced Autosave)
- Welle 4 (parallele Multi-Format-Renders via `Promise.allSettled`)

## Was noch offen ist (Welle 5 – Polish & Hygiene)

Klein, aber macht die Pipeline "erwachsen" — nichts davon ist kritisch, aber alles davon merkt man in Support-Tickets später.

### 1. Retry für fehlgeschlagene Formate
- In `PreviewExportStep` einen "Erneut rendern"-Button pro Format bei Status `failed`.
- Nutzt Credits nicht doppelt (Refund lief bereits), stößt nur die eine Format-Job neu an.
- Löst das aktuelle "einer von vier Formaten failed → User muss den ganzen Wizard neu machen"-Problem.

### 2. Async-Webhook-Vereinheitlichung
- `render-universal-video` ruft Lambda noch synchron auf → bei kalten Lambdas droht 150s-Edge-Timeout, obwohl der Render weiterläuft.
- Umstellung auf denselben Async-+-Webhook-Flow wie `render-with-remotion` (`video_renders`-Row + `remotion-render-webhook`).
- Kein neuer Bucket, keine neuen Credits-Regeln — nur Aufruf-Pattern angleichen.

### 3. Vestigiale Felder entfernen
- `audioConfig.voiceover_id`, `voiceover_volume`, `sound_effects` werden nirgendwo mehr geschrieben, aber im Restore-Pfad geclamped.
- Aus `ContentConfig` + Restore + `content_projects.audio_config`-Reader entfernen. Rein Aufräumen.

### 4. Debug-Logs & i18n-Rest
- Verbliebene `console.log`-Effekte in `UniversalCreator.tsx`, `PreviewExportStep.tsx`, `RemotionPreviewPlayer.tsx` entfernen (Prod-Konsole leiser).
- Hardcoded deutsche Toasts (`"Rendering gestartet…"`, `"Musik hinzugefügt"`) durch `t()` ersetzen — passt zum EN/DE/ES-Policy.

### 5. Optional: `UniversalCreatorVideo.tsx` splitten
- 3212-Zeilen-Monolith in `SceneBackground.tsx`, `TextOverlay.tsx`, `SubtitleOverlay.tsx`, `Transitions.tsx`.
- Reines Refactor, keine Verhaltensänderung, keine Render-Auswirkung.
- Vorteil: nächstes Feature (z. B. neue Subtitle-Animation) braucht keinen 3k-Zeilen-Diff mehr.

## Was ich NICHT anfassen würde
- Motion Studio / Composer / Director's Cut
- Credit-Raten, Lambda-Config, Storage-Buckets
- Bestehende Remotion-Composition-Logik selbst (außer 5. Split)

## Reihenfolge-Vorschlag
1. **Retry-Button** (größter User-Impact, ~30 min)
2. **Async-Webhook** für `render-universal-video` (löst die letzte echte Timeout-Fehlerquelle)
3. **Vestigiale Felder + Debug-Logs** (Hygiene, ~15 min)
4. **i18n-Rest** (Support-relevant für ES/EN-User)
5. **Optional Split** (nur wenn du eh gerade am Template arbeiten willst)

Sag mir welche Punkte du willst — ich kann Punkt 1–4 in einem Rutsch machen, Punkt 5 nur auf explizite Ansage.