/**
 * briefingTemplate.ts — the single source of truth for the "Muster-Briefing".
 *
 * The Briefing analysis (`analyze-briefing`) only resolves what it can detect
 * deterministically: duration/scene-count lines, @-mentions for cast and
 * locations, speaker-prefixed dialogue lines and shot vocabulary from the
 * manifest enums. This template is written to hit exactly those detectors, so
 * everything it contains survives the trip into the Storyboard.
 *
 * Used by:
 *  - BriefingFormatGuide (inline in the import dialog + sheet in the BriefingTab)
 *  - docs/briefing-musterbeispiel.md (kept in sync manually for support)
 *  - briefingTemplate.test.ts (guards the template against parser drift)
 */

import { tx } from '@/lib/i18nText';

const TEMPLATE_DE = `Projekt: AdTool AI — Launch Spot
Format: 9:16
Länge: 30 Sekunden
Szenen: 3

Cast:
@founder — Gründerin, 32, ruhig-souverän
@kundin — Kundin, 28, skeptisch, dann überzeugt

Orte:
@home-office — helles Loft-Büro, große Fensterfront

Ziel: Zeigen, dass ein Creator mit AdTool AI ein ganzes Studio ersetzt.

Szene 1 — Der Zweifel
Dauer: 10 Sekunden
Ort: @home-office
Cast: @kundin
Kamera: medium-close-up, eye-level, slow-push-in, soft-window
Aktion: Sie scrollt durch ihren Feed, lehnt sich zurück, Stirn in Falten.
Voiceover: "Jede Woche neuer Content — und du machst alles allein."

Szene 2 — Die Wende
Dauer: 12 Sekunden
Ort: @home-office
Cast: @founder, @kundin
Kamera: medium, three-quarter, tracking, natural
Dialog:
@founder: "Du brauchst kein Team. Du brauchst ein Studio."
@kundin: "Und das läuft wirklich in einem Tool?"
@founder: "Briefing rein, fertiger Spot raus."

Szene 3 — Der Beweis
Dauer: 8 Sekunden
Ort: @home-office
Cast: @founder
Kamera: close-up, frontal, static, golden-hour
Aktion: Sie dreht den Bildschirm zur Kamera, zufriedenes Nicken.
Voiceover: "Ein Creator. Ein ganzes Studio."

Stimme: ElevenLabs, eleven_multilingual_v2, Stability 0.45, Speed 1.0
Untertitel: an, Position bottom, max 4 Wörter, Highlight #F5C76A
Negative Prompt: keine Logos, keine Schrift im Bild, keine Zuschauer`;

const TEMPLATE_EN = `Project: AdTool AI — Launch Spot
Format: 9:16
Length: 30 seconds
Scenes: 3

Cast:
@founder — founder, 32, calm and confident
@customer — customer, 28, sceptical, then convinced

Locations:
@home-office — bright loft office, large window front

Goal: Show that one creator replaces an entire studio with AdTool AI.

Scene 1 — The doubt
Duration: 10 seconds
Location: @home-office
Cast: @customer
Camera: medium-close-up, eye-level, slow-push-in, soft-window
Action: She scrolls her feed, leans back, frowning.
Voiceover: "New content every week — and you do all of it alone."

Scene 2 — The turn
Duration: 12 seconds
Location: @home-office
Cast: @founder, @customer
Camera: medium, three-quarter, tracking, natural
Dialogue:
@founder: "You don't need a team. You need a studio."
@customer: "And that really runs in one tool?"
@founder: "Briefing in, finished spot out."

Scene 3 — The proof
Duration: 8 seconds
Location: @home-office
Cast: @founder
Camera: close-up, frontal, static, golden-hour
Action: She turns the screen towards camera, nods contentedly.
Voiceover: "One creator. An entire studio."

Voice: ElevenLabs, eleven_multilingual_v2, stability 0.45, speed 1.0
Captions: on, position bottom, max 4 words, highlight #F5C76A
Negative prompt: no logos, no on-screen text, no bystanders`;

const TEMPLATE_ES = `Proyecto: AdTool AI — Spot de lanzamiento
Formato: 9:16
Duración: 30 segundos
Escenas: 3

Reparto:
@founder — fundadora, 32, serena y segura
@cliente — clienta, 28, escéptica y luego convencida

Lugares:
@home-office — oficina loft luminosa, gran ventanal

Objetivo: Mostrar que un creador sustituye a todo un estudio con AdTool AI.

Escena 1 — La duda
Duración: 10 segundos
Lugar: @home-office
Reparto: @cliente
Cámara: medium-close-up, eye-level, slow-push-in, soft-window
Acción: Ella desliza su feed, se recuesta, frunce el ceño.
Voz en off: "Contenido nuevo cada semana — y lo haces todo sola."

Escena 2 — El giro
Duración: 12 segundos
Lugar: @home-office
Reparto: @founder, @cliente
Cámara: medium, three-quarter, tracking, natural
Diálogo:
@founder: "No necesitas un equipo. Necesitas un estudio."
@cliente: "¿Y eso funciona de verdad en una sola herramienta?"
@founder: "Entra el briefing, sale el spot terminado."

Escena 3 — La prueba
Duración: 8 segundos
Lugar: @home-office
Reparto: @founder
Cámara: close-up, frontal, static, golden-hour
Acción: Gira la pantalla hacia la cámara y asiente satisfecha.
Voz en off: "Un creador. Todo un estudio."

Voz: ElevenLabs, eleven_multilingual_v2, stability 0.45, speed 1.0
Subtítulos: activados, posición bottom, máx. 4 palabras, resaltado #F5C76A
Prompt negativo: sin logos, sin texto en pantalla, sin transeúntes`;

