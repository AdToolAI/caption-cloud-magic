

# Plan: Script-Generierung 504 Cold-Start-Timeout beheben

## Ursache
Die `auto-generate-universal-video` ruft `generate-universal-script` per internem HTTP-Fetch auf. Supabase hat ein ~120s Hard-Timeout für Edge-to-Edge Calls. Bei Cold Starts dauert `generate-universal-script` allein 77s zum Booten + 60s+ für die AI-Antwort → 504.

Das ist kein neuer Bug — es war immer latent da, tritt aber bei Cold Starts auf (z.B. nach Deployments oder Inaktivität).

## Lösung: Script-Generierung inline ausführen

Statt von einer Edge Function eine andere per HTTP aufzurufen (was dem Gateway-Timeout unterliegt), wird die Script-Logik **direkt in `auto-generate-universal-video`** eingebaut.

### Schritt 1: Prompt-Logik aus `generate-universal-script` extrahieren
Die relevanten Teile (Kategorie-Profile, Storytelling-Strukturen, System-Prompt-Aufbau, JSON-Repair) als Hilfsfunktionen direkt in `auto-generate-universal-video/index.ts` integrieren.

### Schritt 2: Direkter AI-Gateway-Call statt internem Fetch
Statt:
```text
auto-generate → fetch(generate-universal-script) → 504 bei Cold Start
```
Nachher:
```text
auto-generate → direkt AI Gateway (ai.gateway.lovable.dev) → kein interner Hop
```

### Schritt 3: Timeout-Absicherung
- `AbortController` mit 120s Timeout auf den AI-Call
- Bei Timeout: Retry mit kürzerem Prompt oder schnellerem Modell (`gemini-2.5-flash-lite`)

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `supabase/functions/auto-generate-universal-video/index.ts` | Script-Generierung inline statt per Fetch |
| `supabase/functions/generate-universal-script/index.ts` | Bleibt bestehen für direkten Aufruf, aber nicht mehr von auto-generate genutzt |

## Erwartetes Ergebnis
- Kein 504 mehr bei Cold Starts
- Pipeline läuft komplett durch bis zum Render (inkl. Sound Effects + Hintergrundmusik)
- Die separate `generate-universal-script` Funktion bleibt für andere Aufrufe verfügbar

