# v131.1 — Rule 0 Trust-Erweiterung für Preclip ohne Probe

## Diagnose (gerade aus den Live-Logs bestätigt)

`syncso_dispatch_log` zeigt für die letzten Failures genau das Muster, das wir eigentlich loswerden wollten:

```
sync_status:      FACE_GATE_PROBE_UNAVAILABLE
                  → DISPATCHED  (coords=[360,360], frame_number=3, sync_source_kind=segments)
                  → FAILED      (http=200, error_class=other, "Something went wrong …")
```

`asd_mode_chosen`, `rule`, `preclip_face_count`, `preclip_ambiguity` sind in `meta` **leer**.

Ursache:
- Der serverseitige Face-Probe ist auf Preclip-Assets bewusst deaktiviert
  (`server_extract_disabled_use_client_canvas`) → `passFaceCount` bleibt `null`.
- Damit ist in `compose-dialog-segments/index.ts:3585` `preclipFaceCount=null`
  und `ambiguityRiskForStrategy=null`.
- In `_shared/asd-strategy.ts:231` verlangt Rule 0 **hart** `=== 1` und
  `=== "clean"`. Beide false → Rule 0 feuert nicht → Fallback in Rule 1
  baut wieder das `(coordinates, frame_number)`‑Tupel, das laut Replay-Lab
  reproduzierbar `generation_unknown_error` triggert.

Kurz: v131 ist deployed, wird aber im Preclip-Pfad nie aktiv, weil die
einzige Quelle, die Rule 0 freischalten könnte, in Production gar nicht
existiert.

## Ziel

`auto_detect` muss der **Default** für jeden Preclip-Pass werden, sobald
keine konkrete Gegenanzeige (Multi-Face im Crop, Ambiguity) vorliegt — auch
wenn der Face-Probe keine Zahl liefert. Coords/Frame nur noch, wenn wir
positive Evidenz **gegen** auto_detect haben (Multi-Speaker mit
verifiziertem Crop ODER explizite Retry-Variante).

## Änderungen

### 1) `supabase/functions/_shared/asd-strategy.ts`
- Neues Feld `preclipTrust: "verified" | "probe-confirmed" | "unknown"`
  im `BuildAsdInput.geometry` (default `"unknown"`, abwärtskompatibel).
- Rule 0 fire-Bedingung wird umgebaut auf:
  ```
  usePreclip
  && !isMultiSpeaker
  && retryVariant nicht "coords-pro" / "preflight-snap"
  && preclipAmbiguityRisk !== "neighbor_inside_crop"
  && (
       (preclipFaceCount === 1 && preclipAmbiguityRisk === "clean")   // alter v131-Pfad
       || preclipFaceCount === null                                   // Probe nicht verfügbar
       || preclipTrust === "verified"                                 // Preclip aus Face-Center-Pipeline
     )
  ```
- Diagnostics-Feld `rule` erhält neue Werte:
  `rule_0_preclip_probe_unavailable`, `rule_0_preclip_verified`,
  zusätzlich zum bestehenden `rule_0_preclip_single_face_verified`.
- Unit-Tests in `_shared/asd-strategy.test.ts`:
  - `faceCount=null + ambiguity=null + !multiSpeaker → auto_detect, rule_0_preclip_probe_unavailable`
  - `faceCount=null + ambiguity="neighbor_inside_crop" → kein Rule 0`
  - `faceCount=null + multiSpeaker → kein Rule 0`
  - `preclipTrust="verified" + faceCount=2 → kein Rule 0` (Multi-Face schlägt Trust)
  - Bestehende 16 Tests müssen weiter grün sein.

### 2) `supabase/functions/compose-dialog-segments/index.ts`
- An der Call-Site (~Zeile 3582) `preclipTrust` mitschicken:
  - `"verified"` wenn `preclip.source === "preclip-validated"` oder das
    upstream-Crop aus dem Face-Gate-Repair-Loop (v116) kommt
    (`repairAttempts >= 0 && preclip.preclipUrl` gesetzt und kein
    `preclip_error`).
  - `"probe-confirmed"` wenn `passFaceCount === 1` (alter Pfad).
  - sonst `"unknown"`.
- Snap-Pfad bei Zeile ~4455 bleibt unverändert (`preclipTrust: "unknown"`
  reicht, weil Rule 1 dort sowieso über `preflight` triggert).
- Neues `meta`-Feld in `syncso_dispatch_log` über bestehenden Logger:
  `preclip_trust`, `asd_rule_fired` (kommt aus `strategy.diagnostics.rule`),
  `asd_mode_chosen` (aus `strategy.mode`). Kein Schema-Change nötig — geht
  in `meta` jsonb.

### 3) Forensik / UI (read-only Anpassung)
- `src/components/admin/SyncsoForensicsSheet.tsx`: in der "Strategy"-Zeile
  zusätzlich `preclip_trust` und `asd_rule_fired` anzeigen (beide aus
  `meta`), damit man sofort sieht, warum Rule 0 (nicht) gefeuert hat.
- `src/lib/syncReplayClassify.ts`: neuen Verdict-Branch
  `legacy_coords_probe_unavailable` für historische Rows ohne `preclip_trust`,
  damit alte Failures korrekt als "vor v131.1" gelabelt werden.

### 4) Verifikation
1. Nach Deploy: 1 Hook-Szene mit gleichem Asset re-rendern.
2. SQL-Check: in `syncso_dispatch_log` darf für neue Dispatches **kein**
   `coords` mehr gesetzt sein (außer bei `retry_variant` snap/coords-pro
   oder Multi-Speaker mit verifiziertem Crop).
3. `meta->>'asd_rule_fired'` muss
   `rule_0_preclip_probe_unavailable` oder `rule_0_preclip_verified`
   enthalten.
4. 24h-Canary: `error_class='other' AND error_message ILIKE '%Something went wrong%'`
   auf Preclip-Passes < 1%.
5. Abort-Kriterium: > 5% neue Failures mit `asd_mode=auto_detect` →
   Rollback durch Setzen eines Feature-Flags (folgt in v131.2 falls nötig).

## Files

- `supabase/functions/_shared/asd-strategy.ts` (Rule 0 erweitern, Diagnostics)
- `supabase/functions/_shared/asd-strategy.test.ts` (4 neue Tests)
- `supabase/functions/compose-dialog-segments/index.ts` (preclipTrust + meta-Logging)
- `src/components/admin/SyncsoForensicsSheet.tsx` (2 neue Felder anzeigen)
- `src/lib/syncReplayClassify.ts` (Verdict-Branch)
- `mem/architecture/lipsync/v131-1-rule-0-trust-extension.md` (neu, kurz)
- `mem/index.md` (Eintrag aktualisieren)

Keine Schema-Migration, keine Provider-Änderung.
