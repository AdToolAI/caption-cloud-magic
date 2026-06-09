## Lip-Sync Pipeline — Stand Juni 2026 (Phase 2 abgeschlossen)

### 1. Was wir jetzt haben (v82 + v83 + v84)

**Aktueller Retry-Ladder (identisch in Dispatcher + Webhook):**

```text
1. bbox-url-pro     → sync-3 + bounding_boxes_url (Phase 2.1, NEU PRIMARY)
2. coords-pro       → sync-3 + point-ASD
3. coords-pro-box   → sync-3 + inline bounding_boxes
4. sync3-coords     → sync-3 + point-ASD (Alias)
5. coords-pro-lp2pro→ lipsync-2-pro + point-ASD (Phase 2.3 wieder erreichbar)
6. auto-pro         → lipsync-2-pro + auto_detect
7. auto-standard    → lipsync-2 + auto_detect (Last-Ditch vor Refund)
```

**Fresh-Dispatch-Gate für `bbox-url-pro`:**
`speakers.length ≥ 2 && plateDims && plateIdentityMap.resolvedCount > 0 && !pass.preclip_url`
→ sonst Legacy-Default `coords-pro`.

**Hailuo-Prompt-Layer (v83):** n=1/n=2 dürfen wieder Profile + OTS, n≥3 bleibt strikte horizontale Linie (ASD-Slot-Mapping).

---

### 2. Vergleich mit der „alten" Pipeline (vor Phase 2)

