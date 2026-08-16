# C1 — Lip-Sync Intent: UI/DB-Divergenz schließen

Nur die Divergenz zwischen angezeigtem Toggle und persistiertem Intent. G3.2.2, RS3, Ledger, Sync-Callbacks/Finalizer, Provider-Routing, Continuity und die Gate-Semantik selbst bleiben unberührt.

## Befund (aus dem Code verifiziert)

Nachweise aus `VideoComposerDashboard.tsx`, `lipSyncPending.ts`, `lipSyncIntent.ts`:

1. Der Composer-State wird beim Mount **zuerst aus dem localStorage-Draft** gebaut (`loadDraft()`), inklusive `lipSyncWithVoiceover`. Die DB-Hydration läuft erst danach asynchron.
2. `useEffect(() => saveDraft(project), [project])` schreibt **jede** lokale State-Änderung in den Draft — auch rein optimistische Writes, die nie in die DB gehen (`SceneDialogStudio`, `SceneClipProgress`, `FaceMapReviewDialog`, `useSceneGenerate` setzen `lipSyncWithVoiceover: true`).
3. Die DB-Hydration steigt **still aus**, wenn `data.length === 0` oder ein Fehler auftritt (`catch → console.warn`), und läuft pro `project.id` nur einmal (`lastSyncedProjectIdRef`). In diesen Fällen bleibt der Draft-Wert stehen.
4. Es gibt **kein Dirty-Tracking für Booleans**. `markDirty`/`isDirty` decken nur Textfelder ab; für Lip-Sync existiert nur die In-Memory-Registry `lipSyncPending` (8 s TTL), die einen Reload nicht überlebt und heute auch rein lokale Optimistic-Writes repräsentieren kann.
5. Der Draft trägt **keine Scene-Revision und keinen Zeitstempel** — beim Laden ist nicht entscheidbar, ob er älter ist als die DB-Zeile.
6. Render-Gates lesen den persistierten Intent (`isLipSyncIntentionalRow` auf der DB-Zeile), die UI den Draft-Wert. Genau daraus entsteht "UI=AN, Start still blockiert".

## Zielvertrag (inkl. C1-Zusatz-Contract)

1. **Tri-State statt Boolean in der UI.** Der angezeigte Intent kennt `resolved:true`, `resolved:false`, `unresolved`. Solange die Szene nicht erfolgreich aus der DB hydratisiert wurde (Fehler, kein Zeilentreffer, noch laufende Hydration), ist der Intent `unresolved`: Toggle disabled mit sichtbarem "wird geladen", Renderstart fail-closed. Es wird **kein** OFF vorgetäuscht.
2. **Dirty-Marker sind reine Write-Recovery-Metadaten**, keine zweite Source of Truth. Form: `{ sceneId, field, desiredValue, mutationId, setAt }`. Nach **jeder** erfolgreichen Hydration wird reconciled:
   - DB == `desiredValue` → Write bestätigt, Marker löschen, DB gewinnt.
   - DB != `desiredValue` und Mutation `mutationId` nachweislich noch in-flight (In-Memory-Registry dieser Session) → Pending/"ungespeichert" anzeigen.
   - DB != `desiredValue` und kein aktiver Write → **DB gewinnt**, Marker löschen, Hinweis "Änderung konnte nicht gespeichert werden".
   Eine TTL läuft zusätzlich mit, ist aber nie der Wahrheitsbeweis.
3. **Bestätigung durch die DB.** Ein User-Intent-Write gilt erst als bestätigt, wenn der geschriebene Wert aus der DB zurückgelesen wurde (`update … .select()` bzw. Reconcile beim nächsten Hydrate). Bei Fehler: Rollback + Refetch/Reconcile + sichtbarer Fehler, keine dauerhafte optimistische Anzeige.
4. **`lipSyncPending`-Registry wird eingegrenzt**: Sie darf für die drei Intent-Felder nur einen real in-flight DB-Write repräsentieren (Setzen unmittelbar vor dem Write, Löschen bei Bestätigung/Fehler). Rein lokale Optimistic-Writes ohne DB-Write dürfen sie nicht mehr füllen.
5. `isLipSyncIntentional()` bleibt unverändert; kein "UI=true ⇒ Intent=true".

## Writer-Audit — vollständig (Call-Sites geprüft)

