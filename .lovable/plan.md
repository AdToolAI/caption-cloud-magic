

## Befund

Im `ComposerSequencePreview.tsx` gibt es noch einen Fall, in dem **eine** Übergangsstelle „hängt" (Video bleibt schwarz / `opacity: 0` und springt nicht zur nächsten Szene weiter). Die Ursache liegt im Reveal-Flow nach dem `src`-Wechsel:

### Wurzelursachen

**1. Fehlendes Safety-Net beim Reveal**
Nach `setSceneIdx` (Z. 107-153) wird `transitioningRef = true`, `videoVisible = false` gesetzt und `currentTime = 0` zugewiesen. Reveal passiert nur über drei Pfade:
- `seeked` Listener
- `canplay` Listener (nur registriert wenn `readyState < 2`)
- `requestAnimationFrame` (nur wenn `readyState >= 2`)

**Problem:** Wenn der neue Clip-`src` noch nicht geladen ist (`readyState === 0`), wird `currentTime = 0` **vor** dem Setzen von `src` ausgeführt → wirft still einen Fehler, `seeked` feuert nie. Falls der Browser dann auch `canplay` verzögert oder gar nicht feuert (bei einigen Codec-/Cache-Konstellationen passiert das), bleibt das Video **dauerhaft unsichtbar** und `transitioningRef` bleibt `true` → `onTimeUpdate` wird ignoriert → `advanceScene` feuert nie → Übergang hängt.

**2. `preload` fehlt am `<video>`-Element (Z. 342-354)**
Ohne `preload="auto"` lädt der Browser bei einigen Konfigurationen die Metadata erst nach dem ersten Play-Versuch → `canplay` verzögert sich. Genau dort entsteht der „hängt"-Effekt.

**3. Kein Fallback-Timeout**
Es gibt keinen Sicherheits-Timeout, der nach z. B. 1500 ms zwangsweise revealt + zur nächsten Szene weitergeht, falls weder `canplay` noch `seeked` feuern.

**Warum nur EIN Übergang hängt:** Genau jener Clip, dessen Source langsamer dekodiert wird (oft der erste, der nicht im Browser-Cache ist). Die anderen sind nach dem ersten Durchlauf gecacht.

## Plan

### Fix 1 — Reveal-Reihenfolge umdrehen
- **Zuerst** `addEventListener('canplay', ...)` registrieren, **dann** auf `loadedmetadata`/`loadeddata` warten, erst **dann** `currentTime = 0` setzen. So feuert `seeked` zuverlässig.
- `loadeddata` als zusätzlichen Reveal-Trigger ergänzen.

### Fix 2 — Hard-Fallback-Timeout (1500 ms)
- Nach dem Szenenwechsel einen `setTimeout(reveal, 1500)` registrieren. Wenn nach 1.5 s **immer noch** weder `canplay` noch `seeked` gefeuert hat, einfach revealen (der Browser wird beim nächsten `play()` automatisch buffern und der User sieht statt schwarzem Bild ein kurzes Stuttern — viel besser als „hängen").
- Timeout im Cleanup canceln.

### Fix 3 — `preload="auto"` am `<video>`
- Attribute setzen, damit der Browser den Clip aggressiv vorlädt und `canplay` schneller feuert.

### Fix 4 — Defensive: `currentTime = 0` nur wenn Video bereit
- `if (v.readyState >= 1) v.currentTime = 0;` — sonst überspringen (das Video startet ohnehin von 0, weil nach `src`-Wechsel `currentTime` automatisch auf 0 zurückspringt).

## Geänderte Dateien

- `src/components/video-composer/ComposerSequencePreview.tsx` — alle vier Fixes oben (in einem Edit am Source-Effekt + dem `<video>`-Element)

## Verify

1. Preview eines Projekts mit ≥3 Szenen abspielen → **kein** Übergang bleibt schwarz hängen
2. Mit DevTools → Network throttling auf „Slow 3G" → Preview spielt weiter durch (mit kurzem Stuttern, aber ohne Hänger)
3. Slider scrubt sauber zwischen allen Szenen, auch bei kalt geladenem Cache
4. Slider bewegt sich monoton vorwärts (kein Rubber-Band)

