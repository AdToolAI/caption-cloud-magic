# 30-Sekunden-Plattform-Demo hinter „Demo ansehen"

## Ehrliche Einordnung vorab

Seedance 2.5 ist ein generatives Video-Modell. Wenn man ihm Screenshots als Referenz gibt, malt es die Oberfläche **neu** — Text wird unleserlich, Menüs erfinden sich, das Logo verzerrt. Für ein Produkt-Demo, das echte Software zeigen soll, ist das das falsche Werkzeug: das Ergebnis sieht nach „KI-Fantasie einer App" aus, nicht nach unserer Plattform. Und ein Seedance-Job ist **eine** 30-Sekunden-Szene mit einem Prompt — acht Bereiche mit sauberen Schnitten sind damit nicht darstellbar.

Deshalb schlage ich einen Hybrid vor: echte Screenshots als Bildmaterial, professionell geschnitten, mit AI-Voiceover — und Seedance 2.5 nur dort, wo es stark ist (Intro-/Outro-Bild).

## Empfohlener Aufbau (Variante A)

Ein 30-Sekunden-Clip, gerendert mit unserer bestehenden Remotion-Pipeline:

- **Bildmaterial**: echte Screenshots, per Browser-Automation in der Vorschau aufgenommen — Startseite, eingeloggte Startseite, AI Video Studio, AI Text Studio, Motion Studio, Analytics Dashboard, Cast & World, intelligenter Kalender.
- **Bewegung**: langsame Kamerafahrten (Ken-Burns), Cursor-Hints, UI-Elemente die einzeln einblenden — im Design-System (Deep Black, Gold, Glassmorphism).
- **Voiceover**: ElevenLabs, englisch, 30 s Skript.
- **Musik**: dezenter Bed, Untertitel eingebrannt (Autoplay ist stumm).
- **Seedance 2.5**: optional ein 4-Sekunden-Intro-Shot (abstrakt, kein UI) als Eyecatcher.

## Alternative (Variante B)

Reiner Seedance-2.5-Clip mit Screenshots als Referenz. Schneller, aber die UI ist nicht mehr unsere UI. Ich empfehle das nicht — nenne es nur, weil du danach gefragt hast.

## Voiceover-Skript (EN, ~30 s)

```text
0-4s   Everything a creator needs. One platform.
4-9s   Write the script, generate the voice, direct the scene —
       AdTool AI runs the whole production.
9-15s  The AI Video Studio gives you every leading model in one workflow.
       Motion Studio adds the polish.
15-21s Build a recurring cast, keep faces and voices consistent
       across every clip you make.
21-26s Plan, publish and measure — analytics and a smart calendar
       that knows when your audience is watching.
26-30s One creator. A whole studio. Start free.
```

## Storyboard (8 Beats)

```text
0-4s    Startseite (Hero)            langsamer Zoom-out
4-9s    Eingeloggte Startseite       Pan über Cockpit
9-13s   AI Video Studio              Modellauswahl blendet ein
13-15s  AI Text Studio               schneller Cut
15-18s  Motion Studio                Timeline scrollt
18-21s  Cast & World                 Charakterkarten staffeln herein
21-24s  Analytics Dashboard          Kurve zeichnet sich
24-27s  Intelligenter Kalender       Slots poppen auf
27-30s  Logo + „Start free"          Endkarte
```

## Einbindung

- Der Hero-Button „Demo ansehen" springt aktuell auf `#live-demo`. Er bekommt stattdessen ein Lightbox-Modal mit dem neuen Clip (Ton per Klick, ein Durchlauf, danach Standbild).
- Clip als Lovable-Asset (CDN), nicht im Repo.
- Modal-Texte in EN/DE/ES; das Voiceover bleibt englisch.

## Technische Details

- Screenshots via Playwright gegen die laufende Vorschau, 1920x1080, mit eingeloggter Session für die geschützten Bereiche.
- Remotion-Komposition unter `remotion/` (30 s, 30 fps, 1920x1080), Rendering lokal im Sandbox-Renderer — keine Lambda-Auslastung.
- Voiceover über ElevenLabs, Audiospur in die Komposition gemuxt.
- Neue Komponente `src/components/landing/DemoVideoDialog.tsx`, eingehängt in `BlackTieHero.tsx` statt des Ankers.
- Kein Eingriff in Motion Studio / FA-4 / Lip-Sync-Kette.

## Was ich vor dem Start noch brauche

- Freigabe für Variante A (oder ausdrücklich B).
- Freigabe für das Skript oben (oder deine Korrekturen).
- Bestätigung, dass ich mich für die geschützten Bereiche mit einer Testsession einloggen darf, um Screenshots zu ziehen.
