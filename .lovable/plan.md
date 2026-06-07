## Was passiert (Diagnose)

Beim Anlegen einer neuen Szene im Storyboard wird sie **mit einem temporären Client-ID lokal eingefügt** und parallel sofort in `composer_scenes` geschrieben. Beim Generieren wird vor dem Render `ensureProjectPersisted` aufgerufen — dieser Schritt nummeriert die `order_index` aller Szenen neu, indem er sie kurz auf negative Werte schiebt (Phase A) und dann wieder in die richtigen Slots schreibt (Phase B). Während dieses Fensters läuft die Realtime-Subscription mit und macht laufend `refetchScenesFromDb`.

Zwei konkrete Bugs greifen ineinander und sorgen für „Szene 2 wird durch Szene 3 ersetzt":

### Bug 1 — `addSceneToProject` schreibt jede neue Szene mit `order_index: 0`
`src/components/video-composer/VideoComposerDashboard.tsx`, Zeile 980:
```
order_index: baseScene.orderIndex,   // baseScene ist {...DEFAULTS, ...partial} mit Default orderIndex: 0
```
Lokal wird korrekt `prev.scenes.length` gesetzt (Zeile 972), aber der DB-INSERT verwendet die unverarbeitete `baseScene.orderIndex` = `0`. Folge: Jeder neue Szene-INSERT kollidiert mit `UNIQUE(project_id, order_index)` und schlägt still fehl (nur `console.warn` Zeile 1022). Die neue Szene lebt nur lokal mit Temp-ID weiter.

### Bug 2 — `refetchScenesFromDb` reindiziert nach Array-Position, nicht nach DB-`order_index`
`VideoComposerDashboard.tsx`, Zeilen 540–541:
```
const merged = [...dbScenes, ...localOnly]
  .map((s, i) => ({ ...s, orderIndex: i }));
```
Während Phase A der Persistenz alle Szenen kurz auf negative `order_index` schiebt, liefert ein konkurrierender Refetch die Szenen in chaotischer Reihenfolge (z. B. `[-3, -2, -1, 2]`). Die lokale UI-Reihenfolge wird per Array-Index überschrieben → Szenen rutschen visuell durcheinander.

### Bug 3 — Temp-Szene bleibt nach Persist in `localOnly`
Wenn `ensureProjectPersisted` der Temp-Scene 3 endlich eine UUID gibt, kommt `setProject({..., scenes: result.scenes})` (Zeile 1414). Das ersetzt die Szenen — aber **jeder Realtime-Refetch, der zwischen Phase A und diesem `setProject` feuert**, sieht `localOnly = [Scene3(temp)]` UND `dbScenes = [Scene1, Scene2, Scene3-real]` → temporär 4 Szenen, anschließend räumt der nächste `setProject` Zeile 1414 alle `localOnly` weg — inklusive Edits, die der User in Scene 2 noch nicht gespeichert hatte. Effektiv sieht der User: Scene 2 „wird ersetzt".

## Fix-Plan

### 1. `addSceneToProject` korrekt mit der finalen `order_index` insertieren
- `baseScene.orderIndex` vor dem `insert` auf `prev.scenes.length` setzen (gleichen Wert wie der optimistische `setProject`-Aufruf).
- Bei DB-Fehler **nicht nur warnen**, sondern den lokalen Temp-Scene-Eintrag wieder entfernen oder `clip_status: 'error'` markieren, damit der User es nicht stillschweigend mitschleppt.

### 2. Realtime-Refetch atomar gegen Persistenz machen
- Einen Modul-scope „persisting-lock" einführen (`isPersistingRef`), den `ensureProjectPersisted` während Phase A → Phase B hält.
- `refetchScenesFromDb` skippt den Merge, solange das Lock aktiv ist (oder zumindest, solange irgendeine `order_index` < 0 zurückkommt — ein einfacher Guard: `if (data.some(r => r.order_index < 0)) return;`).

### 3. `refetchScenesFromDb` darf `orderIndex` nicht überschreiben
- `orderIndex` aus DB direkt übernehmen (`row.order_index`) und **nicht** durch Array-Position ersetzen.
- localOnly-Szenen hinten dranhängen mit `orderIndex = max(dbScenes.orderIndex) + n`.

### 4. Persistenz: einzelne, einphasige Reindex-Strategie
- Statt zweiphasigem Negativ-Shuffle: nur Szenen UPDATE-en, deren Ziel-`order_index` sich tatsächlich ändert, in der richtigen Reihenfolge (absteigend wenn Slot belegt). Dadurch entstehen weder negative Werte noch eine Realtime-Tick-Storm.
- Alternativ den ganzen Reindex in einer Transaktion via RPC ausführen (eine einzige Realtime-Notification statt N).

### 5. Defensive Dedup in `refetchScenesFromDb`
- Vor dem `setProject` per `Map<id>` deduplizieren, damit selbst bei Races nie zwei Szenen mit derselben UUID oder Temp-ID parallel existieren.

## Technische Details

**Dateien:**
- `src/components/video-composer/VideoComposerDashboard.tsx` — `addSceneToProject` (940-1022), `refetchScenesFromDb` (446-547)
- `src/hooks/useComposerPersistence.ts` — `ensureProjectPersisted` Phase A/B (166-302)

**Keine Backend-/Edge-Function-Änderungen nötig** — alle Bugs liegen rein im Client-State-Management. Die `compose-video-clips`-Pipeline und Sync.so-Pfade bleiben unangetastet.

**Verifikation:** Manuell reproduzieren — Szene 1, Szene 2, Szene 3 nacheinander erstellen und generieren; in der DevTools-Network-Tab prüfen, dass jeder INSERT in `composer_scenes` einen unterschiedlichen `order_index` bekommt und kein `409 Conflict` / `unique constraint` Fehler auftritt.

## Was bewusst NICHT angefasst wird

- Sync.so-Pipeline, `compose-dialog-segments`, Lip-Sync-Logik
- Engine-Routing (`sync-segments` / `cinematic-sync` / `heygen-talking-head`)
- Audio-Plan-Locking
