# G0 — Antwort auf die vier offenen Punkte (verifiziert an Code + Datenbank)

Alle vier Punkte sind geprüft. Wichtiger Hinweis zum Stand: Die G0-Migrationen
M1/M2 sind bereits in der Datenbank aktiv (`composer_scene_transition_core`,
`composer_scene_transition_v2`, `composer_recover_scene`, Audit-/Regeltabellen),
und die TypeScript-Fassade sowie die Cancel-Pfade sind umgestellt. Die Antworten
unten sind daher keine Absichtserklärungen, sondern Befunde am aktuellen Stand.

## 1. Der fehlende Caller — Inventar ist jetzt vollständig

Tatsächlich existieren **12** Aufrufstellen in 5 Dateien, nicht 11. Die alte
Zählung hat `composer-cancel-project` mit nur einem statt zwei Aufrufen geführt.

| Datei | Stellen | Klassifikation |
|---|---|---|
| `composer-start-scene-generation/index.ts` (200, 255) | 2 | run_bound |
| `generate-composer-image-scene/index.ts` (147, 168, 195, 222, 241) | 5 | legitim runless (`image_scene_no_run_context`) |
| `composer-cancel-scene/index.ts` (152, 160) | 2 | run_bound bzw. runless (`user_cancel_no_active_run`) — bereits auf `transitionSceneV2` migriert |
| `composer-cancel-project/index.ts` (220, 228) | 2 | run_bound bzw. runless (`project_teardown_no_active_run`) — bereits migriert |
| `hybrid-extend-scene/index.ts` (375) | 1 | **Vertragslücke**, dokumentierte Debt: `failed` ohne jeden Run-/Generation-Guard, läuft heute über den Legacy-7er-Wrapper und damit über `system_migration` |

Ergebnis: kein unbekannter zwölfter Caller. Die einzige echte Lücke bleibt
`hybrid-extend-scene`. Sie wird in G0 nur als Debt markiert; der echte
Run-Kontext (`run_bound`) kommt wie ursprünglich vereinbart in **G2**, nicht in
G1 — es ist ein Provider-/Render-Lauf und gehört fachlich zu Audio/Dispatch/Run,
während G1 klein und risikoarm bei den Terminal-/Cancel-Writern bleibt.

## 2. 6er- und 7er-Signatur sind beide erhalten geblieben

Geprüft in `pg_proc`: Beide alten öffentlichen Signaturen existieren weiter und
sind **nicht** ersetzt worden. Beide sind reine Compatibility-Fassaden, die
unverändert an das interne Core-Primitive delegieren und dabei
`source_signature = legacy_6 | legacy_7`, `caller_class = legacy` fest
mitgeben — der Aufrufer kann das nicht fälschen.

- `composer_scene_transition/6` und `/7`: EXECUTE für `authenticated` und
  `service_role` (unverändert erreichbar für unbekannte externe Caller), `anon`
  wurde entzogen.
- `composer_scene_transition_v2/14` und `composer_recover_scene/6`: nur
  `service_role`.
- `composer_scene_transition_core/16`: keine Rolle außer `postgres` — nicht von
  außen erreichbar.

Kein Drop in G0. Beide Legacy-Fassaden schreiben jede Nutzung ins
`composer_scene_transition_log`, sodass das Beobachtungsfenster bis G6 belastbare
Zahlen liefert.

## 3. Der v391-Gap-Filler ist ersetzt, nicht nur entschärft

Der mehrstufige Client-Loop existiert nicht mehr. Die Pfadüberbrückung liegt jetzt
im Core: unter derselben `FOR UPDATE`-Row-Lock-Transaktion sucht ein
`WITH RECURSIVE`-Pfadsuch-CTE den erlaubten Pfad in
`composer_scene_transitions`, und der finale Zustand wird in **einem** UPDATE
geschrieben. Es sind keine zusätzlichen direkten Kanten freigegeben worden.
Jede traversierte Kante wird als eigene Audit-Zeile protokolliert, der DB-Zustand
zeigt aber nur den Endzustand.

Dazu passt der bereits grüne G0.4-Trigger-Audit: Es existiert kein produktiver
Side-Effect, der auf Zwischenzustände wie `audio_prep`, `audio_ready` oder
`lipsync_dispatched` als tatsächliches UPDATE angewiesen ist. Der atomare Pfad
verändert also keine bestehende Semantik.

## 4. Semantik von `pipeline_state_run_id` ist explizit

Im Core steht sie als eine Zuweisung, nicht als Nebeneffekt:

```text
pipeline_state_run_id = CASE WHEN guard_mode = 'run_bound' THEN run_id ELSE NULL END
```

