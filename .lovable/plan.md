
Problem neu zusammengefasst
- Der Fehler ist weiterhin identisch: `Cannot read properties of undefined (reading 'length')` im Remotion-Lambda.
- Der aktuelle Stand ist jetzt klarer als zuvor: Die letzten Daten zeigen **keinen alten Deployment-Stand mehr**.
  - Letzter fehlgeschlagener Lauf: `fahn9dd068`
  - `bundle_probe`: `canary=2026-03-02-r6-deepSanitize-profileFix,sanitizer=v6`
  - `diagnosticProfile`: `A`
  - `diag_flags_effective`: korrekt vorhanden
- Damit ist das Problem jetzt nicht mehr „Code nicht deployed“, sondern ein verbleibender Runtime-Pfad.

Do I know what the issue is?
- Ja, mit hoher Wahrscheinlichkeit sind es jetzt diese zwei Punkte:
  1) Wir sehen bisher nur Profil **A** (Full). Die eigentliche Isolationskette (B/C/D) wurde im letzten Lauf nicht durchlaufen, daher ist der crashende Subpfad noch nicht eindeutig markiert.
  2) Der verbleibende `.length`-Crash liegt sehr wahrscheinlich weiterhin in einem Lottie-internen Datenpfad, der trotz v6-Sanitizer noch nicht vollständig abgefangen wird (typische Kandidaten: `masksProperties`, weitere verschachtelte Arrays in Layer/Text/Effects-Strukturen).

Was ich als nächsten Fix umsetzen würde (priorisiert)

1) Isolationslauf deterministisch erzwingen (nicht mehr vom manuellen Retry-Verhalten abhängig)
- Dateien:
  - `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
  - `src/components/universal-video-creator/UniversalVideoWizard.tsx`
- Umsetzung:
  - Wenn ein Render mit genau diesem Fehler (`reading 'length'`) fehlschlägt, automatisch nächsten Profilversuch starten:
    - A (Full) → B (Morph off) → C (Icons off) → D (Character off)
  - Maximal 3 automatische Folgeversuche, danach sauberer Fehlerzustand.
  - Im UI immer sichtbar: „Aktives Diagnoseprofil: A/B/C/D“.
- Ziel:
  - In einem einzigen Nutzer-Flow das fehlerhafte Subsystem sicher isolieren.

2) Deep-Sanitizer final härten (Lottie-Final-Gate)
- Datei:
  - `src/remotion/utils/premiumLottieLoader.ts`
- Umsetzung:
  - `sanitizeForLottiePlayer()` um weitere häufige Lottie-Crashpfade erweitern:
    - `masksProperties` als Array absichern
    - zusätzliche verschachtelte Array-Felder in Layer-/Text-/Effects-Bereichen defensiv normalisieren
    - bei inkonsistenten Layer-Objekten weiterhin „hard reject“ (null zurück), niemals unsicheres Objekt an `<Lottie />`
- Ziel:
  - Alle bekannten `.length`-Pfadvarianten vor der Player-Initialisierung abfangen.

3) Harte Sicherheitsgates in allen 3 Lottie-Komponenten vereinheitlichen
- Dateien:
  - `src/remotion/components/ProfessionalLottieCharacter.tsx`
  - `src/remotion/components/LottieIcons.tsx`
  - `src/remotion/components/MorphTransition.tsx`
- Umsetzung:
  - Einheitliches Muster:
    - sanitize -> nur dann `<Lottie />`
    - sonst sofort SVG/Emoji-Fallback
  - Zusätzliche „Render-Guard“-Logs direkt vor `<Lottie />` (kompakt, frame 0 / first render), damit man im nächsten Fehlerfall das letzte erfolgreiche Gate sieht.
- Ziel:
  - Kein direkter Player-Aufruf ohne validierte Daten.

4) Forensik weiter schärfen, damit der nächste Fehlversuch sofort eindeutig ist
- Dateien:
  - `supabase/functions/invoke-remotion-render/index.ts`
  - `supabase/functions/remotion-webhook/index.ts`
  - `supabase/functions/debug-render-status/index.ts`
- Umsetzung:
  - Pro Lauf konsistent persistieren/anzeigen:
    - `diagnosticProfile`
    - `diag_flags_effective`
    - `payload_hash`
    - `bundle_probe`
    - `real_remotion_render_id`
    - optional `auto_retry_attempt` + `auto_retry_reason`
- Ziel:
  - Kein Blindflug mehr: sofort sichtbar, welches Profil lief und warum es scheiterte.

5) Kleine, aber wichtige Robustheitsverbesserung am Fehlerfluss
- Datei:
  - `src/components/universal-video-creator/UniversalAutoGenerationProgress.tsx`
- Umsetzung:
  - Fehlerklassifikation trennen:
    - Netzwerk-/Invoke-Fehler
    - echter Renderfehler aus Webhook/Progress
  - Nur bei echtem Render-`.length` die Profilkette fortsetzen.
- Ziel:
  - Keine falschen automatischen Retries bei reinen Verbindungsproblemen.

Technische Reihenfolge
1. Auto-Profilkette im Frontend sauber implementieren (A→B→C→D).
2. Deep-Sanitizer in `premiumLottieLoader` auf fehlende Lottie-Arraypfade erweitern.
3. Einheitliche Lottie-Gates in Character/Icons/Transition finalisieren.
4. Forensikfelder in Backend + Diagnosepanel konsistent machen.
5. End-to-end Validierung mit frischem Lauf, inkl. Profilwechseln.

Abnahmekriterien
- Mindestens ein Profil-Lauf erreicht `completed` (bei gleicher Eingabe).
- Kein `Cannot read properties of undefined (reading 'length')` mehr im finalen Lauf.
- Diagnosepanel zeigt pro Versuch korrekt Profil + effektive Flags.
- Full-Quality bleibt Standard (Profil A); reduzierte Modi nur diagnostisch/fallback.

Erwartetes Ergebnis
- Wir brechen die aktuelle Fehler-Schleife kontrolliert.
- Der crashende Subpfad wird reproduzierbar identifiziert (oder bereits durch Sanitizer behoben).
- Danach kann ein gezielter finaler Qualitätsfix erfolgen, ohne pauschalen Qualitätsverlust.
