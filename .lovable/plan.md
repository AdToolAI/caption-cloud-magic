

## Plan: Quick Actions in die Carousel-Headerleiste integrieren

### Aktuelle Struktur
- Die Carousel-Headerleiste (`"Deine Videos" + Badge + Prev/Next`) ist ein eigener Bereich über dem Player
- Die 4 QuickAction-Buttons sind ein separater sticky Block darunter, mit großen Kacheln (py-6, Icons + Text)

### Änderungen

1. **QuickActions aus Home.tsx entfernen**
   - Den separaten sticky QuickActions-Block (Zeilen ~561-566) entfernen

2. **QuickActions in die Carousel-Headerleiste einbauen**
   - In `DashboardVideoCarousel.tsx` die Headerleiste erweitern: links Titel+Badge, Mitte die 4 Buttons, rechts Prev/Next-Pfeile
   - Die Buttons werden kompakt: kleine Icons + kurzer Text nebeneinander (nicht untereinander), ohne die großen Kacheln
   - Buttonhöhe ca. h-8, schmaler (px-3), nur Icon + Label inline

3. **Headerleiste insgesamt schmaler machen**
   - Padding reduzieren (py-1 statt py-3)
   - Titel kleiner (text-lg statt text-xl)
   - Gesamte Leiste als eine kompakte Zeile

4. **QuickActions Props durchreichen**
   - `DashboardVideoCarousel` erhält die `quickActions` als Prop aus `Home.tsx`
   - Buttons werden als kompakte Link-Buttons gerendert

### Betroffene Dateien
- `src/pages/Home.tsx` — QuickActions-Block entfernen, Actions als Prop an Carousel übergeben
- `src/components/dashboard/DashboardVideoCarousel.tsx` — Headerleiste umbauen mit integrierten kompakten Buttons
- `src/components/dashboard/QuickActions.tsx` — bleibt bestehen für andere Verwendungen, wird hier aber nicht mehr genutzt

### Ergebnis
- Eine einzelne, schlanke Leiste über dem Player mit Titel, 4 kompakten Buttons und Navigation
- Mehr Platz für den Video-Player beim ersten Seitenaufruf