| Aspekt                          | Alt (≤ v81)                                        | Neu (v82–v84)                                               |
| ------------------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| Multi-Speaker PRIMARY           | `coords-pro` (point-ASD)                           | `bbox-url-pro` (per-frame JSON URL)                         |
| Strukturelle „kein-Avatar-Hit"  | Vorhanden bei langen/komplexen Plates              | Eliminiert via deterministische Box-Map pro Frame           |
| Hailuo-Framing n=1/n=2          | Frontal/Three-quarter erzwungen                    | Profile + OTS erlaubt (sync-3 verträgt's)                   |
| `coords-pro-lp2pro` Escape Hatch | Vom Webhook gerufen, vom Dispatcher abgelehnt → tot | Im Ladder beider Files, v61 Logic läuft wieder              |
| Retry-Ladder-Drift              | Dispatcher ≠ Webhook (6 vs 7 Einträge)             | Beide Files identisch, 7 Einträge                           |

---

### 3. Vergleich mit Sync.so Docs (v3 / sync-3)

| Sync.so-Vorgabe                                          | Unser Stand                                                              | OK? |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | --- |
| `bounding_boxes_url` als JSON in External Storage         | `composer-frames/${userId}/.../asd/${sceneId}-pN-<ts>.json`              | ✅   |
| Schema: `{ bounding_boxes: [[x1,y1,x2,y2], …] }`         | Exakt so, Länge = `ceil(totalSec × 30)`                                  | ✅   |
| Per-Frame-Liste, 30 fps                                  | 30 fps hart-kodiert (matcht Hailuo-Plate-fps)                            | ✅   |
| Empfohlen für long-form / multi-face                     | Genau dort als PRIMARY aktiviert                                         | ✅   |
| sync-3 als universeller Default                          | `payloadModel`-Tail standardmäßig `SYNC3_MODEL`                          | ✅   |
| Profile / partial occlusion natively supported           | Prompt-Layer öffnet das (v83)                                            | ✅   |
| `sync_mode=cut_off` wenn VO länger als Plate             | Aktiv                                                                    | ✅   |
| Per-Speaker Audio-Mute für N≥2                          | Frozen-Invariant I.1 — chained Multipass                                 | ✅   |

**Nicht umgesetzt (bewusst, kein Bug):**
- HDR-Preflight / 4K-Cap (Plan 2.4) — braucht ffprobe/Lambda, nicht im Edge möglich.
- "speaking naturally with subtle mouth movement"-Suffix — würde die v60-Ventriloquist-Fixe brechen, daher gestrichen (vgl. v83-Doku).

---

### 4. Realitätscheck aus `syncso_dispatch_log` (letzte 7 Tage)

```text
coords-pro            DISPATCHED  269
coords-pro            FAILED      148   ← 35 % Provider-Fail → Fallback-Kette
coords-pro-box        DISPATCHED   39
coords-pro-box        FAILED       40   ← 50 % Fail (lange BBox-Arrays)
sync3-coords          50/50
coords-pro-lp2pro       3 dispatched, 3 failed
bbox-url-pro            0           ← noch nie gefeuert
cinematic-sync (Single-Speaker) sauber
```

**Befund:** `bbox-url-pro` ist deployed, aber in den letzten 48 h hat noch keine Szene das Gate `N≥2 ∧ plateDims ∧ plateIdentity.resolved>0 ∧ !preclip_url` getroffen — entweder weil zuletzt nur Single-Speaker lief oder das Preclip-Vorrang die Multi-Speaker Cases noch abfängt.

→ **Wir wissen noch nicht empirisch, ob v82 die 148 `coords-pro`-Failures wirklich schluckt.** Code-Pfade sehen sauber aus, aber die Phase-2-These ist noch nicht in Produktion bewiesen.

---

### 5. Bekannte Restrisiken

1. **Live-Validation fehlt:** Keine `bbox-url-pro`-Dispatches in den Logs. Wir müssen entweder warten bis ein Dialog mit ≥2 Sprechern + resolved Identity läuft, oder gezielt einen Test-Run anstoßen.
2. **`coords-pro-box`-Failure-Rate liegt bei ~50 %.** Solange `bbox-url-pro` greift, ist das nur noch ein Fallback-Step — falls aber das Identity-Mapping fehlschlägt, fallen wir auf eine Variante mit historisch schlechter Quote.
3. **Identity-Map-Auflösung:** `plateIdentityMap.resolvedCount > 0` ist die Gating-Bedingung. Wenn die Plate-Face-Detection (v77) für N≥2 keine stabile Map liefert, downgraden wir sofort auf Legacy. Keine Metrik trackt heute, wie oft das passiert.
4. **HDR/4K-Edge-Case** weiterhin ungelöst (per Doku akzeptiert).

---

### 6. Empfehlung für die nächsten Schritte

**Empfehlung: keine neuen Phasen jetzt — erst validieren.**

In der Reihenfolge:

1. **Telemetrie-Hardening (klein, ~1 Datei):**
   - In `compose-dialog-segments` beim Gate-Check ein strukturiertes Log `[v82-gate]` mit `{speakers, plateDims:bool, resolvedCount, hasPreclip}` schreiben.
   - In `syncso_dispatch_log.meta` `retry_variant` immer mitschreiben (heute nur teilweise im `mode`/`coords` gesetzt).
   → Damit sehen wir, **warum** `bbox-url-pro` (nicht) feuert und können die Fail-Rate per Variante messen.

2. **Gezielter Live-Test (manuell):** Eine bekannte Multi-Speaker-Szene im Composer re-rendern und in den Logs verifizieren:
   - `[v82-gate] picked=bbox-url-pro`
   - `bounding_boxes_url` ist im `composer-frames`-Bucket erreichbar (HTTP 200)
   - Webhook-Outcome = success ohne Fallback-Stepping

3. **Erst dann Phase 3 oder neue Features.** Wenn (1)+(2) grün sind und die `coords-pro`-Failure-Rate über 7 Tage sichtbar fällt, ist Phase 2 wirklich abgeschlossen.

**Falls bei der Live-Validierung Probleme auftauchen, plausible Ursachen (vorab):**
- `plateIdentityMap.resolvedCount` bleibt 0 → v77 plate-face-detection genauer ansehen.
- `composer-frames`-URL ist privat / nicht öffentlich lesbar → Bucket-Policy prüfen.
- Box-Koordinaten in falschem Koordinatenraum (plate-space vs. clip-space) → Re-Scale-Logik in `uploadBoundingBoxesJson()` reviewen.

---

### Fazit

**Code-seitig ist Phase 2 vollständig und Sync.so-3-konform.** Retry-Ladder, Framing-Locker, lipsync-2-pro-Escape — alles drin. **Empirisch fehlt der Proof, dass `bbox-url-pro` die Multi-Speaker-Failures wirklich eliminiert.** Bevor wir auf Phase 3 gehen, sollten wir 1–2 kleine Telemetrie-Logs einbauen und einen Multi-Speaker-Live-Test fahren. Soll ich das als Mini-Phase 2.5 (Telemetrie + Validation) umsetzen?
