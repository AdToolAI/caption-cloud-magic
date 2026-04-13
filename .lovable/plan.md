

## Plan: Sora-2-Tab durch umfassenden Haftungsausschluss ersetzen

### Konzept
Der "Sora 2"-Tab wird durch einen **"Rechtliches"**-Tab ersetzt, der einen vollständigen, rechtlich abgesicherten Haftungsausschluss für KI-generierte Videos enthält. Der Sora-2-Generator bleibt über die Provider-Karte im Studios-Tab erreichbar (Link auf `/ai-video-studio/generate` oder eigene Seite).

### Sora 2 Provider-Karte
Die Sora-2-Karte im Studios-Grid wird von `tab: 'generate'` (interner Tab-Switch) auf eine eigene Route umgestellt — entweder eine neue `/sora-video-studio`-Seite (analog zu Kling/Wan/etc.) oder der bestehende Generator als separate Seite extrahiert.

### Neuer "Rechtliches"-Tab — Inhalte

Der Tab zeigt eine umfassende, mehrsprachige (DE/EN/ES) Disclaimer-Seite mit folgenden Sektionen:

1. **Haftungsausschluss** — Keine Haftung für generierte Inhalte, Richtigkeit, Rechtmäßigkeit
2. **Kennzeichnungspflicht** — KI-generierte Videos müssen als solche gekennzeichnet werden (EU AI Act, § 6 TMG)
3. **Urheberrecht & geistiges Eigentum** — Nutzer ist allein verantwortlich für Verletzungen von Urheber-, Marken- oder Persönlichkeitsrechten
4. **Nutzungsbedingungen** — Videos dürfen nicht für illegale, diskriminierende oder irreführende Zwecke verwendet werden
5. **Datenschutz** — Hinweis, dass Prompts und Bilder an Drittanbieter-APIs (OpenAI, Replicate) übermittelt werden
6. **Keine Garantie** — Kein Anspruch auf Verfügbarkeit, Qualität oder Ergebnis
7. **Haftungsbeschränkung** — Maximale Haftung auf den bezahlten Betrag begrenzt

### Änderungen

**1. `src/components/ai-video/AIVideoDisclaimer.tsx`** — Erweitern
- Vom kurzen 3-Punkt-Banner zu einer vollständigen Rechtsseite mit 7 Sektionen
- Glassmorphism-Design passend zum James Bond 2028 Stil
- Weiterhin mehrsprachig (DE/EN/ES)

**2. `src/pages/AIVideoStudio.tsx`**
- Tab "Sora 2" (`generate`) → "Rechtliches" (`legal`) mit ShieldAlert-Icon
- Sora-2-Generator-Code aus dieser Datei entfernen
- Sora-2-Provider-Karte: `link` auf `/sora-video-studio` statt interner Tab-Switch
- TabsContent `legal` rendert die erweiterte `AIVideoDisclaimer`-Komponente

**3. `src/pages/SoraVideoStudio.tsx`** — Neu erstellen
- Eigenständige Sora-2-Studio-Seite (Generator-Code aus AIVideoStudio extrahiert)
- Einheitlicher "← AI Video Studio" Back-Link wie bei Kling/Wan/etc.

**4. `src/App.tsx`** — Route `/sora-video-studio` hinzufügen

### Dateien
- **Neu**: `src/pages/SoraVideoStudio.tsx`
- **Umfassend editiert**: `src/components/ai-video/AIVideoDisclaimer.tsx`, `src/pages/AIVideoStudio.tsx`
- **Edit**: `src/App.tsx` (neue Route)

