## Diagnose

Ich habe den Detector-Filter (`detectBriefingFidelity` in `src/hooks/useStoryboardTransition.ts`) mit einem Node-Testlauf gegen genau die Zeilen aus dem Screenshot geprüft (`Medium Close-up:`, `Studio:`, `Split:`, `Empfohlen:`, `Die Botschaft des Videos:` …). Ergebnis: **alle werden korrekt verworfen, nur `SAMUEL:` wird als Label akzeptiert**. Der Code auf dem Branch ist also bereits richtig.

Zwei plausible Ursachen, warum der Screenshot trotzdem den vollen Müll zeigt:

1. **HMR-Cache**: `useMemo(() => detectBriefingFidelity(briefing), [briefing])` hat den alten (permissiven) Detector-Result während Hot-Reload weiterverwendet, weil das `briefing`-Objekt referenzgleich blieb. Ein harter Reload würde es fixen — aber das ist nicht akzeptabel als „Fix".
2. **Kein zweiter Filter im UI**: `ScriptSpeakerMapper` vertraut blind der Liste vom Detector. Wenn der Detector jemals wieder aufweicht (Regression), landet der Müll sofort wieder im UI.

## Fix — Defense-in-Depth im Mapper selbst

Nur eine Datei: `src/components/video-composer/briefing/ScriptSpeakerMapper.tsx`.

**1. Lokale `isValidSpeakerLabel(label, characters)` einführen** (dieselbe Akzeptanz-Regel wie im Detector, dupliziert für Robustheit):

- Länge 2–32, Tokens ≤ 3.
- Deny-List (Studio, On, Text, Split, Empfohlen, Optional, Endcard, Creator, Medium, Close, Push, Tracking, Cinematic, Realistische, Perfekter, Helles, Nicht, Nach, Da, Sondern, Create, Die, Der, Das, Ein, Eine, Clean, Heroisch(er), Vier, Benennt, Erstelle, …).
- Akzeptanz nur, wenn:
  - **entweder** alle Tokens strikt ALL-CAPS (`^[A-ZÄÖÜ][A-ZÄÖÜ0-9.]*$` bzw. reine Ziffern),
  - **oder** das Label matcht einen gebrieften Charakter (exact / prefix / suffix nach Normalisierung — keine Substrings).

**2. Liste vor dem Render filtern**:

```ts
const cleanLabels = useMemo(
  () => fidelity.speakerLabels.filter(l => isValidSpeakerLabel(l, characters)),
  [fidelity.speakerLabels.join('|'), characters.map(c => c.id).join('|')],
);
```

Sämtliche Renderpfade (`.map`, „kein Match"-Warnung, Prune-Effect, `anyMatch`-Check) benutzen `cleanLabels` statt `fidelity.speakerLabels`.

**3. Karte komplett ausblenden**, wenn `cleanLabels.length === 0` **oder** kein einziges `cleanLabels[i]` per `autoMatch` einen Charakter trifft. Damit verschwindet die Sektion garantiert bei diesem Bullet-Briefing.

**4. Prune-Effect nutzt `cleanLabels`** — persistierte `speakerMap`-Einträge zu Junk-Labels (aus früheren Sessions vor dem Fix) werden automatisch weggeräumt.

## Warum das die Beschwerde final erledigt

- Selbst wenn der Detector regressiert oder HMR einen alten Wert cached, filtert das UI eine zweite Mal.
- Der Filter ist rein presentational — keine Backend-, Parser- oder Prompt-Änderung.
- Bei einem echten Skript (`SAMUEL:`, `MATTHEW DUSATKO:`) bleibt der Mapper voll funktional.

## Verifikation

- Screenshot-Briefing (Bullet-Titel wie „Medium Close", „Studio", „Empfohlen"): Karte verschwindet komplett.
- Echtes Skript mit `SAMUEL:` / `MATTHEW:`: Karte erscheint, Auto-Match läuft.
- Typecheck grün.