/** The full sample briefing in the active UI language. */
export function getBriefingTemplate(): string {
  return tx({ de: TEMPLATE_DE, en: TEMPLATE_EN, es: TEMPLATE_ES });
}

/** Raw templates — used by tests and tooling that must not depend on UI state. */
export const BRIEFING_TEMPLATES = { de: TEMPLATE_DE, en: TEMPLATE_EN, es: TEMPLATE_ES } as const;

export interface GuideRow {
  /** The literal line prefix the customer writes. */
  key: string;
  /** What it fills downstream. */
  effect: string;
}

/** "Which line fills what in the storyboard". */
export function getBriefingFieldReference(): GuideRow[] {
  return [
    {
      key: tx({ de: 'Länge: 30 Sekunden', en: 'Length: 30 seconds', es: 'Duración: 30 segundos' }),
      effect: tx({
        de: 'Gesamtlänge des Spots — verteilt die Sekunden auf die Szenen.',
        en: 'Total spot length — distributes the seconds across scenes.',
        es: 'Duración total del spot — reparte los segundos entre las escenas.',
      }),
    },
    {
      key: tx({ de: 'Szenen: 3', en: 'Scenes: 3', es: 'Escenas: 3' }),
      effect: tx({
        de: 'Erzwingt exakt diese Szenenanzahl im Storyboard.',
        en: 'Forces exactly this number of scenes in the storyboard.',
        es: 'Fuerza exactamente este número de escenas en el storyboard.',
      }),
    },
    {
      key: '@founder, @home-office',
      effect: tx({
        de: 'Wird gegen Cast & World aufgelöst und als Charakter/Ort an die Szene gehängt.',
        en: 'Resolved against Cast & World and attached to the scene as character/location.',
        es: 'Se resuelve contra Cast & World y se adjunta a la escena como personaje/lugar.',
      }),
    },
    {
      key: tx({ de: 'Dauer: 10 Sekunden', en: 'Duration: 10 seconds', es: 'Duración: 10 segundos' }),
      effect: tx({
        de: 'Länge der einzelnen Szene.',
        en: 'Length of the individual scene.',
        es: 'Duración de la escena individual.',
      }),
    },
    {
      key: tx({ de: 'Kamera: close-up, eye-level, …', en: 'Camera: close-up, eye-level, …', es: 'Cámara: close-up, eye-level, …' }),
      effect: tx({
        de: 'Shot-Direktion (Bildausschnitt, Winkel, Bewegung, Licht) — nur festes Vokabular.',
        en: 'Shot direction (framing, angle, movement, lighting) — fixed vocabulary only.',
        es: 'Dirección de plano (encuadre, ángulo, movimiento, luz) — solo vocabulario fijo.',
      }),
    },
    {
      key: '@founder: "…"',
      effect: tx({
        de: 'Dialogzeile mit Sprecherzuordnung — Basis für Lip-Sync.',
        en: 'Dialogue line with speaker assignment — the basis for lip-sync.',
        es: 'Línea de diálogo con hablante asignado — base para el lip-sync.',
      }),
    },
    {
      key: tx({ de: 'Voiceover: "…"', en: 'Voiceover: "…"', es: 'Voz en off: "…"' }),
      effect: tx({
        de: 'Off-Text der Szene — wird für Sprachausgabe und Untertitel genutzt.',
        en: 'Scene off-text — used for voice output and captions.',
        es: 'Texto en off de la escena — se usa para la voz y los subtítulos.',
      }),
    },
    {
      key: tx({ de: 'Stimme / Untertitel / Negative Prompt', en: 'Voice / Captions / Negative prompt', es: 'Voz / Subtítulos / Prompt negativo' }),
      effect: tx({
        de: 'Globale Einstellungen für das ganze Projekt.',
        en: 'Global settings for the whole project.',
        es: 'Ajustes globales para todo el proyecto.',
      }),
    },
  ];
}

/** The five formulations that reliably break the transfer. */
export function getBriefingPitfalls(): string[] {
  return [
    tx({
      de: 'Namen ohne @ — „Lisa im Büro" wird nicht gegen Cast & World aufgelöst.',
      en: 'Names without @ — "Lisa in the office" is not resolved against Cast & World.',
      es: 'Nombres sin @ — "Lisa en la oficina" no se resuelve contra Cast & World.',
    }),
    tx({
      de: 'Länge und Szenenanzahl nur im Fließtext statt als eigene Zeilen.',
      en: 'Length and scene count only in prose instead of their own lines.',
      es: 'Duración y número de escenas solo en el texto, no en líneas propias.',
    }),
    tx({
      de: 'Kameraprosa („schöne langsame Fahrt") statt Vokabular wie slow-push-in.',
      en: 'Camera prose ("a nice slow move") instead of vocabulary like slow-push-in.',
      es: 'Prosa de cámara ("un bonito movimiento lento") en vez de slow-push-in.',
    }),
    tx({
      de: 'Dialog ohne Sprecher-Mention — die Zeile landet als Voiceover statt als Lip-Sync.',
      en: 'Dialogue without a speaker mention — the line becomes voiceover instead of lip-sync.',
      es: 'Diálogo sin mención de hablante — la línea acaba como voz en off, no lip-sync.',
    }),
    tx({
      de: 'Hooks, CTAs oder Untertitel in der Szenenbeschreibung — Text im Bild wird ignoriert.',
      en: 'Hooks, CTAs or captions inside the scene description — on-screen text is ignored.',
      es: 'Hooks, CTAs o subtítulos dentro de la escena — el texto en pantalla se ignora.',
    }),
  ];
}
