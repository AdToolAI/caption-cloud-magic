

## Plan: Konzept-Bearbeitung vor Video-Generierung

### Problem
Wenn das Interview abgeschlossen ist, zeigt der Consultant eine kurze Zusammenfassung und bietet nur "Video erstellen" oder "Manuell bearbeiten" an. Der Nutzer kann das Konzept nicht anpassen, bevor die Video-Generierung startet. Wenn z.B. der Stil, die Zielgruppe oder der CTA nicht stimmen, muss man das komplette Interview wiederholen.

### Lösung
Ein neuer **Konzept-Review-Step** zwischen Interview-Ende und Video-Generierung. Der Nutzer sieht alle gesammelten Informationen in editierbaren Feldern und kann Anpassungen vornehmen, bevor er die Generierung startet.

### Änderungen

**1. Neue Komponente `src/components/universal-video-creator/ConceptReviewEditor.tsx`**

Ein übersichtliches, editierbares Formular das die `UniversalConsultationResult`-Felder in Sektionen gruppiert:

- **Grundinfo**: Projektname, Firma, Produkt, Produktbeschreibung
- **Zielgruppe**: Zielgruppe, Alter, Geschlecht, Interessen
- **Storytelling**: Struktur, emotionaler Ton, Kernbotschaft, CTA
- **Visueller Stil**: Stil-Auswahl (Dropdown), Markenfarben, Referenz-URLs
- **Charakter**: An/Aus, Name, Beschreibung, Geschlecht
- **Audio**: Stimme (Geschlecht, Sprache, Ton), Musikstil, Musik-Stimmung
- **Technisch**: Dauer (Slider), Seitenverhältnis, Ausgabeformate

Design im James-Bond-2028-Stil (Glassmorphism, Gold-Akzente). Jede Sektion ist collapsible. Felder die von der KI gefüllt wurden sind vorausgefüllt aber editierbar.

Zwei Buttons unten:
- "Zurück zum Interview" — geht zurück zum Chat
- "Video generieren" — übergibt das bearbeitete Konzept an `onConsultationComplete`

**2. `src/components/universal-video-creator/UniversalVideoConsultant.tsx`**

- Neuer State: `reviewMode: boolean` und `editableRecommendation: UniversalConsultationResult | null`
- Wenn der Nutzer "Video erstellen" klickt → statt direkt `onConsultationComplete` aufzurufen, `reviewMode = true` setzen und `ConceptReviewEditor` anzeigen
- Neue Quick Reply Option: "Video erstellen" → "Konzept prüfen & anpassen"
- Wenn `reviewMode === true`: Chat ausblenden, `ConceptReviewEditor` einblenden
- "Zurück"-Button setzt `reviewMode = false`

**3. Lokalisierung**

Neue Übersetzungsschlüssel für die Sektions-Labels und Buttons (DE/EN/ES) in den bestehenden Translation-Dateien.

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/components/universal-video-creator/ConceptReviewEditor.tsx` | **Neu** — Editierbares Konzept-Formular |
| `src/components/universal-video-creator/UniversalVideoConsultant.tsx` | Review-Mode State, Routing zwischen Chat und Editor |
| `src/components/universal-video-creator/index.ts` | Export der neuen Komponente |
| Translation-Dateien | Neue Schlüssel für Sektions-Labels |

### Ergebnis
- Nach dem Interview sieht der Nutzer alle gesammelten Daten übersichtlich aufbereitet
- Jedes Feld ist editierbar — Stil, Ton, Dauer, CTA, alles anpassbar
- Erst nach dem Review startet die Video-Generierung
- Kein erneutes Interview nötig bei kleinen Korrekturen

