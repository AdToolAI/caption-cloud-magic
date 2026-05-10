## Problem (Root Cause)

Beim Klick auf **„Cinematic-Sync starten €0.95"** passiert technisch nichts Sichtbares, weil das Override auf dem Weg zum Backend verloren geht.

Konkreter Ablauf im aktuellen Code (`ClipsTab.tsx`):

```text
1. Dialog-Bestätigung → onUpdateScenes(updated)        ← React-State mit
                                                        engineOverride='cinematic-sync'
                                                        + clipSource='ai-hailuo'
                                                        (debounced DB-Flush!)
2. handleGenerateSingle(updatedTarget)                  ← passed-in scene IGNORIERT
3. ensureProject() → onEnsurePersisted(project)         ← liest stale React-Closure
                                                        → schreibt ALTE Werte
                                                        (engine_override='auto')
                                                        in DB
4. targetScene = pScenes.find(s => s.orderIndex === ...) ← holt scene aus DB
                                                        → engineOverride='auto'
5. Backend `compose-video-clips`:
   override='auto' + hasDialog + cast + 1 speaker → wantsHeygen = TRUE
   → startet ERNEUT HeyGen-Render (identischer Output)
   → Hailuo + Sync.so werden NIE aufgerufen
```

Resultat: User sieht eine neue HeyGen-Generierung mit demselben Avatar-vor-neutralem-Hintergrund. Die echte Szene wird nie gerendert, kein Lip-Sync läuft.

## Fix

**Datei: `src/components/video-composer/ClipsTab.tsx`**

`handleGenerateSingle(scene)` so anpassen, dass es die `engineOverride` und `clipSource` aus dem **übergebenen** `scene`-Argument respektiert statt sie aus den frisch persistierten DB-Scenes zu überschreiben:

- Nach `targetScene = pScenes.find(...) || scene` mergen:
  ```ts
  const effectiveTarget = {
    ...targetScene,
    engineOverride: scene.engineOverride ?? targetScene.engineOverride ?? 'auto',
    clipSource: scene.clipSource ?? targetScene.clipSource,
  };
  ```
- Im `compose-video-clips`-Body `effectiveTarget` statt `targetScene` verwenden (auch beim Anchor-Compose und Prompt-Compose).

**Bonus-Hardening** im Cinematic-Switch-Click-Handler (Zeile 893–920):

Bevor `handleGenerateSingle` aufgerufen wird, das Override **synchron in die DB schreiben**, damit auch zukünftige Reloads / Polls die richtige Engine sehen:

```ts
await supabase
  .from('composer_scenes')
  .update({ engine_override: 'cinematic-sync', clip_source: updatedTarget.clipSource })
  .eq('id', t.id);
```

## Verifikation

1. Auf einer fertigen HeyGen-Szene **„In echte Szene einbauen €0.95"** klicken → bestätigen.
2. Network-Tab: `compose-video-clips` Request-Body muss `engineOverride: "cinematic-sync"` und `clipSource: "ai-hailuo"` enthalten.
3. Edge-Function-Log sollte zeigen: `Cinematic-Sync scene … VO …s → extending to …s` und **keinen** HeyGen-Aufruf für diese Szene.
4. UI: Phase-1-Overlay „🎬 Echte Szene wird gerendert" wird sichtbar (Hailuo läuft ~60s), danach Phase 2 „Lip-Sync läuft" (Sync.so).
5. Nach ~2 Min: Toast „Cinematic-Sync fertig", neuer Clip zeigt Charakter in der echten Szene mit Lip-Sync.

## Out of Scope

- Multi-Speaker-Aufteilung (bleibt Storyboard-Tab Workflow)
- Backend-Logik (`compose-video-clips`, `compose-lipsync-scene`) bleibt unverändert
- Auto-Extend bleibt unverändert (funktioniert sobald das Override durchkommt)
