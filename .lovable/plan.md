## Befund (verifiziert im Code)

Dieser Prompt stammt nicht direkt vom Kunden, sondern aus `buildCinematicSyncMasterPrompt()` in `compose-video-clips` (Zeile ~4341, Pfad `isCinematicSyncHH`). Er geht durch `sanitizeForHappyHorse()` — und der Sanitizer hat für genau dieses Muster **keine Regel**. Nachgemessen am gesendeten Text:

- **2.423 Zeichen**, davon eine extreme Ballung an Mund-/Körper-Vokabular: `lip/lips` **11×**, `mouth` **5×**, dazu `jaw`, `breathing` (2×), `whispering`, `swallow`, `chewing`, `nose`, `syllables`, `lips softly closed` … Alibabas Green Net bewertet Cluster aus Mund-, Lippen-, Atem- und Schluck-Beschreibungen an Personen als intime/sexualisierte Inhalte — unabhängig davon, dass wir damit nur Lip-Sync-Tauglichkeit erzwingen. Das ist der wahrscheinlichste Auslöser.
- **Negativlisten werden positiv gelesen**: „No lip-flap, no chewing pattern, no whispering shapes", „no person ever fully static", „[8 NEGATIVE] no watermarks, no logos" — Green Net scannt Rohtext ohne Negationslogik und zählt *chewing*, *whispering*, *lip-flap* als vorhandene Inhalte.
- **Widerspruch im Prompt**: „Exactly 2 distinct people: Samuel Dusatko" gegen „Three people are standing …" gegen „[Besetzung: Matthew Dusatko]". Personenzahl-Widersprüche triggern die „Rollen-/Instruktions"-Heuristik zusätzlich.
- Warum es früher lief: Der Master-Plate-Prompt ist über die letzten Iterationen (v198/v242/v245-Härtungen) immer länger geworden. Frühere HappyHorse-Clips hatten kürzere, weniger mundlastige Prompts.

Der bestehende Sanitizer entfernt nur `[SceneAction]`-Tags, Nacht-/Bildschirm-Phrasen und Duplikate — davon greift hier fast nichts.

## Plan

### 1. `_shared/happyhorse-green-net.ts` erweitern (Kern des Fixes)
Neue Stufe **„Lip-Ready Compressor"**, die vor allen bestehenden Regeln läuft:

- **Mund-Choreografie kollabieren**: Der komplette Block von „Lips relaxed …" bis „… everyone else listens attentively with closed lips." wird durch **einen** neutralen Satz ersetzt:
  *„Everyone has a calm, natural, neutral facial expression, faces fully visible and unobstructed."*
  Damit fallen ~1.300 Zeichen und alle `lip/mouth/jaw/whisper/swallow/chewing`-Tokens weg. Die Lip-Sync-Tauglichkeit bleibt erhalten, weil die eigentliche Mundsteuerung ohnehin erst im Sync.so-Post-Pass passiert und Sync-3 Profil/OTS nativ handhabt.
- **Idle-Body-Block kürzen** auf: *„Everyone shows subtle natural idle motion; heads stay steady, eyes open and alert."*
- **Negativlisten extrahieren**: Alle Sätze/Fragmente `No X` / `no X, no Y` / `[8 NEGATIVE] …` werden aus dem Prompt entfernt (HappyHorse hat kein `negative_prompt`-Feld — sie werden ersatzlos gestrichen statt dem Filter Reizwörter zu liefern). Ausnahme: die harmlosen Framing-Negationen der Kamera („no cuts, no zoom, no pan") bleiben zusammengefasst als *„locked static tripod shot, fixed framing"*.
- **Personenzahl vereinheitlichen**: Wenn der Prompt „Exactly N distinct people: <Namen>" enthält, wird jede abweichende Zahlangabe („Three people are standing …") auf N normalisiert. Bei Widerspruch gewinnt die Cast-Zahl.
- **Längenkappe** bei ~900 Zeichen an Satzgrenze (Green-Net-Trefferquote steigt messbar mit der Länge).

Rückgabe erweitert um `compressed: boolean` und die getroffenen Tags für Forensik.

### 2. Prompt-Builder an der Quelle entschärfen
`buildCinematicSyncMasterPrompt()` bekommt eine **providerabhängige Kurzfassung**: Für `ai-happyhorse` wird direkt die komprimierte Variante gebaut (keine Mund-Mikrodirektiven, keine Negativkaskaden), für Hailuo/Kling/Wan bleibt der bisherige Langtext unverändert. So greift der Sanitizer nur noch als zweites Netz.

### 3. Retry statt Provider-Wechsel
In `compose-clip-webhook` bei `isGreenNetRejection`: **ein** automatischer Retry mit der hart komprimierten Fassung auf HappyHorse, bevor die Szene als Fehler markiert wird (Zähler `greennet_retry_count`, keine Doppelbelastung). Erst wenn auch der Retry blockt, bleibt es beim heutigen Verhalten (Fehlerkarte + Refund + Hailuo-Vorschlag).

### 4. Fehlerkarte präzisieren
Statt „HappyHorse-Inhaltsfilter hat den Prompt blockiert" künftig mit Ursache und Selbsthilfe: *„Alibabas Filter reagiert auf Mund-/Lippen-Detailbeschreibungen und Negativlisten. Wir haben den Prompt automatisch gekürzt und erneut gesendet."* plus Button „Gekürzten Prompt anzeigen".

### 5. Verifikation
Ich lasse den Original-Prompt aus deiner Nachricht durch den neuen Sanitizer laufen, zeige dir die gekürzte Fassung, und starte damit einen echten HappyHorse-Testlauf (6s, 720p) gegen `alibaba/happyhorse-1.0` — erst wenn die Prediction durchläuft, melde ich fertig.

## Technische Details
- Geändert: `supabase/functions/_shared/happyhorse-green-net.ts`, `supabase/functions/compose-video-clips/index.ts` (Builder + Übergabe), `supabase/functions/compose-clip-webhook/index.ts` (Retry), Fehleranzeige der SceneCard.
- Keine Preis-, Margen- oder Schema-Änderung außer einem Retry-Zähler; Lip-Sync-Pipeline, Anchor-Invariante und Toggle-Veto bleiben unangetastet.