Klassen: **U** = explizite Benutzerentscheidung → `persistIntentWrite`; **D** = derived/automatisch/Plan → kein persistenter Marker; **R** = reine Request-Payload an die Edge-Function (kein Scene-State-Write); **P** = Persistenz-/Reset-Infrastruktur (kein User-Edit, muss Marker respektieren bzw. löschen).

| Ort | Feld(er) | Klasse |
| --- | --- | --- |
| `SceneCard.tsx` ~2804 (Lip-Sync AN/AUS) | alle drei | U |
| `SceneCard.tsx` ~542 (Dialog & Lip-Sync Switch) | `dialogMode` (+ Mirror) | U |
| `SceneCard.tsx` ~1204 (Engine-Picker Select) | `engineOverride` | U |
| `SceneCard.tsx` ~1055 (Re-Roll) / ~2496 (Anchor-Preview-Gate) | `engineOverride` | **R** — `cinematic-sync` steht nur im `compose`-Payload von `startSceneGeneration` / `AnchorPreviewGate`; es gibt keinen `onUpdate`- und keinen DB-Write auf `engine_override`. Kein Marker. |
| `SceneAvatarMode.tsx` ~358 (Talking-Head Switch) | `lipSyncWithVoiceover` | U |
| `ClipsTab.tsx` ~955 (`handleStartCinematicSync`) | `engineOverride` | **U** — expliziter Klick, optimistischer Local-Patch + eigener Single-Row-DB-Write auf `engine_override`. Läuft künftig über `persistIntentWrite` (Pending/Bestätigung/Rollback). |
| `ClipsTab.tsx` ~1034 | `engineOverride` | **R** — nur `compose`-Payload derselben Aktion. |
| `ClipsTab.tsx` ~407 / ~694 / ~810 / ~888 | `engineOverride` | D (Spiegelung DB→lokal bzw. Payload-Defaults) |
| `SceneDialogStudio.tsx` ~1780/1829 | alle drei | D |
| `SceneClipProgress.tsx` ~170 | alle drei | D |
| `FaceMapReviewDialog.tsx` ~222 | alle drei | D |
| `useSceneGenerate.ts` ~141/151/197 | alle drei | D (schreibt DB selbst) |
| `useApplyProductionPlan.ts`, `useApplyBriefingManifest.ts`, `spawnCoverageScenes.ts` | `engineOverride`/`dialogMode` | D (Plan-Apply, schreibt DB) |
| `useComposerPersistence.ts`, `VideoComposerDashboard.persistScenesToDb` / `addSceneToProject` | snake-Writes | P — nie User-Edit, dürfen `unresolved` nie als Wert schreiben |
| `lipSyncResetFlow.ts` | alle drei | P — schreibt DB und löscht Marker |

Damit ist die Tabelle vollständig; offene Einträge gibt es nicht mehr. Jeder U-Writer läuft über **einen** gemeinsamen Helper (Mark → DB-Write → Bestätigung → Clear/Rollback).

## Scene-Herkunft & Persistenz-Lifecycle (ersetzt die UUID-Heuristik)

Repo-Nachweis (nur als Assert/Test, **nicht** als Source of Truth): alle client-seitig erzeugten Szenen bekommen präfixierte, nie UUID-förmige IDs — `useSceneManager.ts:9`, `StoryboardTab.tsx:256/292`, `VideoComposerDashboard.addSceneToProject` (`scene_${Date.now()}`), `useApplyProductionPlan.newSceneId()`. `crypto.randomUUID()` wird im Composer nur für Turn-IDs und Storage-Pfade benutzt.

Autoritativ ist ein expliziter Herkunfts-Status pro Szene, im Draft mitgeführt:

`scenePersistenceState = local_new | db_known_unhydrated | db_hydrated`

| Zustand | Herkunft | Intent-Auflösung |
| --- | --- | --- |
| `local_new` | im Client erzeugt, nie erfolgreich in die DB inserted | **resolved** aus dem lokalen Wert — es existiert keine DB-Wahrheit, die verletzt werden könnte; Controls normal bedienbar |
| `db_known_unhydrated` | Szene stammt aus einem früheren DB-Load (Draft-Eintrag) oder aus einem bestätigten Insert, wurde in dieser Session aber noch nicht erfolgreich hydratisiert | **unresolved** — Controls disabled/"wird geladen", Renderstart fail-closed |
| `db_hydrated` | in dieser Session erfolgreich aus der DB geladen | **resolved** aus dem DB-Wert nach `reconcileIntentMarkers` |

