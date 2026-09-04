# Picture Studio 2.0 — Multi-Model Image Workspace

Ziel: Aufgabe zuerst, Modelle sichtbar. Vier Bereiche, ein Canvas-first Arbeitsplatz, eine zentrale Modell- und Preis-Registry, damit jedes weitere Spitzenmodell später nur noch ein Eintrag ist.

## Navigation

Generate · Edit · Enhance · Background. Keine Alben im Studio — Alben bleiben in der Mediathek; jedes Ergebnis wird automatisch dort gesichert ("Saved to Media Library") mit optionalem "Add to Album" über den bestehenden Album-Picker. Alte Links leiten mit erhaltener Absicht um: `?tab=magic-edit` → `?tab=edit`, `?tab=batch` → `?tab=generate&mode=batch`.

## Layout (2028-Look)

Dreispaltig und adaptiv: links Eingabe (ca. 320–380 px), Mitte die Canvas mit dem gesamten Restplatz, rechts der Inspector (ca. 320–360 px). Beide Seitenspalten sind einklappbar, damit ein Ergebnis fast bildschirmfüllend geprüft werden kann. Der moderne Eindruck entsteht aus großer Arbeitsfläche, kontextabhängigen Controls, guten Empfehlungen und sehr wenig visuellem Rauschen — kein Neon, kein übertriebenes Glas. Microinteractions 150–250 ms, bestehende Design-Tokens.

**Sechs Prinzipien:** Canvas first · Progressive Disclosure · Model Transparency · Smart Recommendations · Immediate Feedback (Kosten, Größe, Modell vor dem Lauf) · Context Continuity.

## Aktives Asset + Verlauf (Kernstück)

Das Studio ist zustandsbehaftet: das zuletzt erzeugte oder hochgeladene Bild bleibt das aktive Asset über Generate → Edit → Enhance → Background hinweg. Kein Download-und-neu-hochladen. Statt nur eines "aktuellen Bildes" führt das Studio eine **Lineage** (Original → Generierung → Edit v1 → Topaz 4× → Hintergrund). Der letzte Schritt ist das aktive Asset, jede frühere Stufe bleibt anklickbar — wer nach einem Topaz-Lauf lieber das Generate-Ergebnis mit Clarity testen will, springt einfach zurück. Damit arbeitet das Studio non-destruktiv. Unter jedem Ergebnis: Edit · Enhance · Background · Add to Album · Download, nach einem Upscale zusätzlich "Enhance again".


## Generate

- Ein Prompt-Feld mit Umschalter **Single | Batch** oben rechts. Batch zählt korrekt ("12 prompts detected") und zeigt eine aufklappbare nummerierte Vorschau. Der heutige Fehler "0 prompts detected" verschwindet damit.
- **Start with**-Chips (Product Ad, Portrait, Photorealistic, Social Media, Food, Luxury, Illustration) setzen einen Prompt-Anfang, starten aber nichts.
- Modellkarten mit dem **Modellnamen zuerst**: Seedream 4, Imagen 4 Ultra, Nano Banana 2 usw., darunter Positionierung, Tempo-/Qualitäts-Badge und Preis pro Bild. Fast/Pro/Ultra bleibt nur noch als Badge.
- Über den Karten eine Empfehlung "Recommended for your prompt" mit kurzer Begründung und "Use recommendation" — alle Modelle bleiben sichtbar und wählbar. Sie entsteht aus schnellen Regeln und Modell-Metadaten, ausgelöst nach kurzer Tippauspause bzw. beim Verlassen des Feldes — kein KI-Aufruf pro Tastendruck, also keine Zusatzkosten und keine Verzögerung.
- Danach Style & Format, darunter zusammengeklappt: Reference Images, Brand Kit, Advanced Settings.

## Edit

"Magic Edit" heißt Edit. Zuerst "What do you want to change?" mit Aktionskacheln, die **aus der Capability-Registry** kommen statt fest verdrahtet zu sein: sichtbar ist nur, was ein angebundenes Modell wirklich kann. Kommt später ein Modell mit `object_remove` dazu, erscheint "Remove" automatisch. Keine Platzhalter-Buttons.

## Enhance (der neue Schwerpunkt)

Ein Bereich "Enhance" mit einer kleinen sekundären Auswahl **Upscale · Restore · Colorize**; Upscale ist Standard — keine drei gleich starken Tabs, weil Upscale der Hauptfall ist. Direkt darunter stehen sofort die beiden Premium-Modelle.

Upscale zeigt zwei Modelle nebeneinander mit klarer Rollenzuweisung:
- **Topaz Image Upscale** — "Preserve reality": Fotos, Produkte, Gesichter, Text.
- **Clarity Pro** — "Create detail": KI-Bilder, Landschaften, Artwork.

Topaz-Bedienung: Enhance-Modell mit "Auto (Recommended)" plus sichtbarer Angabe, welches echte Modell läuft (Standard V2, Low Resolution V2, High Fidelity V2, CGI, Text Refine); Faktor 2× / 4× / 6× mit konkreter Ausgabegröße darunter (`2048 × 1365 → 8192 × 5460`); Face Enhancement erscheint bei erkanntem Gesicht mit Strength und (unter Advanced) Creativity.

Clarity-Bedienung: Presets Faithful / Balanced / Ultra Detail plus Advanced-Slider −10…+10, mit dem Hinweis, dass negative Werte das Original bewahren und positive Werte Details erfinden.

Restore: Topaz Dust & Scratch v2 mit optionalem Film Grain (Typ, Stärke, Dichte, Größe unter Advanced).
Colorize: Topaz Image Colorization mit einem Regler Natural…Vivid.

