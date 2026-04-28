# Continuity Guardian — Falsche „Bruch"-Meldungen beheben

## Das Problem (sichtbar im Screenshot)

Der Guardian meldet auf jedem Cut hohe Drift-Werte (85, 75, 90) mit Labels wie *„different character, framing, lighting, and scene"*.

Das ist **kein Bug im Vergleich**, sondern eine falsche Grundannahme:

- Der Guardian vergleicht den **letzten Frame von Szene N** mit dem **ersten Frame von Szene N+1** und bewertet wie ein Film-Continuity-Supervisor: 0 = identisch, 100 = anderer Charakter/anderes Setting.
- In einem typischen Marketing-/Storytelling-Video sind aufeinanderfolgende Szenen **absichtlich** verschieden (Hook → Problem → Lösung, andere Räume, andere Close-ups). Daraus folgt: jeder echte Cut wird als „Bruch" gewertet.
- Ergebnis: Der Guardian ist zu 100 % Noise und der „Alle reparieren"-Button würde sinnlose Re-Renders auslösen.

## Was wir ändern

### 1. Guardian nur auf „continuity-relevante" Paare anwenden

Aktuell prüft der Guardian **jedes** AI-Szenen-Paar. Wir prüfen nur noch Paare, bei denen Continuity tatsächlich gewollt ist:

- **Geteilter Charakter**: Beide Szenen referenzieren dieselbe `characterId` aus dem Briefing (`ComposerCharacter`).
- **Explizit gelockte Anker**: Die Folgeszene hat eine `referenceImageUrl` oder `continuityLocked = true` — d. h. der User/AI will hier sichtbar Konsistenz.
- **Selber Szenentyp + grenzwertiger Cut**: z. B. zwei aufeinanderfolgende `talking-head`-Szenen.

Alle anderen Paare (intentionaler Cut zu neuem Subjekt) werden **ausgeblendet** — kein Chip, keine Warnung.

### 2. Bewertungsrubrik im Edge-Function-Prompt entschärfen

`detect-scene-drift` bekommt einen neuen Prompt, der zwischen **„geplanter Cut"** und **„unbeabsichtigter Drift"** unterscheidet. Wir geben dem Modell zusätzlichen Kontext mit (Szenentyp, ob ein gemeinsamer Charakter erwartet wird, der Prompt-Text der Folgeszene), damit es nicht stumpf Pixel vergleicht, sondern fragt: „Wäre dieser Wechsel für einen Zuschauer ein Continuity-Fehler?"

Neue Skala:
- **0–25**: Cut wirkt natürlich (egal ob gleich oder anders) → grün
- **26–55**: Auffälliger, aber vertretbarer Cut → gelb (nur Hinweis)
- **56–100**: Echter Continuity-Bruch (Charakter wechselt mitten im Dialog, Lighting springt im selben Raum) → rot

### 3. UI-Default: leise statt laut

- Wenn keine Paare nach den neuen Filterkriterien übrigbleiben, rendert die Strip-Komponente `null` (heute schon vorhanden) — also **gar kein Guardian-Block** auf solchen Projekten.
- Gibt es Paare, ist der Default-Status `unknown` (grau), nicht „Bruch". Erst nach „Alles prüfen" kommen Farben.
- Der „Alle reparieren"-Button erscheint nur, wenn mindestens ein Paar wirklich rot (`broken`) ist — gelb („drift") triggert ihn nicht mehr.

### 4. Klarere Sprache & Hinweis im Header

Der kleine Untertitel im Header wird ergänzt um eine Erklärung:
> „Prüft nur Cuts, in denen derselbe Charakter oder Anker erscheint."

So versteht der User sofort, warum manche Szenen im Guardian fehlen.

## Technische Details

**Frontend — `ContinuityGuardianStrip.tsx`**
- `pairs`-Memo erweitern: zusätzliche Filter `sharesCharacter(prev, next)`, `hasLockedAnchor(next)`, `sameSceneType(prev, next)`.
- `repairAllBroken` filtert auf `score >= 56` (statt `>= 36`).
- Header-Untertitel-Text aktualisieren.

**Edge Function — `supabase/functions/detect-scene-drift/index.ts`**
- `RequestBody` um `context?: { sceneType?: string; expectsSameCharacter?: boolean; nextPrompt?: string }` erweitern.
- `SYSTEM_PROMPT` umschreiben: explizit zwischen „intentional cut" und „continuity break" unterscheiden, neue Skala.
- `safeParseDrift`-Schwellen anpassen (`>=56` → `hard-repair`, `>=26` → `soft-repair`).

**Hook — `useContinuityDrift.ts`**
- `driftSeverity`-Schwellen synchron zur neuen Skala anpassen (15→25, 35→55, 65→… entsprechend).

**Aufrufer — `checkPair` / `checkAll`**
- Übergeben den neuen `context`-Block an die Edge Function.

## Was sich für den User ändert

- Auf dem aktuellen Projekt im Screenshot würde der Guardian-Block **komplett verschwinden**, weil keine zwei Szenen denselben Charakter teilen und nichts gelockt ist.
- Sobald der User einen Brand-Charakter ins Briefing legt oder eine Szene per „🔒 Anker verriegeln" verbindet, taucht der Guardian wieder auf — diesmal mit aussagekräftigen Werten.
- Keine falschen „Alle reparieren"-Aktionen mehr, die unnötig Credits verbrennen.

## Aus Scope raus

- Wir bauen **kein** zusätzliches Modell und keinen neuen Provider — nur Prompt- und Filter-Logik.
- Bestehende `composer_drift_checks`-History bleibt unverändert.
- Migrations sind nicht nötig.