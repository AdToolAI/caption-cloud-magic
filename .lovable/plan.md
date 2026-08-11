# Nahtlose Szenenübergänge: was wirklich zählt

## Kurzantwort auf deine Frage

Mehrere Referenzbilder sind für den nahtlosen Schnitt **nicht** der entscheidende Hebel. Zwei Dinge werden oft verwechselt:

- **Nahtloser Übergang (Schnittkante)** = das letzte Bild von Szene N wird zum Startbild von Szene N+1. Dafür braucht ein Modell nur **ein** Bild (i2v / first frame) — das können praktisch alle Modelle im Studio.
- **Konsistenz über die Szene hinweg** (gleiche Person, gleiches Produkt, gleicher Look) = dafür helfen mehrere Referenzbilder.

Stand der Registry heute — Modelle mit mehr als einem Referenzbild:

| Modell | Referenzbilder |
| --- | --- |
| Seedance 2.5 | bis 30 (plus Referenz-Videos) |
| Kling Omni | bis 7 |
| Veo 3.1 lite / fast / pro | bis 3 |
| Runway Gen-4 Aleph | 1 (Video-zu-Video) |
| alle übrigen (Kling 2.5/2.6/3, Wan, Hailuo, Luma, LTX, Grok, Pika, Vidu, HappyHorse, Seedance 1/2.0) | 1 Bild |

Zusätzlich gibt es Modelle mit **Endframe** (Start *und* Ziel setzbar): Luma, LTX Standard, Vidu, Seedance Mini. Das ist für weiche Übergänge sogar präziser als Multi-Ref.

Zu deinem Punkt A: Ja — sobald Lip-Sync auf einer Szene läuft, ist der Clip an die Sync-Plate gebunden, und ein hart verketteter Frame-Übergang ist nicht garantiert. Das ist eine echte Einschränkung, keine Konfigurationssache.

## Deine Rückfrage: kollidiert das mit dem Charakter-Anker und der Lip-Sync-Kette?

Berechtigt — und genau hier wird die Grenze hart gezogen. Im Szenen-Typ existieren heute drei getrennte Felder (`src/types/video-composer.ts`): `referenceImageUrl` (Geometrie-Anker des Charakters, laut v400 verbindlich die Messgrundlage), `lockReferenceUrl` (unveränderlicher Identitäts-Lock) und `firstFrameUrl` (gecachter Startframe). Der Übergangs-Modus fasst **ausschließlich** `firstFrameUrl` an.

Daraus folgen drei nicht verhandelbare Regeln:

1. `referenceImageUrl` und `lockReferenceUrl` werden vom Übergangs-Modus **nie** überschrieben. Der Charakter-Anker bleibt der Anker; ein verketteter Last-Frame ist nur der Bildeinstieg der Szene.
2. Szenen mit Lip-Sync-Engine (`cinematic-sync`, `sync-segments`, `heygen-talking-head`) sind vom Frame-Chain **ausgeschlossen** — sie bekommen zwangsweise `match-cut`. Die Lip-Sync-Kette (Baseline v283, Rollback-Stand 27.07.) wird nicht angefasst: kein neuer Input, keine geänderte Plate, keine geänderte Anker-Auflösung.
3. Wenn eine Szene keinen eigenen Charakter-Anker hat, ändert der Modus daran nichts — er erzeugt keine neuen Anker und löst keine Anker-Recovery aus.

Praktisch heißt das: nahtlose Kanten gibt es zwischen stummen/B-Roll-Szenen und zwischen Szenen mit Off-Voice. Dialogszenen mit Lip-Sync bleiben harter Schnitt mit Anker-Konsistenz — sichtbar begründet in der UI, statt es zu versuchen und die Sync-Qualität zu riskieren.

## Was gebaut wird

Ein sichtbarer **Übergangs-Modus pro Schnittkante** im Storyboard statt der heutigen impliziten Logik:

1. **Frame-Chain (nahtlos)** — letzter Frame der Vorszene wird `firstFrameUrl` der Folgeszene. Verfügbar, wenn die Folgeszene i2v kann und **kein** Lip-Sync trägt. Nutzt die vorhandene `extract-video-last-frame` / `useFrameContinuity`-Kette, wird aber explizit pro Kante gesetzt statt nur als Drift-Prüfung im Hintergrund.
2. **Match-Cut (Konsistenz)** — Pflicht bei Lip-Sync und bei Modellen ohne i2v: beide Szenen behalten ihre bestehenden Anker, harter Schnitt, keine Frame-Verkettung. Multi-Ref-Modelle (Seedance 2.5, Kling Omni, Veo) bekommen hier zusätzlich die vorhandenen Anker (Cast, Produkt, Location) als Referenzliste mitgegeben — additiv, ohne den Haupt-Anker zu ersetzen.
3. **Endframe-Bridge** — bei Modellen mit `endFrame` (Luma, LTX, Vidu, Seedance Mini) kann das Zielbild der Vorszene auf das Startbild der Folgeszene gesetzt werden. Ergibt die sauberste Kante ohne Nachbearbeitung. Ebenfalls für Lip-Sync-Szenen gesperrt.

Der Modus wird pro Kante automatisch vorgeschlagen (Frame-Chain, wenn möglich; sonst Endframe-Bridge; sonst Match-Cut) und ist manuell umstellbar. Nicht mögliche Modi werden mit Begründung gesperrt angezeigt („Lip-Sync aktiv", „Modell unterstützt kein Startbild") statt still zu scheitern.


## Technische Details

- Neue Datei `src/lib/composer/transitionMode.ts`: `resolveTransitionMode(prev, next)` — liest `capabilities.i2v`, `capabilities.endFrame`, `capabilities.multiRef/maxReferences` aus `aiVideoModelRegistry.ts` sowie die Lip-Sync-Engine der Folgeszene.
- `src/types/video-composer.ts`: Feld `transitionMode?: 'frame-chain' | 'endframe-bridge' | 'match-cut'` je Szene (bezieht sich auf die Kante zur Vorszene).
- UI: Badge plus Auswahl an der Schnittkante in `SceneStripTile.tsx` / `SceneCutDriftIndicator.tsx`; `ContinuityGuardianStrip.tsx` prüft nur noch Kanten im Modus `match-cut` auf Drift, da die anderen Modi die Kante hart setzen.
- Render-Seite: `compose-video-clips` reicht bei `frame-chain` die extrahierte Last-Frame-URL als `firstFrameUrl` der Folgeszene durch; bei `endframe-bridge` zusätzlich als `end_image` der Vorszene (Luma/LTX/Vidu/Seedance-Mini-Routen unterstützen das bereits).
- Keine Änderung an Preisen, Wallet-Logik oder der Lip-Sync-Kette selbst.

## Verifikation

Ein Testprojekt mit drei Szenen: (a) zwei stumme Szenen auf Hailuo → Frame-Chain, Kante visuell nahtlos; (b) eine Szene mit Lip-Sync → Modus sperrt auf Match-Cut mit Hinweis; (c) Luma-Paar → Endframe-Bridge. Payload je Route wird protokolliert.
