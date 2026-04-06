

## Fix: Carousel-Video pausieren wenn Vollbild-Dialog öffnet

### Problem
Wenn der User im Dashboard-Carousel ein Video abspielt (z.B. nach Unmute) und dann auf den Expand-Button klickt, läuft das Carousel-Video im Hintergrund weiter, während gleichzeitig das vergrößerte Video im Dialog startet. Zwei Videos laufen parallel.

### Ursache
Beim Klick auf Expand (`setSelectedVideo(...)`) wird das Carousel-Video nicht pausiert. Es spielt einfach weiter, während der `VideoPreviewPlayer`-Dialog mit `autoPlay` ein zweites Video startet.

### Lösung

**Datei: `src/components/dashboard/DashboardVideoCarousel.tsx`**

1. Beim Öffnen des Vollbild-Dialogs (Expand-Button, Zeile ~410) das aktive Carousel-Video pausieren:
   ```ts
   const el = videoRefs.current[selectedIndex];
   if (el) el.pause();
   ```

2. Beim Schließen des Dialogs (`onOpenChange`) das Carousel-Video wieder abspielen:
   ```ts
   onOpenChange={(open) => {
     if (!open) {
       setSelectedVideo(null);
       const el = videoRefs.current[selectedIndex];
       if (el) el.play().catch(() => {});
     }
   }}
   ```

**Datei: `src/components/video/VideoPreviewPlayer.tsx`**

3. Beim Schließen des Dialogs das Dialog-Video stoppen (damit es nicht im Hintergrund weiterläuft), indem ein `ref` das `<video>`-Element beim Unmount pausiert.

### Ergebnis
- Nur ein Video spielt gleichzeitig
- Carousel-Video pausiert bei Vollbild, setzt beim Schließen fort

