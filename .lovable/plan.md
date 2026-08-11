# Stand nach Phase 2 — was steht, was fehlt wirklich

Phase 1 und 2 sind produktiv: Der Resolver ist die einzige Quelle für Bild-Inputs, alle Provider-Zweige in `compose-video-clips` lesen `planImageUrl`/`planEndImageUrl`, Seedance setzt exklusiv genau ein Input-Feld, die Übergangswahl steht in der Szenenkarte, Lip-Sync-Anker bleibt unberührt.

Drei Dinge aus der Architektur sind aber angelegt, aber noch nicht angeschlossen. Das ist der sinnvolle nächste Schritt — kein neues System, sondern die vorhandene Struktur zu Ende verdrahten.

## 1. Übergangsframes gibt es nur im Browser

Die Frame-Extraktion läuft ausschließlich in `ClipsTab` per Canvas. Jeder Renderweg, der nicht über diesen Klick geht — Re-Render einer einzelnen Szene, Autopilot, Serverjobs — hat keinen Vorgängerframe und fällt still auf harten Schnitt zurück. Der Nutzer sieht in der UI „Nahtlos" und bekommt beim Re-Render einen Schnitt.

**Vorgehen:** Übergangsframe serverseitig über Remotion Lambda Stills nachziehen (derselbe Weg wie die Motion-Probe, Replicate bleibt ausgeschlossen), Ergebnis an der Szene persistieren (`transitionFrameUrl`) und wiederverwenden. Der Browser-Pfad bleibt als schneller Vorlauf, überschreibt aber nichts.

## 2. Cast/World-Referenzen erreichen Seedance nicht

`characterReferences`, `locationReferences`, `productReferences` existieren in den Typen und in `classifyScene`, werden aber nirgends befüllt. Damit läuft Seedance 2.5 faktisch mit einer einzigen Referenz, obwohl bis zu 30 möglich sind, und das Referenz-Budget entscheidet über eine leere Liste.

**Vorgehen:** Beim Aufbau der Szene im Render-Pfad die bereits vorhandenen Cast- und World-Zuordnungen (Charakter-Outfit-URLs, Location, Produkt) in diese Felder schreiben. Reine Zuordnung, keine neue Auswahl-UI. Das Budget priorisiert dann wie entworfen: Identität vor Ort vor Produkt vor Übergang.

## 3. Die Parity-Absicherung fehlt

Es gibt Resolver- und Frame-Tests, aber keinen Test, der verhindert, dass irgendwann wieder eine Provider-Verzweigung direkt `scene.referenceImageUrl` liest. Genau dieser Rückfall ist die Ursache, gegen die Phase 2 gebaut wurde.

**Vorgehen:** Ein Quelltext-Test über den Provider-Block in `compose-video-clips`, der direkte Lesestellen ausschließt (Anchor-Auflösung T3 explizit ausgenommen).

## Ausdrücklich nicht jetzt

**Phase 3a — Seedance 2.5 als Lip-Sync-Plate-Provider.** Bleibt gesperrt. Sie erfordert Nativ-Audio-Abschaltung, Plate-Längenobergrenze, Watchdog pro Plate-Länge und einen grünen Vier-Sprecher-Referenzlauf davor und danach — und startet nur auf ausdrückliches „unfreeze lipsync" mit Scope „Seedance-2.5-Plate".

## Technisch

- Neu: `supabase/functions/_shared/transition-frame.ts` (Lambda-Stills-Extraktion, Kandidatenwahl am Clipende, Persistenz an der Szene).
- `compose-video-clips`: Frame-Nachzug vor dem Resolver-Aufruf; Befüllung der Referenzlisten aus Cast/World direkt vor `planSceneVisualInputs`.
- Tests: Parity-Test gegen direkte `scene.referenceImageUrl`-Lesestellen; Budget-Test mit befüllten Cast/World-Referenzen; bestehender Lip-Sync-Identitätstest bleibt Pflichtgate.
- Unberührt: `LIPSYNC_PROVIDERS`, T3/T5–T14, Watchdog, Anchor-Verträge v400.
