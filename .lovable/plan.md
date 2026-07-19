## Problem

Der Fehler `anchor_identity_duplicate_detected: Reference #1 appears twice, Reference #4 missing` blockt die Szene weiterhin hart — obwohl die [CastActions] jetzt greifen und die Personen ihre Tasks ausführen. Ursache liegt in der Anchor-Retry-Ladder, nicht in der Prompt-Enrichment.

## Root Cause (verifiziert in `compose-video-clips/index.ts`)

1. **Attempt-3 Face-Lock läuft nur bei `swap`** (Zeile 2404–2435): `if (identityFailure === "swap" && ...)`. Der aktuelle Fehler ist aber `clone` (gleicher Bruder zweimal, anderer Bruder fehlt). Damit endet der Retry für Clone-Fälle nach Attempt-2.
2. **Soft-Pass-Gate verlangt `>= 3` Attempts** (Zeile 2527): `(((scene as any).__anchorAttempts?.length ?? 0) >= 3)`. Da Clone nie 3 Attempts erreicht, fällt es immer in den Hard-Fail-Zweig (Zeile 2544–2560).

Ergebnis: Für Cast mit ähnlich aussehenden Geschwistern (Samuel/Matthew Dusatko) landet jede Szene mit Clone-Verdacht im Hard-Fail — die neue Family-Name-Distinguish-Klausel im Anchor-Prompt kann das nicht immer verhindern, weil Nano Banana zwei Brüder mit sehr ähnlicher Physiognomie strukturell schwer trennt.

## Fix (zwei kleine Änderungen in `supabase/functions/compose-video-clips/index.ts`)

### 1. Attempt-3 Face-Lock auch für `clone`
Face-Lock zwingt Nano Banana, jedes Slot-Face pixelgenau aus dem zugehörigen Identity-Headshot zu kopieren. Das ist genau das Werkzeug gegen Clone-Verwechslungen bei ähnlichen Gesichtern — nicht nur gegen Swap.

Retry-Guard auf beide Fälle erweitern:
```ts
if (
  (identityFailure === "swap" || identityFailure === "clone") &&
  identityPortraitUrls.length === portraitUrls.length
) { ... }
```
Der Anchor-Attempt-Forensik-Eintrag bekommt `mode: "face-lock"` (Clone) bzw. bleibt `"face-lock"` (Swap) — Format unverändert.

### 2. Soft-Pass-Gate lockern
Wenn nach allen Retries `faceCount === expectedFaces` und `humanCount === expectedFaces` gilt — also die Szene die richtige Anzahl Personen zeigt — reicht das für einen Soft-Pass. Die Attempts-Zahl ist dabei irrelevant; sie war ein Proxy für "wir haben es versucht", macht aber Clones strukturell unerreichbar.

Neue Bedingung:
```ts
const softPassEligible =
  headcountOk &&
  (identityFailure === "clone" || identityFailure === "swap");
```
Der Soft-Pass-Warntext bleibt gleich (weist Nutzer auf "ähnliche Gesichter, Anchor bitte prüfen" hin), Pipeline läuft normal weiter, User kann im Editor entscheiden ob er neu rendert.

## Was NICHT geändert wird
- Retry-Budget bleibt bei max. 3 Attempts (kein Extra-Credit-Verbrauch).
- Family-Name-Distinguish-Klausel im `compose-scene-anchor` bleibt aktiv (hilft bei Attempt-1/2).
- Missing/Ambiguous/Extra bleiben unverändert (kein Soft-Pass — echte Composition-Fehler).
- Hailuo/Sync.so-Dispatch-Gates unverändert; Soft-Pass hat schon vorher `fall through into normal pipeline` gemacht.

## Verifikation
- Deploy `compose-video-clips`.
- Szene "Hook" (S01) neu rendern → erwartet: entweder Attempt-3 Face-Lock liefert saubere Identität, oder Soft-Pass mit Warntext + Anchor sichtbar in Vorschau + Clip läuft durch.
- Forensik-Trail (`audio_plan.twoshot.anchor_attempts`) zeigt jetzt `attempt=3, mode="face-lock"` auch für Clone.
