## Status quo — drei verschiedene Pipelines, je nach Sprecherzahl

| Sprecher | Erster Versuch | Verhalten bei Failure |
|----------|----------------|------------------------|
| **1**     | v5 single-pass (1 Sync.so call)                                                                | Standard-Retry-Ladder |
| **2**     | v5 **parallel fan-out** (2 Sync.so calls auf dieselbe Plate, gleichzeitig)                     | Standard-Retry-Ladder, **keine** v58 Multipass-Fallback-Logik |
| **3-4**   | **v56 sync-3 `segments[]`** (1 Call) → bei `provider_unknown_error` automatisch **v58/v59 per-speaker chained multipass** (serial, 1 Call pro Sprecher, Output von Pass N speist Pass N+1) | v59 sticky markers, garantierter Refund, stabil bewiesen |

Die einzige Pipeline, die laut FROZEN-INVARIANTS und Memory-Doks **reproduzierbar stabil** ist, ist die **v58/v59 per-speaker chained multipass**. Sie wird heute aber nur bei 3-4 Sprechern erreicht — und auch dort erst **nach** einem fehlgeschlagenen v56-Versuch.

Bei 2 Sprechern läuft heute **paralleler v5 fan-out** — genau die Architektur, die wir bei 3+ wegen Dispatch-Race und Sync.so-`unknown error` schon abgeschafft haben (v33). Das deckt sich mit dem aktuellen Fehlerbild im Screenshot.

## Vorschlag — eine einheitliche Pipeline für alle N≥2

Nicht „die 3-4-Pipeline überall nehmen" wörtlich (denn der v56-Erstversuch *ist* der schwächste Teil), sondern: **per-speaker chained multipass als kanonischen Pfad für jedes N≥2**, ohne v56-Vorrunde und ohne 2-Sprecher-Parallel-Fan-Out.

```text
N = 1   →  v5 single-pass                       (unverändert)
N ≥ 2   →  v58/v59 per-speaker chained multipass (immer, sofort)
            ├── 1 Sync.so-Call pro Sprecher, seriell
            ├── Output Pass K  →  Input Pass K+1
            ├── Sticky `force_multipass` / `multipass_fallback_attempted`
            └── Audio-Mux am Ende via render-sync-segments-audio-mux
```

### Was geändert wird

1. **`compose-dialog-segments` — Gate vereinfachen** (FROZEN I.2 wird *strenger*, nicht laxer)
   - `useV41Official` wird hart auf `false` gesetzt für **alle** Multi-Speaker-Fälle. Der gesamte v56-`segments[]`-Pfad wird nur noch erreichbar, wenn `speakers.length === 1` *und* der Body explizit `force_v56: true` setzt (heute nirgends genutzt — effektiv toter Code, bleibt aber vorhanden für künftige Single-Speaker-Experimente).
   - `forceMultipass` ist neuer Default für `N ≥ 2`, ohne Body-Flag, ohne Webhook-Round-Trip.
   - Sticky markers (`force_multipass`, `multipass_fallback_attempted`) werden für **alle** N≥2 von Anfang an gesetzt, damit Retries niemals zurück in einen anderen Pfad fallen können.

2. **`compose-dialog-segments` — `fanOutAllowed` killen**
   - Zeile 2418 `const fanOutAllowed = passes.length > 1 && passes.length <= 2;` wird zu `const fanOutAllowed = false;`.
   - Damit läuft 2-Sprecher genau wie 3-4: nur Pass 0 wird sofort dispatched, der Webhook chained Pass 1..N-1 seriell beim COMPLETE-Event über `pendingIdxs[0]`. Eliminiert die Dispatch-Race, die v33 für N≥3 schon entschärft hat — analog für N=2.

