# 4K-Export vs. echte KI-Hochskalierung im Director's Cut

## Was der Kunde erlebt hat — bestätigt

1. **Der 4K-Export skaliert nicht hoch.** Die Qualitätsauswahl im Export legt nur die
   Leinwandgröße fest (z. B. 3840×2160). Ein 1080p-Handyvideo wird darin schlicht
   größer gezogen — mehr Pixel, aber keine neuen Details. Genau das hat der Kunde gesehen.
2. **Es gibt einen Schalter „KI-Hochskalierung", der nichts tut.** Im Effekte-Bereich
   des Studios lässt sich „KI-Hochskalierung" mit Zielauflösung einschalten. Der Wert
   wird beim Export nur mitgespeichert und danach von der Renderstrecke ignoriert.
   Kein Auftrag, kein KI-Modell, kein Ergebnis. Das ist ein Blindschalter.
3. **Die echte Funktion existiert bereits — nur woanders.** Die fertige
   Hochskalierungs-Engine (Topaz Video Upscale und ByteDance vCube) läuft im
   AI-Video-Bereich und ist im Director's Cut nicht erreichbar.

Der Kunde macht also nichts falsch: Das Produkt verspricht an zwei Stellen etwas,
das an dieser Stelle nicht geliefert wird.

## Was gebaut wird

### 1. Blindschalter durch die echte Engine ersetzen
Der Schalter „KI-Hochskalierung" im Effekte-Bereich öffnet künftig die echte
Hochskalierung (dieselbe Engine wie im AI-Video-Bereich: Topaz für Kameramaterial,
ByteDance für KI-/Social-Material, Modellvorschlag automatisch). Sichtbar sind
Ausgangsauflösung, Zielauflösung, Preis und geschätzte Dauer, bevor gestartet wird.

Beide Zeitpunkte werden angeboten (wie gewünscht):

- **Vor dem Schnitt** — der hochgeladene Clip wird hochskaliert; danach ersetzt das
  bessere Material die Zeitleiste, alle Schnitte und Effekte laufen darauf. Bestes
  Ergebnis, Wartezeit vor dem Bearbeiten.
- **Nach dem Export** — das fertige Video wird einmal per KI gehoben. Schnell,
  ein Durchlauf; erscheint als Angebot direkt neben dem fertigen Export.

Beide Wege nutzen exakt dieselbe Engine, Preisberechnung, Guthabenprüfung und
Rückerstattung bei Providerfehlern — nichts davon wird neu gebaut oder verändert.

### 2. Ehrliche Beschriftung im Export
In der Exportauswahl steht künftig klar, dass 4K/8K die Ausgabegröße ist und keine
Details erfindet. Ist das Ausgangsmaterial kleiner als das gewählte Ziel, erscheint
ein Hinweis mit direktem Weg zur KI-Hochskalierung. Texte in EN, DE, ES.

### 3. Ergebnis in der Mediathek
Das hochskalierte Video wird wie bisher als eigenes Medium gespeichert, damit es
erneut verwendbar ist und nicht verloren geht.

## Technische Details

- `src/components/directors-cut/studio/sidebar/FXPanel.tsx`: Der lokale
  Upscaling-Block (Switch + Auflösungs-Select) wird durch die bestehende
  `AIVideoUpscaling`-Komponente ersetzt, die bereits `useEnhanceVideo` →
  Edge-Function `video-enhance` verwendet (Registry, Capability-Validierung,
  Pricing-Cap, Wallet, Persistenz). Kein zweiter Pfad.
- Vor dem Schnitt: `onUpscaleComplete` liefert `output_url`; die Studio-Quelle wird
  über den bestehenden Quellwechsel im Director's-Cut-Zustand ersetzt
  (`selectedVideo`), Szenen/Schnittmarken bleiben zeitbasiert erhalten.
- Nach dem Export: `EnhanceVideoDialog` wird an das Export-Ergebnis
  (`RenderOverlay`/Download-Zustand) angehängt, vorbelegt mit der Render-URL.
- `supabase/functions/render-directors-cut/index.ts`: Das tote Feld `upscaling`
  im `render_config` bleibt für Altprojekte lesbar, wird aber nicht mehr als
  Premium-Feature geführt (`PREMIUM_CREDITS.upscaling`); DC-Renders sind ohnehin
  kostenfrei — es wird also nichts abgerechnet, was nicht passiert.
- `src/lib/translations.ts`: neue Hinweistexte in EN/DE/ES.
- Unangetastet: Abrechnungslogik, Wallet, Video-Generierung, Lip-Sync,
  Rohmaterial-Invariante, Encode-Qualitätsboden, die in dieser Woche
  eingebauten Renderzeit-Verbesserungen (6 Arbeiter, 8K, Zeitanzeige).

## Prüfung vor Abgabe

- 1080p-Testclip: Export in 4K ohne KI → weiterhin 1080p-Details, aber Hinweis
  sichtbar; mit KI-Hochskalierung → messbar höhere Detailschärfe, Zielauflösung
  in der Datei bestätigt.
- Beide Zeitpunkte je einmal durchlaufen, Kosten- und Guthabenanzeige geprüft.
- Sprachprüfung EN/DE/ES, Typecheck und Build.
