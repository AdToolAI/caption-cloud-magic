# Picture Studio 2.0 — Multi-Model Image Workspace

Ziel: Aufgabe zuerst, Modelle sichtbar. Vier Bereiche, ein Canvas-first Arbeitsplatz, eine zentrale Modell- und Preis-Registry, damit jedes weitere Spitzenmodell später nur noch ein Eintrag ist.

## Navigation

Generate · Edit · Enhance · Background. Keine Alben im Studio — Alben bleiben in der Mediathek; jedes Ergebnis wird automatisch dort gesichert ("Saved to Media Library") mit optionalem "Add to Album" über den bestehenden Album-Picker. Alte Links (`?tab=magic-edit`, `?tab=batch`) leiten sauber um.

## Layout (2028-Look)

Dreispaltig und adaptiv: links Eingabe (ca. 320–380 px), Mitte die Canvas mit dem gesamten Restplatz, rechts der Inspector (ca. 320–360 px). Beide Seitenspalten sind einklappbar, damit ein Ergebnis fast bildschirmfüllend geprüft werden kann. Der moderne Eindruck entsteht aus großer Arbeitsfläche, kontextabhängigen Controls, guten Empfehlungen und sehr wenig visuellem Rauschen — kein Neon, kein übertriebenes Glas. Microinteractions 150–250 ms, bestehende Design-Tokens.

**Sechs Prinzipien:** Canvas first · Progressive Disclosure · Model Transparency · Smart Recommendations · Immediate Feedback (Kosten, Größe, Modell vor dem Lauf) · Context Continuity.

## Aktives Asset (Kernstück)

Das Studio ist zustandsbehaftet: das zuletzt erzeugte oder hochgeladene Bild bleibt das aktive Asset über Generate → Edit → Enhance → Background hinweg. Kein Download-und-neu-hochladen. Unter jedem Ergebnis liegen direkt: Edit · Enhance · Background · Add to Album · Download, nach einem Upscale zusätzlich "Enhance again" (öffnet dasselbe Bild z. B. mit dem jeweils anderen Modell).


## Generate

- Ein Prompt-Feld mit Umschalter **Single | Batch** oben rechts. Batch zählt korrekt ("12 prompts detected") und zeigt eine aufklappbare nummerierte Vorschau. Der heutige Fehler "0 prompts detected" verschwindet damit.
- **Start with**-Chips (Product Ad, Portrait, Photorealistic, Social Media, Food, Luxury, Illustration) setzen einen Prompt-Anfang, starten aber nichts.
- Modellkarten mit dem **Modellnamen zuerst**: Seedream 4, Imagen 4 Ultra, Nano Banana 2 usw., darunter Positionierung, Tempo-/Qualitäts-Badge und Preis pro Bild. Fast/Pro/Ultra bleibt nur noch als Badge.
- Über den Karten eine Empfehlung "Recommended for your prompt" mit kurzer Begründung und "Use recommendation" — alle Modelle bleiben sichtbar und wählbar. Sie entsteht aus schnellen Regeln und Modell-Metadaten, ausgelöst nach kurzer Tippauspause bzw. beim Verlassen des Feldes — kein KI-Aufruf pro Tastendruck, also keine Zusatzkosten und keine Verzögerung.
- Danach Style & Format, darunter zusammengeklappt: Reference Images, Brand Kit, Advanced Settings.

## Edit

"Magic Edit" heißt Edit. Zuerst "What do you want to change?" mit Aktionskacheln, die **aus der Capability-Registry** kommen statt fest verdrahtet zu sein: sichtbar ist nur, was ein angebundenes Modell wirklich kann. Kommt später ein Modell mit `object_remove` dazu, erscheint "Remove" automatisch. Keine Platzhalter-Buttons.

## Enhance (der neue Schwerpunkt)

Drei Aufgaben: **Upscale**, **Restore**, **Colorize**.

Upscale zeigt zwei Modelle nebeneinander mit klarer Rollenzuweisung:
- **Topaz Image Upscale** — "Preserve reality": Fotos, Produkte, Gesichter, Text.
- **Clarity Pro** — "Create detail": KI-Bilder, Landschaften, Artwork.

