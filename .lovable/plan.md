# Lip-Sync: der richtige Weg — offizieller Sync.so-Vertrag statt weiterer Rateschleifen

## Warum das bisher nicht konvergiert

Wir haben vier Monate lang unsere **eigene** Geometrie-, Identitäts- und Gate-Logik
gebaut (V461–V542) und dabei den dokumentierten Vertrag des Anbieters nie als
Autorität benutzt. Die offizielle Sync.so-Dokumentation erklärt mehrere unserer
Symptome direkt:

| Beobachtung bei uns | Offizielle Aussage von Sync.so |
|---|---|
| Alle 4 Pässe `noop`, Video fertig, kein Mund bewegt sich | **Still-Frame-Limitation:** `lipsync-2` / `lipsync-2-pro` arbeiten in unabhängigen 2-Sekunden-Chunks und brauchen *sichtbare, natürliche Sprechbewegung* im Input. Statische Figuren → kein Lip-Sync, auch mit Audio. `sync-3` kann stille Lippen öffnen, aber generisch. |
| Wir croppen extrem eng (`targetFaceShare 0.42`), Golden Run lag bei 0.25–0.40 | Zu große Gesichtsregionen degradieren; `lipsync-2-pro` ist bis ca. 350×350 px Gesichtsregion spezifiziert, Face-Output ist 512×512. Empfohlen: 1080p, frontal, ganzes Gesicht sichtbar. |
| Wir bauen pro Turn einen eigenen Preclip + eigenen Job und ketten sie | Für Mehrsprecher-Timelines ist die **Segments-API** der dokumentierte Weg: ein Call, `segments[]` mit `startTime`/`endTime`, eigenem `audioInput` und eigenem `optionsOverride.active_speaker_detection` pro Segment; `sync_mode` defaultet dort auf `remap`. |
| Mehrere Gesichter im Bild, wir lösen das mit eigener Identitäts-Pipeline | Dokumentiert: entweder ASD (`auto_detect`, Punkt+Frame, oder per-Frame `bounding_boxes` / `bounding_boxes_url`) oder Croppen/Maskieren. Genau das, was wir tun — aber wir kombinieren es mit einem zu engen Crop. |
| Bewegte Figuren / Seitenansicht | `sync-3` unterstützt extreme Winkel, Teilgesichter, Full-Shot-Verarbeitung, 4K nativ, keine Chunk-Artefakte — ist also das *einzige* Modell, das „Charaktere bewegen sich" wirklich abdeckt. `lipsync-2` bricht daran. |

Kernsatz: **Bewegung ist keine Störung, sondern Voraussetzung.** Unsere Pipeline
optimiert seit Wochen auf ruhige, eng gecroppte Platten — also genau auf den
Zustand, in dem das Modell laut Hersteller nichts tut.

## Gate 0 — Konformitätsanalyse (read-only, keine Codeänderung)

Bevor irgendetwas geändert wird: ein einziger Abgleich unseres realen
Request-Payloads gegen den dokumentierten Vertrag.

1. Welches Modell schicken wir heute tatsächlich pro Pass (`sync-3` vs.
   `lipsync-2`)? Für jeden Pass der letzten drei Läufe belegen.
2. Enthält der Input-Clip sichtbare Sprech-/Kopfbewegung, oder ist er statisch?
   (Still-Frame-Limitation prüfen, nicht vermuten.)
3. Crop-Kennzahlen pro Pass: Frame-Größe, Gesichtshöhe in px, Face-Share,
   Mund vollständig im Bild — gegen den Golden-Run-Korridor (0.25–0.40 Face-Share,
   Gesicht 182–288 px, Mund im Frame) **und** gegen die Doku-Empfehlung.
4. Nutzen wir `segments[]` oder N einzelne verkettete Generierungen?
5. Welche unserer eigenen Gates blocken vor dem Provider, obwohl die Doku den
   Fall gar nicht als Fehler kennt?

**Ergebnis:** eine Tabelle „unser Payload vs. Doku-Vertrag" mit maximal drei
belegten Abweichungen. Kein Code, kein Deploy.

## Die vier erlaubten Änderungen danach