Übergänge: bestätigter Insert (`addSceneToProject`, `ensureProjectPersisted`, Plan-Apply) → `local_new → db_hydrated` (der Insert-Wert ist der DB-Wert). Draft-Persistierung eines `db_hydrated`-Scene → beim nächsten Mount `db_known_unhydrated`, bis die Hydration greift. Hydration-Fehler oder fehlende Zeile → bleibt `db_known_unhydrated`.

Ein `hydratedSceneIds`-Set ist dabei nur die Laufzeit-Repräsentation von `db_hydrated`; die Unterscheidung "noch nie persistiert" vs. "persistiert, aber noch nicht hydratisiert" trägt ausschließlich `scenePersistenceState`.

## Legacy-Draft-Vertrag (Drafts aus der Zeit vor C1)

Bestehende `localStorage`-Drafts enthalten kein `scenePersistenceState`. Ein fehlender Status darf **niemals** als `local_new` interpretiert werden — sonst bliebe genau der Ursprungsbug (alter DB-backed Draft mit stale `lipSyncWithVoiceover=true`) beim ersten Reload nach dem Deployment bestehen.

Regeln:

- Der Draft bekommt eine `draftSchemaVersion`. Drafts ohne diese Version laufen einmalig durch `migrateLegacyDraft()` beim Laden; danach wird die migrierte Fassung mit Version geschrieben.
- `migrateLegacyDraft()` vergibt pro Szene:
  - DB-Herkunft belegbar (Szene besitzt DB-Marker wie `project_id`-Bindung / gespeicherte `created_at`/`updated_at` aus dem Load, oder — einmalig und rein kompatibilitätshalber — eine UUID-förmige ID) → `db_known_unhydrated`.
  - Herkunft nicht belegbar → ebenfalls `db_known_unhydrated` (konservativ: lieber `unresolved` bis zur Hydration als stale Intent als kanonisch anzuzeigen). Es gibt in der Migration **keinen** Pfad nach `local_new`.
- Die drei Intent-Felder werden für migrierte Szenen aus dem Draft verworfen; sie kommen ausschließlich aus der Hydration.
- Die `scene_…`-/UUID-Form ist ausschließlich in dieser einmaligen Migration erlaubt und wird **nicht** Teil des laufenden Resolver-Vertrags; der Laufzeitvertrag bleibt rein statusbasiert.
- Nur in dieser C1-Version neu erzeugte Szenen werden explizit mit `scenePersistenceState: 'local_new'` angelegt (`useSceneManager`, `StoryboardTab`, `addSceneToProject`, `useApplyProductionPlan`). Nach bestätigtem DB-Insert → sofort `db_hydrated`; beim nächsten gespeicherten Draft/Mount → `db_known_unhydrated`.
- **Idempotenz:** `migrateLegacyDraft()` ist ein reiner No-op für bereits versionierte C1-Drafts und klassifiziert eine Szene mit explizitem `scenePersistenceState` (inkl. `local_new`) niemals um. Mehrfaches Ausführen ändert nichts.
- **Insert-Bestätigung:** `db_hydrated` wird erst nach bestätigtem DB-Write gesetzt (kein optimistischer Übergang). Schlägt der Insert fehl, bleibt die Szene `local_new` mit ihrem lokalen Intent.




## Umsetzung

**1. Neues Modul `src/lib/video-composer/lipSyncIntentDraft.ts`**
- Persistente Marker (`{ sceneId, field, desiredValue, mutationId, setAt }`, account-scoped über `local-draft-scope`) + In-Memory-Inflight-Registry.
- `reconcileIntentMarkers(sceneId, dbRow)` nach jeder erfolgreichen Hydration gemäß Zusatz-Contract Punkt 2.
- `resolveIntentField(sceneId, field, dbValue | UNRESOLVED)` liefert `{ state: 'resolved'|'unresolved', value, pending }`.
- `persistIntentWrite(...)` als gemeinsamer U-Writer-Helper.

