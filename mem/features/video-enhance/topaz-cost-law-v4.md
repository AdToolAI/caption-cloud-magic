---
name: Topaz Kostengesetz v4 (Quellauflösung/Vergrößerung)
description: Topaz-Kredite skalieren mit Quellpixeln x internem Maßstab^2; Grundlage des Schätzers 2026-09-09-calibrated-v4
type: feature
---
Topaz bilt die VERARBEITETEN Pixel:

    credits_pro_ausgabebild ~ quellpixel * (interner_maßstab)^2

- interner Maßstab = nächste Zweierpotenz über der angeforderten Vergrößerung
  sqrt(zielpixel/quellpixel), begrenzt auf 2x..4x (Proteus arbeitet in 2x-Schritten).
- Normiert auf die Referenzgeometrie 1080x1920 bei 2x (dort gilt die v2/v3-Ratenkarte).
- Interpolation (Apollo/Chronos) ist eine separate Rate pro Bild und skaliert mit derselben Geometrie.

Validiert an echten Abrechnungen (Abweichung 0 %): 1080p->4K/60 Apollo 10/19/28/33,
1080p->2K/60 Apollo 19, 1080p->2K/24 4, 720p->4K/60 Apollo 51/53, 720p->4K/24 11,
720p->2K/60 Apollo 13, 540p->4K/60 Apollo 29.

Bekannter Ausreißer: ein alter 608x1080->4K/60-Apollo-Lauf wurde nur halb abgerechnet.
Bewusst NICHT gefittet — das Gesetz überschätzt ihn, unterschätzt also nie.

Drift-Regel unverändert: Review nur bei abs(drift) > 15 % UND abs(ist-soll) >= 2 Credits.
Preisuntergrenze (nie unter geschätzten Providerkosten, vor Rabatt) und Deckel 1,8x-3,0x bleiben.