Vor jedem Lauf ein Output-Block: Zielauflösung und Megapixel, laufendes Modell, exakter Preis. Die Laufzeit wird bewusst nur als Spanne genannt ("Typical processing time: ~20–45 sec"), weil sie mit der Replicate-Auslastung schwankt; die Spanne kommt später aus euren eigenen Run-Daten statt aus Herstellerangaben.

## Vergleichen und verstehen

- Canvas mit **Before | After**-Schieberegler, Umschaltern Original / Enhanced / Split und Zoom Fit / 100 % / 200 %; "Hold C to compare" am Desktop, langes Drücken mobil.
- Ein Smart-Layer nach dem Upload: eine kurze, begründete Empfehlung mit "Apply recommendation" — das empfohlene Modell bleibt namentlich sichtbar.
- **Compare Models** (Topaz vs. Clarity in einem Lauf, doppelte Kosten transparent ausgewiesen) kommt bewusst früh — direkt nachdem beide Upscaler stabil laufen. Es demonstriert das Geschäftsmodell besser als jede Landingpage.

## Background

Bleibt eigener Bereich: entfernen, ersetzen, Studio-Hintergrund, transparentes PNG.

## Technisch

- **Modell-Registry** `src/config/pictureModels/` als einzige Quelle: id, Name, Vendor, Provider, providerModelId, Kategorie, Capabilities (`text_to_image`, `image_edit`, `object_remove`, `inpaint`, `outpaint`, `upscale`, `face_enhance`, `restore`, `colorize`, `background_remove`, `background_replace`), bestFor, Beschreibung, Badges, Input-/Output-Schema, Presets, unterstützte Scales und Formate, Preismodell, Empfehlungsregeln, `enabled`, `beta`, Übersetzungen. Die UI fragt die Registry ("welche Modelle können upscale?") und baut Karten, Aktionskacheln und Requests daraus — kein React-Sonderfall pro Modell. Die vorhandene Capability-Matrix der Generierungsmodelle wird eingehängt, nicht dupliziert.
- **Provider-Adapter-Schicht** zwischen Registry und Replicate — die Registry beschreibt Fähigkeiten, Preise und UI, erzeugt aber niemals selbst den Provider-Request:

```text
Picture Model Registry → Capability / Pricing / UI → Provider Adapter → Replicate API
```

  `src/lib/pictureModels/adapters/` mit `topazImageUpscale.ts`, `clarityPro.ts`, `topazDustScratch.ts`, `topazColorization.ts`. Ändert ein Anbieter sein Schema, ändert sich genau ein Adapter. "Neues Modell = fast nur ein Registry-Eintrag" bleibt realistisch, ohne starre Universal-API.
- **Preis-Engine** statt verstreuter Berechnungen: Anbieterkosten → Marge → Endpreis → Guthaben-Äquivalent, mit Einheiten pro Bild, pro Output-Megapixel, pro Lauf, nach Auflösung, Scale oder Modellvariante. Der Inspector ruft nur `estimatePrice(config)`. Topaz rechnet nach Output-Megapixeln, Clarity Pro pro Million Output-Pixel — beides aus der tatsächlichen Zielauflösung. Bestehende Margenregeln (Net-Factor, Margin-Floor) gelten weiter; die konkreten Endpreise lege ich dir vor dem Aktivieren zur Freigabe vor.
- **Einheitlicher Lauf-Lifecycle** für alle Picture-Läufe:

```text
created → credits_reserved → submitted → processing
        → provider_output_ready → asset_persisting → completed

provider_failed        → credits_refunded
asset_persist_failed   → Persistenz-Retry; Erstattung erst, wenn das Ergebnis
                         endgültig nicht mehr wiederherstellbar ist
```

  Ein erfolgreicher Anbieterlauf mit fehlgeschlagener Speicherung führt also nicht sofort zu einer Erstattung bei gleichzeitig getragenen Anbieterkosten. Alles idempotent, keine Doppelerstattungen.
- Neue Edge-Function `enhance-image` für die Topaz/Clarity-Modelle über die vorhandene Replicate-Anbindung; die heutige `upscale-image` (Clarity) wird darauf migriert, ihre bisherigen Aufrufer aus Bildkarte und Lightbox bleiben funktionsfähig.
- Ergebnisse landen wie bisher in der Mediathek; das Studio führt keine eigene Albumverwaltung mehr.
- Alle neuen Texte in EN/DE/ES.

## Freigaberegel

Kein Anbieter und kein Modell wird im Produktions-UI sichtbar, bevor mindestens ein echter End-to-End-Test inklusive Guthabenabbuchung, Erstattung, Mediathek und Download erfolgreich war. Bis dahin läuft es hinter einem Feature-Flag. Keine schöne Modellkarte ohne fertigen Unterbau.

## Reihenfolge

1. Navigation, aktives Asset mit Lineage, Canvas-Grundgerüst, Redirects.
2. Batch in Generate integriert, Prompt-Zählung und nummerierte Vorschau.
3. Modell-Registry + Provider-Adapter-Architektur + Basis der Preis-Engine.
4. Generate-Modellkarten mit Empfehlung.
5. Reference Images, Brand Kit, Advanced Settings zusammenklappbar.
6. Enhance-Workspace mit Before/After-Canvas.
7. Clarity Pro sauber migriert.
8. Topaz Image Upscale hinter Feature-Flag integriert.
9. Echte Kosten- und Qualitätstests → Endpreise freigeben → Topaz aktivieren.
10. Compare: Topaz vs. Clarity.
11. Topaz Dust & Scratch.
12. Topaz Colorization.
13. UX-Feinschliff, Telemetrie, bessere Empfehlungen.

## Nicht angefasst

Video, Lip-Sync, Abo-/Checkout-Logik und bestehende Wallet-Buchungen außerhalb der Bild-Läufe.