Bewusst genau vier, in dieser Reihenfolge, jede einzeln überprüfbar:

**Änderung 1 — Modellvertrag: `sync-3` für alle Lip-Sync-Pässe.**
Es ist das einzige dokumentierte Modell für bewegte Figuren, Seitenansichten,
Teilgesichter und stille Lippen. Höherer Preis pro Sekunde, dafür verschwindet
die Still-Frame-Klasse. Ein zentraler Wert, kein Umbau.

**Änderung 2 — Crop zurück in den belegten Korridor.**
`targetFaceShare` von 0.42 auf den Golden-Run-Bereich, Mund garantiert vollständig
im Frame, statt mundzentriert übertight. Ein Wert im eingefrorenen Contract, wirkt
auf alle Sprecherzahlen gleich.

**Änderung 3 — Ehrlichkeit: gemessener `noop` ist kein Erfolg.**
Läufe, in denen *alle* Pässe messbar `noop` sind, werden nicht als fertige Szene
ausgeliefert, sondern gehen über den bestehenden idempotenten Refund-Pfad zurück.
`motion_unverified` (nicht messbar) bleibt wie in v443 Durchlauf. Damit endet die
Klasse „bezahltes Video ohne Lip-Sync, das als Erfolg zählt" — und wir sehen ab
sofort die Wahrheit statt geschönter Statuswerte.

**Änderung 4 — Gate-Abbau auf den Doku-Vertrag.**
Nur die Gates behalten, die eine dokumentierte Anbieter-Anforderung schützen
(Gesicht erkennbar, Mund im Frame, Audio-Länge). Selbstgebaute Blocker ohne
Doku-Grundlage (`v536_mouth_crop_infeasible` bei Sub-Pixel-Konflikten,
`no_coherent_track_samples`, Face-Repair-Sackgassen) werden zu Warnungen
degradiert statt terminale Abbrüche zu erzeugen.

Was **nicht** dazugehört: kein Wechsel auf die Segments-API in diesem Zug (das ist
ein separater, größerer Umbau), keine neuen Provider, keine Preis-, Refund-,
FA-4-, V537- oder Schema-Änderungen.

## Abbruchkriterium

Nach diesen vier Änderungen wird eine feste Test-Kohorte gefahren:
je 3 kontrollierte Läufe mit 2, 3 und 4 Sprechern, jeweils mit bewegten Figuren.
Bewertet wird ausschließlich **visuell**, nicht per Datenbankstatus.

- Erfolgsdefinition pro Szene: jeder Sprecher bewegt im richtigen Gesicht den
  Mund, kein stiller Passthrough, korrekte Zuordnung, Mux enthält genau diese
  Ausgaben.
- Wird das nicht erreicht, wird Lip-Sync als Produktfeature ausgesetzt
  (Feature-Flag aus, Kredit-neutral) und der Composer ohne Lip-Sync fertig
  ausgeliefert. Kein fünfter Versuch.

## Technische Details

- Modellwahl und Payload: `supabase/functions/_shared/lipsync-frozen-contract.ts`
  (`payload_model`, `targetFaceShare: 0.42`), Dispatch in
  `supabase/functions/compose-dialog-segments/index.ts`.
- Crop-Berechnung: `_shared/compute-mouth-centered-crop.ts`,
  `_shared/pass-face-preclip.ts` (`v536_mouth_crop_infeasible`).
- Wahrheits-Gate: `_shared/v541-truth-gate.ts`, Erfolgspfad in
  `sync-so-webhook/index.ts`, Nachmessung in `lipsync-watchdog/index.ts`.
- Referenzen: `docs/lipsync-golden-run-v400.md`,
  `docs/lipsync-pipeline-v400-errata.md`.
- Doku-Belege: sync.so „Improving lip sync quality", „Models / lipsync"
  (Still-Frame-Limitation, Modellvergleich sync-3 vs. lipsync-2/-pro),
  „Speaker selection" (ASD, bounding_boxes_url), „Segments".

## Reihenfolge

Zuerst nur Gate 0. Ich ändere keine Zeile Code, bevor die Konformitätstabelle
vorliegt und du sie freigegeben hast.