3. **`sync-so-webhook` — Multipass-Fallback-Branch wird zum „Härtungs-Branch"**
   - Der v58-Fallback-Code, der heute nur bei `isV56Manual && isMultiSpeaker && unknown error` feuert, ist effektiv obsolet (kein v56-Versuch mehr → kein Trigger). Wir lassen ihn als **Defense-in-Depth** stehen (Log-Marker `INVARIANT_VIOLATION_v56_reentered`), entfernen ihn nicht. Falls je ein Codepfad versehentlich v56 reaktiviert, fängt der Branch das auf.
   - Die multi-speaker partial-mux-Sperre (v36, kein „2/3 sind ok") bleibt unverändert.

4. **FROZEN-INVARIANTS.md aktualisieren**
   - I.1 wird umformuliert: „v58 multipass ist die **einzige** Lip-Sync-Pipeline für **alle** Szenen mit ≥2 Sprechern" statt „für ≥3".
   - I.2 (`useV41Official`-Gate) bekommt einen weiteren Satz: das Gate **darf** für Multi-Speaker nie wieder true werden.
   - Neue Sektion I.9: „Kein paralleler Fan-Out für irgendeine Sprecherzahl. Webhook-gechainte Serial-Dispatches sind der einzige erlaubte Modus."
   - Memory `mem://architecture/lipsync/multi-character-pipeline-hardening-v33` bekommt einen v60-Nachfolger, der die Vereinheitlichung dokumentiert.

5. **Pricing & Refunds — keine Änderung erforderlich**
   - `ceil(durSec) × 9 × N_passes` greift bereits per N. 2-Sprecher kostet weiterhin 2× single-pass; das war schon vorher so für den v5-Pfad, nur dispatched eben jetzt seriell statt parallel. Latenz steigt minimal (~+8-12s pro zusätzlichem Sprecher).
   - Idempotente Refunds laufen über die bestehenden v23 server-owned state hooks unverändert weiter.

### Was explizit **nicht** angefasst wird

- `MAX_SPEAKERS = 4` (FROZEN I.6) — bleibt.
- `safeCharacters`-Filter im StoryboardTab (FROZEN I.7) — bleibt.
- Locked-camera-Master-Plate-Prompt (FROZEN I.4) — bleibt.
- Multi-speaker ASD-Guard (FROZEN I.5) — bleibt; betrifft Manual-ASD und ist im chained Pipeline-Pfad sowieso aktiv.
- `compose-video-clips`, `compose-scene-anchor`, `sync-so-webhook` audio-mux Branch (`render-sync-segments-audio-mux`) — bleiben.
- Composer Storyboard / Cast & World UI — keine UI-Änderung, einzig der Generieren-Klick führt jetzt für 2-Sprecher zum chained Pipeline statt zum parallel fan-out.

### Verifikation

1. 2-Sprecher-Szene neu generieren — Logs müssen `SERIAL mode (2 speakers)` + 2 sequentielle Sync.so-Jobs zeigen, **keinen** v56-Dispatch.
2. 3-Sprecher-Szene erneut — Logs zeigen denselben Serial-Pfad, jetzt aber sofort statt erst nach v56-Failure (keine `provider_unknown_error` mehr im Erstversuch).
3. 1-Sprecher-Szene — unverändert, ein einziger v5-Pass, kein Multipass.
4. Soft-Log `INVARIANT_VIOLATION_v56_reentered` bleibt in Edge-Logs leer.

### Risiken & Mitigation

- **Latenz für 2 Sprecher steigt um ~Sync.so-Roundtrip-Zeit (8-12s)**, weil seriell statt parallel. Akzeptabel im Vergleich zum aktuellen Failure-Rate-Hit.
- **Bestehende laufende 2-Sprecher-Renders** bleiben unberührt; Änderung greift nur für neue Dispatches.
- Der v56-Code-Pfad wird zwar toter Code für Multi-Speaker, aber **nicht gelöscht** — wir wollen die Fallback-Wand behalten, falls Sync.so ihre `segments[]`-API jemals stabilisiert.