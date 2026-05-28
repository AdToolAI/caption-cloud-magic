## Problem

In `supabase/functions/render-with-remotion/index.ts` ersetzt `stabilizeUniversalCreatorScenes()` (Zeile 135) **bedingungslos** jede Szene mit `background.type === 'video'` durch `imageUrl`-Fallback oder — wenn keiner vorhanden ist — durch einen dunklen Gradient `#050816 → #111827`.

Log-Beweis vom aktuellen Render (`pending-d6f794cb…`):
```
🛡️ Stable UniversalCreator render path: replaced 4 external video source(s) with static fallbacks
```

Audio (Voiceover + BG-Music) läuft als separater Track unverändert → exakt das beobachtete Symptom: **Ton ja, Bild komplett schwarz**.

## Fix

1. **`stabilizeUniversalCreatorScenes` standardmäßig ausschalten.**
   Nur noch aktiv, wenn explizit per Flag angefordert (z.B. `payload.forceStableRenderPath === true` oder Env `REMOTION_FORCE_STABLE_RENDER=1`). Default = Originalvideos werden 1:1 an Lambda durchgereicht.

2. **Aufruf-Stelle (Zeile 592–596)** entsprechend gaten:
   ```ts
   if (shouldStabilize) {
     const stabilized = stabilizeUniversalCreatorScenes(sanitizedCustomizations);
     …
   }
   ```

3. **Logging beibehalten**, aber klarer formulieren (`⚠️ Forced stable render path active …`), damit man künftig sofort sieht, ob die Fallback-Kette greift.

4. **`render-with-remotion` deployen**, dann erneuten Test-Render anstoßen und in den Logs verifizieren, dass die Zeile *nicht* mehr erscheint und das Lambda-Payload die echten `videoUrl`s enthält.

## Was unverändert bleibt

- Bucket-/Serve-URL-Logik (`6ul51trd3p`) — funktioniert nachweislich (Lambda-Start = 200 OK).
- Audio-Pipeline.
- Webhook, Credit-Refund, alle anderen Render-Funktionen.

## Risiken

Falls die ursprüngliche Instabilität (externe Video-URLs → Lambda-Failure) zurückkommt, kann sie per Flag jederzeit wieder eingeschaltet werden, ohne Code-Rollback. Sollte ein Lambda-Fail auftreten, sehen wir das sofort im neuen Render-Log und können gezielt reagieren (statt jedes Video präventiv zu zerstören).