Topaz-Bedienung: Enhance-Modell mit "Auto (Recommended)" plus sichtbarer Angabe, welches echte Modell läuft (Standard V2, Low Resolution V2, High Fidelity V2, CGI, Text Refine); Faktor 2× / 4× / 6× mit konkreter Ausgabegröße darunter (`2048 × 1365 → 8192 × 5460`); Face Enhancement erscheint bei erkanntem Gesicht mit Strength und (unter Advanced) Creativity.

Clarity-Bedienung: Presets Faithful / Balanced / Ultra Detail plus Advanced-Slider −10…+10, mit dem Hinweis, dass negative Werte das Original bewahren und positive Werte Details erfinden.

Restore: Topaz Dust & Scratch v2 mit optionalem Film Grain (Typ, Stärke, Dichte, Größe unter Advanced).
Colorize: Topaz Image Colorization mit einem Regler Natural…Vivid.

Vor jedem Lauf ein Output-Block: Zielauflösung und Megapixel, laufendes Modell, geschätzter Preis, geschätzte Dauer.

## Vergleichen und verstehen

- Canvas mit **Before | After**-Schieberegler, Umschaltern Original / Enhanced / Split und Zoom 50 % / 100 % / 200 %; "Hold C to compare" am Desktop, langes Drücken mobil.
- Ein Smart-Layer nach dem Upload: eine kurze, begründete Empfehlung mit "Apply recommendation" — das empfohlene Modell bleibt namentlich sichtbar.
- **Compare Models** (Topaz vs. Clarity in einem Lauf, doppelte Kosten, transparent ausgewiesen) kommt als letzter Schritt.

## Background

Bleibt eigener Bereich: entfernen, ersetzen, Studio-Hintergrund, transparentes PNG.

## Technisch

- **Modell-Registry** `src/config/pictureModels/` mit den Gruppen generation / enhancement / editing. Pro Modell: Name, Anbieter, Replicate-Model-ID, Fähigkeiten, Input-Schema, Preis, Marge, Empfehlungsregeln, Badges, `enabled`, `beta`. UI-Karten und Requestbau werden daraus erzeugt — kein React-Sonderfall pro Modell. Die vorhandene Capability-Matrix für die Generierungsmodelle wird eingehängt, nicht dupliziert.
- **Preis-Registry** statt if-Ketten: Anbieterkosten, Aufschlag, Endpreis, Abrechnungseinheit, Megapixel-Stufen und Mindestpreis. Topaz rechnet nach Output-Megapixeln, Clarity Pro pro Million Output-Pixel — der Preis wird vor dem Lauf aus der tatsächlichen Zielauflösung berechnet. Bestehende Margenregeln (Net-Factor, Margin-Floor) bleiben gültig; die konkreten Endpreise lege ich dir vor dem Aktivieren zur Freigabe vor.
- **Einheitlicher Lauf-Lifecycle** für alle Picture-Läufe: created → credits_reserved → provider_started → provider_succeeded → asset_saved → completed, bzw. provider_failed → credits_refunded. Idempotent, damit ein Anbieterfehler immer automatisch zurückerstattet.
- Neue Edge-Function `enhance-image` für die Topaz/Clarity-Modelle über die vorhandene Replicate-Anbindung; die heutige `upscale-image` (Clarity) wird darauf migriert, ihre bisherigen Aufrufer aus Bildkarte und Lightbox bleiben funktionsfähig.
- Alle neuen Texte in EN/DE/ES.

## Reihenfolge

1. Navigation Generate/Edit/Enhance/Background, Alben raus, Redirects.
2. Batch in Generate integriert, Prompt-Zählung und nummerierte Vorschau.
3. Modell-Registry + neue Generate-Modellkarten mit Empfehlung.
4. Reference Images, Brand Kit, Advanced Settings zusammenklappbar.
5. Enhance-Workspace mit Canvas und Before/After.
6. Clarity Pro migriert, Topaz Image Upscale angebunden (inkl. Modellwahl und Face Controls).
7. Topaz Dust & Scratch, danach Topaz Colorization.
8. Preisvorschau vor dem Lauf, Mediathek-Anbindung.
9. Compare Models als Premium-Funktion.

## Nicht angefasst

Video, Lip-Sync, Abo-/Checkout-Logik und bestehende Wallet-Buchungen außerhalb der Bild-Läufe.

## Offen vor Schritt 6

Topaz und Clarity Pro laufen über euren Replicate-Zugang. Bevor ich die Modelle scharf schalte, prüfe ich pro Modell einen günstigsten echten Testlauf und lege dir die Endpreise zur Freigabe vor.
