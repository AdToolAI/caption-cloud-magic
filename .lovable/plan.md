
**r13 — frameRange-Fix (umgesetzt)**

- `normalizeStartPayload()`: setzt `frameRange: [0, durationInFrames-1]` wenn fehlend.
- `buildStrictMinimalPayload()`: setzt `frameRange` explizit (Fallback `[0, 59]`).
- `invoke-remotion-render`: Pre-flight Guard patcht fehlende/ungültige frameRange automatisch + loggt `frameRange_auto_patched`.
- `payloadDiagnostics`: erweitert um `hasFrameRangeKey`, `frameRangeValue`, `frameRangeType`, `bundle_canary: r13`.
- Auto-Retry: erkennt jetzt auch `reading '0'` und `getRealFrameRange` als retryable Fehler.
- Canary auf `r13-frameRange-fix` angehoben.

**Nächster Schritt**: Neuen Run starten, in Logs prüfen ob `hasFrameRangeKey: true` und `frameRangeValue: [0, N]` erscheint und der `reading '0'` Fehler verschwindet.
