
Ziel: Den verbleibenden Stotterer 0,1–0,2s nach jedem Übergang entfernen. Der aktuelle Handoff ist fast richtig, schaltet aber noch zu früh zurück.

1. Root Cause präzise beheben
- In `useTransitionRenderer.ts` ist die Bedingung im `handoff` aktuell zu permissiv:
  - `handoffSeekedRef.current` wird direkt nach `base.currentTime = incoming.currentTime` auf `true` gesetzt
  - die Abschlussbedingung `baseReady && (timeDiff < 0.1 || handoffSeekedRef.current)` ist dadurch praktisch sofort wahr
- Ergebnis:
  - Das Incoming-Layer wird versteckt, bevor das Base-Video den Seek wirklich fertig dekodiert hat
  - Der sichtbare Hänger erscheint dann leicht verzögert genau 0,1–0,2s nach dem Übergang

2. Handoff auf echte Seek-Fertigstellung umstellen
Datei: `src/components/directors-cut/preview/useTransitionRenderer.ts`
- Den `handoff`-Ablauf in zwei echte Schritte teilen:
  - `handoffRequestedRef`: Seek wurde ausgelöst
  - `handoffReadyRef`: Base hat den Seek wirklich abgeschlossen
- Die Handoff-Fertigstellung nur erlauben, wenn wirklich beide Bedingungen erfüllt sind:
  - `base.readyState >= 2`
  - `Math.abs(base.currentTime - incoming.currentTime) < sehr kleinem Threshold` (z. B. 0.03–0.05)
- Wichtig:
  - `handoffSeekedRef` darf nicht mehr selbst als Erfolgskriterium dienen
  - optional `seeked`-Event auf dem Base-Video einmalig anhängen, damit Readiness nicht nur vermutet wird

3. Während des Handoffs das Incoming-Layer stabil stehen lassen
Datei: `src/components/directors-cut/preview/useTransitionRenderer.ts`
- Solange das Base-Video noch nicht wirklich fertig ist:
  - Incoming sichtbar lassen
  - keine weitere Cleanup-Logik ausführen
  - Base bereits mit neutralen Styles im Hintergrund halten
- Dadurch bleibt der Decoder-Seek vollständig unsichtbar

4. Boundary-Suppression gezielter nach echtem Handoff-Ende koppeln
Datei: `src/components/directors-cut/preview/useTransitionRenderer.ts`
Datei: `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- `transitionCooldownRef.current = 30` erst dann setzen, wenn der Handoff wirklich abgeschlossen ist
- So wird der Boundary-Advance nicht zu früh wieder aktiv, während das Base-Video noch mitten im Seek-Recovery ist

5. Reset/Seek auf neue Handoff-Refs erweitern
Datei: `src/components/directors-cut/preview/useTransitionRenderer.ts`
Datei: `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`
- Beim manuellen Seek/Reset:
  - alle Handoff-Refs sauber zurücksetzen
  - eventuelle `seeked`-Listener entfernen
  - Incoming wieder in neutralen Zustand bringen
- Damit Scrubbing und Wiederholen stabil bleiben

Technische Kurznotiz
```text
Aktuell:
handoff start
-> base.currentTime = incoming.currentTime
-> handoffSeekedRef = true
-> Abschlussbedingung wird fast sofort erfüllt
-> incoming verschwindet zu früh
-> 100–200ms später sichtbarer Decoder-Hänger

Nach Fix:
handoff start
-> base seek wird angefordert
-> incoming bleibt sichtbar
-> warten auf echte base-Seekkonsistenz + readiness
-> erst dann swap auf base
=> kein verzögerter Stotterer nach dem Übergang
```

Betroffene Dateien
- `src/components/directors-cut/preview/useTransitionRenderer.ts`
- `src/components/directors-cut/DirectorsCutPreviewPlayer.tsx`

Ergebnis
- Kein verzögerter Mini-Ruckler nach Übergängen
- Übergänge enden sichtbar sauberer
- Bestehende Crossfade/Slide/Wipe-Logik bleibt erhalten
