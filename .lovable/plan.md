# Tiefenanalyse: v400-Rückbau vs. Verallgemeinerung — und wann "gut genug" gilt

## Kurzantwort

Ein Rückbau auf v400 ist **nicht möglich**, weil v400 als lauffähiger Stand nicht mehr
existiert — zentrale Bausteine des Dokuments sind seit dem Rollback vom 27.07.2026
gelöscht oder ersetzt. Und er wäre auch kein Fortschritt: die Pipeline ist heute
messbar **nicht** kaputt, sondern selektiv fragil. Der richtige Schritt ist keine
Rückkehr und keine weitere Verallgemeinerung, sondern **Reduktion der Gate-Anzahl vor
dem Provider-Call**.

## Was die Daten sagen (gemessen, nicht geschätzt)

Letzte 30 Tage, Szenen mit Dialog-Turns, `lip_sync_status`:

| Sprecher | done | failed | canceled |
| --- | --- | --- | --- |
| 1 | 48 | 13 | 3 |
| 2 | 3 | 3 | 0 |
| 3+ | 44 | 10 | 6 |

Also rund **81 % Erfolg bei 3+ Sprechern** — das ist besser als das Bauchgefühl.
Bestätigte jüngste Vollerfolge: `be60d106` (6 Turns, alle 6 Pässe `done`),
`ecb95d2b` (4 Turns, alle 4 Pässe `done`). Die schwächste Klasse ist ausgerechnet
**2 Sprecher** (3:3) — genau die Klasse, die als einzige weder in den alten
Einzelsprecher-Pfad noch in die neue 3+-Identitätskette fällt.

Die letzten beiden echten Fehler:
- `7aa7fc93`: Pass 0 `done`, Pass 1 `failed`, Pässe 2–3 hängen in
  `rendering_preflight` → `dynamic_mouth_crop_infeasible`
- `67b392b1`: `face_repair_identity_unresolved_pass_5`

Beides sind **Vorab-Abbrüche vor dem Provider**, keine schlechten Lip-Sync-Ergebnisse.

## Warum "zurück auf v400" nicht geht

Die Vollspezifikation im PDF beschreibt einen Zustand, der teils nur noch Erzählung ist:

| v400-Punkt | Realität heute |
| --- | --- |
| T12 Passthrough-Verdict, `unknown` blockiert | `mouth-motion-verdict.ts` ist seit 27.07.2026 gelöscht; es gibt kein Verdict-Gate mehr, nur Telemetrie |
| Mund bei 62 % Höhe | Kein fester Faktor im Code; `computeMouthCenteredCrop` nutzt gesichtsproportionale Marge. Der Golden Run `c934a823` lag bei 0.571–0.612 |
| Plate ≥ 1080p | Hailuo-10s bleibt 768p (`hiResAllowed: duration !== 10`) |
| Face-Share 0.24 nur Mehrsprecher | v461 erzwingt 0.24 / 144 px **unabhängig** von der Sprecherzahl |

Ein "Rückbau" wäre also ein Neubau nach einem Dokument, das den eigenen Referenzlauf
durchgefallen ließe. Die vier v400-**Verträge** dagegen (Run-Identität,
Anchor-Kohärenz, Assignment-Lock, Run-Guard) sind intakt und bleiben unangetastet.

## Die eigentliche Ursache: Gate-Inflation

Zwischen Preclip und Provider-Call liegen heute je nach Sprecherzahl geschätzt
**3–5 (1 Sprecher), 6–8 (2), 10–13 (3+)** eigenständige fail-closed Ausstiege.
Neu gegenüber v400 sind mindestens sechs:

| Gate | Sprecherabhängig? |
| --- | --- |
| v461 Face-Gate (0.24 / 144 px / Mund-ROI) | nein |
| v536 `dynamic_mouth_crop_infeasible` | nein |
| v464 ASD-Projektionsvertrag | nein |
| v506 Anker-Identitäts-Gate | nur `compose-video-clips` |
| v523/524/526/530 Identitätskette | ja, `speakers.length >= 3` |
| v538-Downgrade (lockert v523) | ja, `>= 3` |