- `run_bound`: `pipeline_state_run_id = _run_id`, vorher geprüft gegen
  `active_run_id` und `plate_generation` unter Row Lock.
- `runless`: `pipeline_state_run_id = NULL` — der Zustand gehört bewusst zu keinem
  Lauf mehr. Zusätzlich prüft `runless` die Kanten-Allowlist
  `composer_runless_transition_rules` und einen Grund aus der erlaubten Liste;
  `system_migration` ist ausschließlich den Legacy-Wrappern vorbehalten.

## Was für G0 noch offen ist — der funktionale DB-Smoke

Einziges verbleibendes Abschluss-Gate. Der Test
(`/mnt/documents/g0-smoke-test.sql`) konnte in der Sandbox nicht laufen, weil die
Sandbox-Rolle nicht in `auth.users` schreiben darf.

**Autorisierungskontext:** `SET LOCAL ROLE service_role` allein genügt nicht — der
Core erkennt Privilegierung über den JWT-Claim, nicht über `current_user`. Der
Smoke muss denselben Claim-Pfad setzen, den die Funktion liest:

```sql
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
-- falls der Core zusätzlich den flachen Pfad liest:
SELECT set_config('request.jwt.claim.role', 'service_role', true);
-- Fixtures + Assertions
ROLLBACK;
```

Vor dem Lauf wird die im Core tatsächlich implementierte Claim-Quelle aus der
Funktionsdefinition gelesen und der Test exakt darauf gebaut.

**Vier Pflicht-Assertions:**

1. **Stale Run** — Guard erwartet Run A, aktiv ist Run B: kein State-Write, Szene
   unverändert, Ablehnung im Audit.
2. **Runless-Allowlist** — gelistete Kante mit erlaubtem Grund geht durch; eine
   state-machine-legale, aber nicht in `composer_runless_transition_rules`
   gelistete Kante wird abgewiesen.
3. **Gap-Pfad** — `plate_ready → lipsync_running`: genau **ein** UPDATE auf
   `composer_scenes`, **exakt vier** Zeilen in `composer_scene_transition_log`,
   finaler State `lipsync_running`.
4. **Recovery** — `orphaned_run` bei `active_run_id IS NULL` greift; taucht ein
   Run wieder auf, ergibt sich `run_reappeared` ohne Write.

Alles in einer Rollback-Transaktion gegen isolierte Testdaten. Ergebnis kommt als
kurzer PASS/FAIL-Bericht pro Assertion, danach STOP — G1 erst nach grünem Smoke.

---

# Cast & World — wie es heute verdrahtet ist

**Kanonische Tabellen (`brand_*`):** `brand_characters` (Cast),
`brand_locations`, `brand_buildings`, `brand_props` (World). Dazu
`character_purchases` für zugekaufte Marketplace-Charaktere sowie
Varianten-Tabellen (`avatar_outfit_looks`, `avatar_pose_variants`,
`location_vibe_variants`, `location_prop_variants`).

**Lese-Kette:**

```text
brand_characters ─┐
character_purchases ─┴─> useAccessibleCharacters  (owned + purchased, dedupe nach Name)
                                  │
brand_locations/buildings/props ──┼─> useUnifiedMentionLibrary  (Adapter auf MotionStudio-Form)
motion_studio_characters/locations┘        │
                                           ├─> PromptMentionEditor / @-Mentions
                                           ├─> Composer: CharacterCastPicker, UnifiedAssetPicker
                                           └─> AI Video Studio: ToolkitCastWorldPicker
```

**Schreib-Kette:** Writes gehen weiterhin an die jeweilige Library-Seite
(`/library`, `AvatarDetail`), nicht über die Mention-Library.

**ID-Vertrag:** UUID-first. `resolveCharacterId` / `canonicalCastId` /
`mentionToCastRef` normalisieren `outfit:`-, `catalog:`-, `lib:`-Prefixe auf
`brand_characters.id`; `MOTION_STUDIO_STRICT_IDS` ist an, Name-Matching als
Fallback ist deaktiviert. Ins Render gehen `SceneAssetRef[]`
(`{type, id, variantId, role, displayName}`) über `buildSceneAssetsForRender`.

**Die verbleibende Doppelquelle:** `useUnifiedMentionLibrary` mischt weiterhin die
Legacy-Tabellen `motion_studio_characters` / `motion_studio_locations` dazu,
dedupliziert nach Kleinschreibung des Namens, Brand gewinnt. Das ist der einzige
Ort, an dem Nicht-`brand_*`-Daten noch in die Pipeline kommen — und damit der
Angriffspunkt für den separaten CW1-Track (eine kanonische Bibliothek,
langfristig nur `brand_*`). CW1 bleibt bewusst außerhalb von v431.
