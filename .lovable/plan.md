

# Plan: Scroll-Steuerung fixen + Video-Fehler beheben

## Problem 1: Scroll-to-Rotate funktioniert nicht
Der `containerRef` liegt auf dem äußeren `div.space-y-4`, das den Header, Dots und News-Bereich einschließt. Embla's internes Scroll-Handling fängt Wheel-Events ab bevor unser Handler sie bekommt. Der `onWheel`-Handler muss direkt auf dem **Perspektive-Wrapper** (das `div` mit `perspective: 1200px`) liegen, nicht auf dem äußeren Container.

**Fix**: `containerRef` auf das Perspektive-Wrapper-`div` verschieben (Zeile 205) statt auf den äußeren Container (Zeile 187). Zusätzlich Embla mit `watchDrag: true` aber ohne eigenes Scroll-Handling konfigurieren.

## Problem 2: 3 von 10 Videos laden nicht
Wahrscheinlich löst `resolveVideoUrl` manche Pfade falsch auf — z.B. Pfade die keinem bekannten Bucket zugeordnet werden. 

**Fix**:
- Besseres Logging im `onError` Callback: die fehlgeschlagene URL in der Konsole ausgeben damit wir debuggen können
- `resolveVideoUrl` robuster machen: auch Pfade ohne Bucket-Prefix besser handhaben, und bei bereits vollständigen Supabase-URLs nichts verändern
- Retry-Mechanismus: bei `onError` einmal mit alternativem Bucket versuchen bevor "nicht verfügbar" angezeigt wird

## Betroffene Datei
| Datei | Änderung |
|-------|----------|
| `src/components/dashboard/DashboardVideoCarousel.tsx` | containerRef verschieben, URL-Auflösung verbessern, Error-Logging |

