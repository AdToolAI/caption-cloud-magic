# Picture Studio: Modellfähigkeiten sichtbar und vollständig umsetzen

## Ziel

Die neun Bildmodelle erhalten jeweils genau die Controls und Upload-Limits, die ihr tatsächlich angebundener Provider-Endpunkt unterstützt. Die Oberfläche reagiert sofort sichtbar auf Modell- und Moduswechsel; nicht unterstützte Optionen werden deaktiviert statt nur später im Backend abgelehnt.

## Bestätigter Ist-Stand

- Es existiert bereits eine Capability-Matrix und Backend-Validierung.
- Die sichtbare UI zeigt zusätzliche Referenz-Slots jedoch nur im Modus „Bild verwandeln“ und freie Pixel nur bei Seedream 4. Im Screenshot ist Recraft + „Neues Bild“ aktiv; deshalb erscheint dort praktisch keine Änderung.
- Die aktuelle Matrix bildet mehrere Fähigkeiten noch falsch oder unvollständig ab: GPT Image hat dort keine Bildinputs, Recraft keine Referenzen und nur Presets, Qwen nur ein Bild, Nano Banana keine Auflösungsstufen.
- Die drei Modi bleiben für alle Modelle anklickbar, obwohl etwa Imagen 4 Ultra keine Bildbearbeitung unterstützt.
- Ein eigener Multi-Reference-Workflow fehlt.

## Umsetzung

### 1. Provider-Verträge pro tatsächlich verwendeter Model-ID festziehen

- Die konkrete Model-ID und das Request-Schema jedes der neun bereits angebundenen Modelle gegen den aktiven Provider prüfen.
- Pro Modell festhalten: Create/Edit/Style/Reference-Mix, Motiv-/Stil-Limits, Größensteuerung, Strength-Felder und zulässige Auflösungen.
- Keine stillen Annahmen: Nur Fähigkeiten anbieten, die der konkrete Endpoint akzeptiert.
- Imagen 4 Ultra und FLUX 1.1 bleiben vorerst die vorhandenen Modelle; kein ungefragter Austausch gegen Gemini oder FLUX.2.

### 2. Eine vollständige Capability-Registry

Die gemeinsame Client-/Function-Registry wird erweitert um:

- unterstützte Modi je Modell,
- getrennte Limits für Motiv-, Stil- und Character-Referenzen,
- Gesamtlimit für kombinierte Referenzen,
- Größenart: Ratio, Auflösungsstufe, feste Presets, Resolution-Liste oder freie W×H,
- unterstützte Strength-Regler pro Workflow,
- verständliche Modellhinweise und Disable-Gründe.

Die bisher doppelte Modusbewertung wird aus derselben Registry abgeleitet, damit Picker, UI und Requestbau nicht mehr auseinanderlaufen.

### 3. Sichtbare, modellabhängige Oberfläche

- Die Modusauswahl wird pro Modell aktiviert/deaktiviert; gesperrte Modi zeigen einen kurzen Grund.
- Neuer vierter Modus **„Referenzen kombinieren“** für Modelle, deren Endpoint echte Multi-Reference-Eingaben unterstützt.
- Der Referenzbereich erscheint direkt passend zum Modus und unterscheidet Motiv, Charakter und Stil.
- Mehrfachauswahl in einem Upload, nummerierte Vorschauen, Entfernen einzelner Bilder und sichtbarer Zähler `n / max`.
- Größensteuerung je Modell:
  - Seedream: 1K / 2K / 4K / Custom W×H,
  - Nano Banana: unterstützte Auflösungsstufen + Ratio,
  - GPT Image: Auto und native feste Größen,
  - Imagen: 1K / 2K + unterstützte Ratios,
  - Ideogram: erlaubte Resolution-Liste bzw. Ratio,
  - Recraft: zulässige W×H-/Preset-Auswahl,
  - Qwen: zulässige Size-Grenzen,
  - FLUX 1.1 Ultra: Ratio.
- Nicht relevante Felder verschwinden vollständig. Beim Modellwechsel werden unzulässige Werte sichtbar angepasst und Referenzen nicht heimlich verworfen.
- Alle neuen Texte in EN/DE/ES.

### 4. Provider-spezifische Requests vollständig verdrahten

- Für jeden Endpoint wird aus der Registry ein eigener, strikt passender Request gebaut.
- GPT Image Editing nutzt den dafür vorgesehenen Edit-Pfad statt Referenzen als Generation-JSON zu behandeln.
- Subject-, Style- und Character-Bilder werden nur in die vom jeweiligen Provider erwarteten Felder geschrieben.
- Auflösung, Ratio und Strength werden nur gesendet, wenn der konkrete Endpoint sie akzeptiert.
- Klare 400-Fehler für nicht unterstützten Modus, Referenztyp/-anzahl oder Größe; keine Abbuchung bei Preflight-Fehlern.
- Bestehende Erfolgsabbuchung und symmetrische Refund-Logik bleiben unverändert.

### 5. Verifikation

- Registry-Tests für alle neun Modelle, Modi, Referenzlimits und Größenoptionen.
- Request-Shape-Tests pro Providerzweig, einschließlich GPT-Edit-Multipart und Grenzwerten.
- UI-Tests: Modellwechsel, deaktivierte Modi, Reference Mix, Multi-Upload, Größenfelder und Cache-Wiederherstellung.
- Sichtprüfung im Picture Studio für alle neun Modelle auf Desktop.
- Je ein echter günstigster Provider-Test für jeden neu oder geändert verdrahteten Requestpfad; Fehler werden mit der Provider-Meldung korrigiert, nicht durch stilles Fallback verdeckt.
- Danach ausschließlich die geänderten Bild-Functions deployen; keine Änderungen an Video, Lip-Sync, Preisen oder Wallet.

## Akzeptanzkriterien

- Beim Anklicken jedes Modells ändert sich die Oberfläche unmittelbar und nachvollziehbar.
- Kein Modell zeigt einen Modus, Upload-Slot, Regler oder Größenwert, den sein aktiver Endpoint nicht unterstützt.
- Multi-Reference-Modelle können ihre bestätigte Anzahl tatsächlich empfangen; Limits sind vor dem Request sichtbar.
- Seedream akzeptiert validierte Custom-Pixel, während preset-/ratio-basierte Modelle keine freien Pixel vortäuschen.
- Alle neuen Requestpfade bestehen einen echten Provider-Aufruf und die Regressionstests.
