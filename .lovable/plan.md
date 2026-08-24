# Warum die neue 4-Sprecher-Szene fehlgeschlagen ist — und der Fix

## Befund (aus DB + Edge-Logs, nicht geraten)

Szene `67b392b1` (S02, HappyHorse, Dialog & Lip-Sync an) ist terminal gescheitert mit:

```text
fa4_fail_closed:count_mismatch:anchor=4/plausible=3/detected=4
[plateFaceSlotRouter] fa4_candidate_sanity detected=4 plausible=3 rejected=1
  reasons=[{"index":3,"reason":"area_too_small"}]
```

Übersetzt: Auf der Plate wurden **alle 4 Gesichter gefunden**. Der Plausibilitätsfilter vor der
Slot-Zuordnung hat aber ein Gesicht verworfen, weil seine Fläche unter dem absoluten Mindestmaß
liegt (`minAreaRatio = 0.003`, also < 0,3 % der Plate-Fläche ≈ < 76×76 px bei 1920×1080). Damit
gab es nur noch 3 plausible Kandidaten für 4 Anker-Slots → `count_mismatch` → Fail-Closed. Das ist
kein Zufallsfehler: In einer weiten 4-Personen-Totale ist die hinterste Person systematisch zu
klein für diese absolute Schwelle.

## Zwei Teile — der Fix und der Schutz

### 1) Plausibilitätsschwelle skalenrelativ machen (Kern-Fix)

Der Fail-Closed-Vertrag bleibt vollständig erhalten. Geändert wird nur die Definition von
„plausibler Kandidat":

- Zusätzlich zum absoluten Boden ein **relativer Boden**: ein Gesicht gilt als plausibel, wenn
  seine Fläche mindestens ein festes Verhältnis (Vorschlag: 25 %) der **Median-Fläche** der
  übrigen erkannten Gesichter erreicht — auch wenn es unter 0,3 % der Plate liegt.
- Der absolute Boden wird auf einen echten Detektionsboden gesenkt (Vorschlag: 0,0012 ≈ 48×48 px
  bei 1920×1080), unter dem kein Mund mehr auflösbar ist.
- Alles andere (Aspect, In-Plate, degeneriert, Bijektion, Tie-Ambiguität) bleibt unverändert.
- Damit kommen weite Gruppen-Plates durch, während echte Fehl-Detektionen (Spiegelung, Poster,
  Gesicht im Hintergrund) weiterhin sicher rausfallen — die sind klein **und** weit unter dem
  Median.

### 2) Die zu weite Plate vor dem Rendern abfangen

Ein 4. Gesicht bei ~0,3 % Plate-Fläche übersteht später die Mund-Gates ohnehin nur knapp. Deshalb
zusätzlich, rein präventiv:

- Nach der Anker-Messung eine **Framing-Warnung**, wenn das kleinste Gesicht deutlich unter dem
  Median liegt: Hinweis in der Szene, dass die Gruppe enger gestaffelt werden soll
  (halbnah statt Totale), inkl. konkreter Empfehlung.
- Die Fehlermeldung in der Szenenkarte bekommt statt „Details unter Details" eine klare Ursache:
  „Ein Gesicht war auf dem Bild zu klein für Lip-Sync (zu weite Kadrierung)" — lokalisiert
  DE/EN/ES.

## Ablauf danach

Kein neuer teurer Lauf im selben Schritt: erst Fix + Unit-Tests, dann genau ein kontrollierter
Re-Render dieser Szene, dann Auswertung der `fa4_candidate_sanity`-Zeile (erwartet:
`detected=4 plausible=4`).

## Technische Details

- `supabase/functions/_shared/plate-face-candidates.ts`: `plateFaceSanity` erhält den relativen
  Median-Boden (neue Signatur mit Kontext der übrigen Kandidaten), `filterPlausibleCandidates`
  berechnet den Median vorab; Konstanten in `PLATE_FACE_SANITY` dokumentiert.
- `supabase/functions/_shared/plate-face-candidates.test.ts`: Fälle für „kleines echtes 4.
  Gesicht akzeptiert" und „Mini-Fehldetektion weiter verworfen".
- `supabase/functions/_shared/plateFaceSlotRouter.ts`: Telemetrie-Zeile um `areaRatios` und
  `medianArea` erweitern, damit künftige Fälle ohne Rätselraten lesbar sind.
- Fehlertext-Mapping in der Szenenkarte (`src/components/video-composer/…`) für
  `fa4_fail_closed:count_mismatch` + Framing-Hinweis; keine Änderung an Pipeline-Reihenfolge,
  Retry-Logik oder Credit-/Refund-Pfad.
- Offen aus dem vorherigen Plan (nicht Teil dieses Gates): Skript-Studio-Platzhalter und
  Entschärfung des Director-Score-Blocks.
