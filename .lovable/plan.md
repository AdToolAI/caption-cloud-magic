

## Wurzel gefunden — Remotion Version-Mismatch

Die Warnung in deinem Screenshot ist **die Ursache** der unzuverlässigen Renders:

- `remotion`, `@remotion/cli`, `@remotion/lambda`, `@remotion/lottie`, `@remotion/player` → `4.0.441` (gepinnt)
- `@remotion/transitions` → `^4.0.448` (Caret → resolved auf 4.0.448)
- `@remotion/paths`, `@remotion/shapes` → ebenfalls 4.0.448 (transitive deps von transitions)

Remotion's eigene Doku sagt explizit: *"You may experience breakages such as: React context and hooks not working, Type errors and feature incompatibilities, **Failed renders and unclear errors**."* Genau das beobachten wir — die `<TransitionSeries>` (aus 4.0.448) bekommt vom 4.0.441 Renderer nicht die richtigen Hooks/Context, daher die Audio-Glitches.

## Fix — alle Remotion-Packages auf identische Version pinnen

**`package.json`** — Zeile 52 ändern:
```diff
- "@remotion/transitions": "^4.0.448",
+ "@remotion/transitions": "4.0.441",
```

Damit ist jedes `@remotion/*` Paket auf exakt `4.0.441`. Die Caret-Notation entfernen, damit auch zukünftige `bun install` keine neueren Versionen ziehen.

**Lockfile-Refresh nötig** — nach dem Edit muss `bun install` einmal laufen, um `bun.lock` zu aktualisieren und 4.0.448 vollständig durch 4.0.441 zu ersetzen.

## Lambda-Bundle neu deployen

Da die Lambda-Site vom alten Bundle (mit gemischten Versionen) gerendert wurde, muss nach dem Version-Fix:

1. Bundle neu erstellen: `npx remotion lambda sites create src/remotion/index.ts --site-name=adtool-remotion-bundle --region=eu-central-1` 
2. **WICHTIG**: Die Site-URL in der DB / im `REMOTION_SERVE_URL` Secret aktualisieren falls sich der Hash ändert (laut Memory `mem://infrastructure/remotion/lambda-bundle-deployment-and-verification` macht ihr Bundle-Version-Checking)

Da du das Bundle vom Terminal aus deployst (sichtbar im Screenshot), erledigst du Schritt 1 selbst. Lovable kann nur das `package.json` fixen.

## Geänderte Dateien

- `package.json` — `@remotion/transitions` auf `4.0.441` pinnen (ohne Caret)

## Nach dem Fix — Verify

1. Lokal: `bun install` → `bun.lock` neu generieren
2. `npx remotion versions` → alle Pakete zeigen 4.0.441, **keine** Mismatch-Warnung mehr
3. `npx remotion lambda sites create src/remotion/index.ts --site-name=adtool-remotion-bundle --region=eu-central-1` → neue Bundle deployen
4. Render starten → Audio durchgehend sauber, **keine** Stotterer mehr

## Warum das diesmal die Wurzel ist

Die letzten 4-5 Iterationen haben am **Code** geschraubt, während das eigentliche Problem im **Build-Setup** lag. `<TransitionSeries>` aus 4.0.448 nutzt intern Hooks/Context-APIs die im 4.0.441 Core anders implementiert sind → undefiniertes Verhalten beim Audio-Sync, sichtbar als Stotterer/Wiederholung/Cut an Übergängen. Das erklärt auch warum dieselben Code-Änderungen mal helfen und mal nicht — es ist Race-bedingt durch die Version-Inkompatibilität.