**2. Hydration (`VideoComposerDashboard.tsx`)**
- Beim Aufbau aus `loadDraft()` wird pro Szene `scenePersistenceState` gesetzt: Szenen mit gespeicherter DB-Herkunft → `db_known_unhydrated` (Intent-Felder werden verworfen, Zustand `unresolved`); Szenen ohne DB-Herkunft → `local_new` (lokaler Intent bleibt gültig und resolved).
- Mount-Hydration (~372/441/443) und Refetch (~562/631/633) rufen `reconcileIntentMarkers` und setzen die Szene auf `db_hydrated`.
- Bestätigter Insert (`addSceneToProject`, `ensureProjectPersisted`, Plan-Apply) setzt `local_new → db_hydrated` mit dem eingefügten Wert als DB-Wahrheit.
- Hydration-Fehler / kein Zeilentreffer → Szene bleibt `db_known_unhydrated` → `unresolved`. Kein ID-Format entscheidet; die belegte `scene_`-Präfix-Form dient nur als Assert im Test.



**3. UI**
- Toggle/Switch/Engine-Picker rendern drei Zustände: AN, AUS, "wird geladen" (disabled) sowie ein "ungespeichert"-Badge bei aktivem Marker.
- Renderstart-Preflight: `unresolved` blockiert mit klarer Meldung statt stillem No-Op (Gate-Semantik selbst unverändert).
- Fehlgeschlagener Write: Rollback + sichtbarer Toast statt nur `console.warn`.

**4. Persistenzpfade**
- `persistScenesToDb` und `useComposerPersistence` schreiben die drei Felder nur aus bestätigtem/aktivem Intent, nie aus einem `unresolved`-Platzhalter.

## Tests (Vitest, `src/lib/video-composer/__tests__/`)

- DB=false + alter Draft=true (kein Marker) → UI=false.
- DB=true + alter Draft=false (kein Marker) → UI=true.
- **DB=true + Hydration schlägt fehl → UI `unresolved`, nicht OFF; Renderstart fail-closed.**
- Frischer dirty Edit false→true → UI=true (pending), nach Bestätigung Marker gelöscht, DB=true.
- **Write erfolgreich, Tab stirbt vor Clear → Reload sieht DB == desiredValue → Marker wird entfernt, DB gewinnt.**
- **Verwaister Marker (kein in-flight Write) mit DB-Gegenwert → DB gewinnt, Marker weg, Hinweis "nicht gespeichert".**
- Persistierungsfehler → Rollback, keine dauerhafte ON-Anzeige, Fehler sichtbar.
- Reload nach gespeichertem ON → UI/DB/Intent alle true.
- Persistiert OFF + alter Draft true → `isLipSyncIntentional()` false.
- **`dialogMode` und `engineOverride` durchlaufen denselben User-Writer-Vertrag (je ein Fall pro Feld), inkl. `ClipsTab.handleStartCinematicSync`.**
- **`engineOverride = null` als legitimer persistierter Wert wird getrennt von `UNRESOLVED` getestet — der Resolver darf `null` nie als "noch nicht hydratisiert" behandeln.**
- **`local_new`-Szene (nie persistiert) → lokaler Intent bleibt resolved und bedienbar; nach bestätigtem Insert `db_hydrated` mit demselben Wert.**
- **`db_known_unhydrated` vs. `local_new`: identischer Draft-Inhalt, nur unterschiedlicher Herkunfts-Status → einmal `unresolved`, einmal resolved.**
- **Legacy-Draft (kein `scenePersistenceState`), DB-backed Szene, stale `lipSync=true` → nach Migration `db_known_unhydrated` → zunächst `unresolved`; nach Hydration gewinnt der DB-Wert (false).**
- **Neu in C1 erzeugte lokale Szene → explizit `local_new`, lokaler Intent bleibt resolved; wird von der Legacy-Migration nicht angefasst und nicht mit einem Legacy-Draft verwechselt.**
- **`migrateLegacyDraft()` doppelt ausgeführt → identisches Ergebnis; ein explizit gesetztes `local_new` wird nicht zu `db_known_unhydrated` umklassifiziert.**
- **Insert schlägt fehl → Szene bleibt `local_new` (kein `db_hydrated`), lokaler Intent bleibt bedienbar.**
- Regressionsschutz: andere Draft-Felder behalten ihr heutiges Merge-Verhalten.

## Abschluss

Writer-Audit-Tabelle, Root Cause, minimaler Fix und Testergebnisse in `docs/v432-c1-lipsync-intent-divergence.md`. Danach STOP für Review — danach Motion-Studio-Final-Acceptance, keine weitere Architekturbaustelle.