Jedes Gate ist einzeln begründet. Zusammen multiplizieren sich ihre Falsch-Positiv-Raten:
bei 6 Pässen genügt **ein** Gate mit 3 % Falsch-Positiv-Rate für ~17 % Szenenausfall.
Genau das ist das Muster der letzten Wochen — Szenen sterben an *einem* Pass, nicht am
Provider.

## Vorschlag: V541 — Gate-Konsolidierung statt neuer Features

Kein Unfreeze der Kette. Drei begrenzte Schritte, jeder einzeln abnehmbar:

**Schritt 1 — Gate-Autopsie (read-only, kein Codeeingriff)**
Für die letzten 20 Läufe pro Pass protokollieren: welches Gate hat abgebrochen, mit
welchen Messwerten, und wäre der Pass ohne dieses Gate durchgelaufen. Ziel ist eine
Rangliste "Falsch-Positive pro Gate". Ohne diese Liste ist jede Lockerung geraten.

**Schritt 2 — Die zwei teuersten Gates entschärfen (nicht löschen)**
Aktuell aussichtsreichste Kandidaten, endgültig entschieden durch Schritt 1:
- `v536_mouth_crop_infeasible` mit `face=n/a`, `band=n/a`, `[NaN,NaN]` ist ein
  Messartefakt, kein Geometriebeweis. Bei fehlender Messung → einmalige Neumessung
  statt Abbruch; nur bei *bewiesen* unmöglicher Geometrie fail-closed.
- `face_repair_identity_unresolved`: bei saturierter, eindeutiger Besetzung greift die
  V534-Ausschluss-Logik; die verbleibende Lücke ist der 3+-Pfad ohne V534.

**Schritt 3 — Die 2-Sprecher-Lücke schließen**
2 Sprecher sind die schlechteste Klasse, weil `speakers.length >= 3` sie von der
Identitätskette ausschließt, die v400-Positionslogik bei zwei Gesichtern aber die
höchste Verwechslungsgefahr hat. Schwelle auf `>= 2` senken — das ist die einzige
sinnvolle "Verallgemeinerung", und sie betrifft genau 6 Läufe im Datensatz.

**Nicht Teil davon:** neue Provider, neue Schwellenwerte, Retry-Mechanismen,
Änderungen an Maske, Kamerapfad, Mux, Refunds oder Watchdog.

## Zur Frage "wann ist es gut genug"

Ein belastbares Abbruchkriterium statt Bauchgefühl:

> **Ziel: 90 % Szenenerfolg über 20 aufeinanderfolgende Läufe, alle Sprecherzahlen.**
> Wird das erreicht, wird die Pipeline eingefroren und nur noch bei P0-Fehlern angefasst.

Heute: ~81 % bei 3+, ~75 % bei 1, 50 % bei 2. Der Abstand zum Ziel ist ein bis zwei
Gates — keine vier weiteren Monate. Wenn Schritt 1 zeigt, dass kein einzelnes Gate
dominiert, ist das ebenfalls eine Antwort: dann ist der aktuelle Stand das Optimum und
der ehrliche Umgang damit ist ein sichtbarer "Lip-Sync (Beta)"-Hinweis plus
verlässlicher Refund — nicht eine weitere Iteration.

## Technische Details

- Belege: `composer_scenes.lip_sync_status` / `dialog_shots.passes` (Abfragen oben),
  `_shared/v461-face-gate.ts:39,41`, `_shared/mouth-crop-feasibility.ts:206-304`,
  `compose-dialog-segments/index.ts:4785` (`v523NeedsIdentity`), `:8539-8621` (v464),
  `_shared/v538-plate-resolution.ts:30,74`, `docs/lipsync-pipeline-v400-errata.md:19-21`.
- `docs/lipsync-pipeline-v400-errata.md` ist gegenüber v461 veraltet (Face-Share-Scope)
  und sollte im selben Gate korrigiert werden.
- Schritt 1 ist rein lesend und erzeugt `docs/v541-gate-autopsy.md`.
