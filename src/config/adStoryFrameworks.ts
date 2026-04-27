/**
 * Ad Story Frameworks — 7 advertising dramaturgies
 *
 * Each framework defines a sequence of SceneType beats, recommended pacing,
 * and per-scene scripting hints for the Lovable AI script generator.
 */

import type { SceneType } from '@/types/video-composer';

// Cinematic preset IDs are referenced by string to stay decoupled from the preset module.
type CinematicPresetId = string;

export type AdFrameworkId =
  | 'problem-solution'
  | 'heros-journey'
  | 'testimonial'
  | 'demo-feature'
  | 'lifestyle-aspirational'
  | 'comparison-switch'
  | 'brand-manifesto';

export type AdFormatId = 'tvc-15' | 'tvc-30' | 'tvc-60' | 'longform';
export type AdGoalId = 'awareness' | 'conversion' | 'brand-build' | 'launch';

export interface FrameworkBeat {
  sceneType: SceneType;
  // Relative weight (used to distribute total duration across beats)
  weight: number;
  // Hint passed to the script generator
  scriptHint: { de: string; en: string; es: string };
  // Default cinematic preset for this beat (links to existing system)
  defaultCinematicPresetId?: CinematicPresetId;
}

export interface AdStoryFramework {
  id: AdFrameworkId;
  glyph: string;
  label: { de: string; en: string; es: string };
  desc: { de: string; en: string; es: string };
  bestFormats: AdFormatId[];
  bestGoals: AdGoalId[];
  beats: FrameworkBeat[];
}

export const AD_STORY_FRAMEWORKS: AdStoryFramework[] = [
  {
    id: 'problem-solution',
    glyph: '🎯',
    label: {
      de: 'Problem → Lösung',
      en: 'Problem → Solution',
      es: 'Problema → Solución',
    },
    desc: {
      de: 'Klassiker. Zeige ein Pain Point, präsentiere die Lösung, beweise sie, rufe zur Aktion auf.',
      en: 'Classic. Show a pain point, present the solution, prove it, drive action.',
      es: 'Clásico. Muestra el problema, presenta la solución, demuéstrala, llama a la acción.',
    },
    bestFormats: ['tvc-15', 'tvc-30'],
    bestGoals: ['conversion'],
    beats: [
      {
        sceneType: 'hook',
        weight: 1,
        scriptHint: {
          de: 'Pattern Interrupt — visuell oder akustisch fesseln in 2 Sekunden.',
          en: 'Pattern interrupt — capture attention visually or sonically within 2 seconds.',
          es: 'Pattern interrupt — captar atención visual o sonora en 2 segundos.',
        },
        defaultCinematicPresetId: 'commercial-glossy',
      },
      {
        sceneType: 'problem',
        weight: 2,
        scriptHint: {
          de: 'Konkretes, relatable Pain Point. Keine Übertreibung.',
          en: 'Concrete, relatable pain point. No exaggeration.',
          es: 'Punto de dolor concreto y relatable. Sin exagerar.',
        },
        defaultCinematicPresetId: 'noir',
      },
      {
        sceneType: 'solution',
        weight: 3,
        scriptHint: {
          de: 'Hero Reveal des Produkts/Service. Eine USP klar zeigen.',
          en: 'Hero reveal of the product/service. Show one USP clearly.',
          es: 'Revelación heroica del producto/servicio. Mostrar una USP claramente.',
        },
        defaultCinematicPresetId: 'commercial-glossy',
      },
      {
        sceneType: 'social-proof',
        weight: 1.5,
        scriptHint: {
          de: 'Kurze Zahl, Zitat oder Testimonial-Cut.',
          en: 'Brief number, quote or testimonial cut.',
          es: 'Cifra breve, cita o testimonio.',
        },
        defaultCinematicPresetId: 'documentary',
      },
      {
        sceneType: 'cta',
        weight: 1.5,
        scriptHint: {
          de: 'Klare Handlungsaufforderung. Logo + URL/CTA.',
          en: 'Clear call to action. Logo + URL/CTA.',
          es: 'Llamada a la acción clara. Logo + URL/CTA.',
        },
        defaultCinematicPresetId: 'commercial-glossy',
      },
    ],
  },
  {
    id: 'heros-journey',
    glyph: '⚔️',
    label: {
      de: 'Hero’s Journey',
      en: "Hero's Journey",
      es: 'El Viaje del Héroe',
    },
    desc: {
      de: 'Längere Story-Bögen. Charakter trifft Hindernis, findet Hilfe, transformiert sich.',
      en: 'Longer narrative arc. Character meets obstacle, finds help, transforms.',
      es: 'Arco narrativo más largo. El personaje encuentra obstáculo, ayuda, se transforma.',
    },
    bestFormats: ['tvc-30', 'tvc-60', 'longform'],
    bestGoals: ['brand-build', 'awareness'],
    beats: [
      {
        sceneType: 'hook',
        weight: 1,
        scriptHint: {
          de: 'Stelle den Charakter in Sekunde 1 vor. Wer ist diese Person?',
          en: 'Introduce the character in second 1. Who is this person?',
          es: 'Presenta al personaje en el segundo 1. ¿Quién es esta persona?',
        },
        defaultCinematicPresetId: 'arthouse',
      },
      {
        sceneType: 'problem',
        weight: 2,
        scriptHint: {
          de: 'Konflikt oder Wendepunkt. Was steht auf dem Spiel?',
          en: 'Conflict or turning point. What is at stake?',
          es: 'Conflicto o punto de inflexión. ¿Qué está en juego?',
        },
        defaultCinematicPresetId: 'noir',
      },
      {
        sceneType: 'demo',
        weight: 2,
        scriptHint: {
          de: 'Charakter entdeckt das Produkt/die Lösung. Show, don’t tell.',
          en: 'Character discovers the product/solution. Show, don’t tell.',
          es: 'El personaje descubre el producto/solución. Mostrar, no contar.',
        },
        defaultCinematicPresetId: 'cinematic-warm',
      },
      {
        sceneType: 'solution',
        weight: 2.5,
        scriptHint: {
          de: 'Transformation. Vorher/Nachher-Moment ohne Klischee.',
          en: 'Transformation. Before/after moment without cliché.',
          es: 'Transformación. Momento antes/después sin clichés.',
        },
        defaultCinematicPresetId: 'cinematic-warm',
      },
      {
        sceneType: 'cta',
        weight: 1,
        scriptHint: {
          de: 'Subtile Marken-Signatur. Tagline statt harter Verkauf.',
          en: 'Subtle brand signature. Tagline over hard sell.',
          es: 'Firma de marca sutil. Eslogan sobre venta dura.',
        },
        defaultCinematicPresetId: 'commercial-glossy',
      },
    ],
  },
  {
    id: 'testimonial',
    glyph: '🗣️',
    label: { de: 'Testimonial', en: 'Testimonial', es: 'Testimonial' },
    desc: {
      de: 'Echte (oder echt wirkende) Person erzählt von ihrer Erfahrung.',
      en: 'Real (or real-feeling) person shares their experience.',
      es: 'Persona real (o que parece real) comparte su experiencia.',
    },
    bestFormats: ['tvc-15', 'tvc-30'],
    bestGoals: ['conversion', 'brand-build'],
    beats: [
      {
        sceneType: 'hook',
        weight: 1,
        scriptHint: {
          de: 'Eröffnungs-Statement der Person. Direkt in die Kamera.',
          en: 'Opening statement from the person. Direct to camera.',
          es: 'Declaración de apertura de la persona. Directo a cámara.',
        },
        defaultCinematicPresetId: 'documentary',
      },
      {
        sceneType: 'social-proof',
        weight: 3,
        scriptHint: {
          de: 'Konkrete Erfahrung. Zahl, Datum oder Detail einbauen.',
          en: 'Concrete experience. Include a number, date or detail.',
          es: 'Experiencia concreta. Incluir cifra, fecha o detalle.',
        },
        defaultCinematicPresetId: 'documentary',
      },
      {
        sceneType: 'demo',
        weight: 2,
        scriptHint: {
          de: 'B-Roll, das die Aussage visuell stützt.',
          en: 'B-roll that visually supports the statement.',
          es: 'Material B que respalda visualmente la declaración.',
        },
        defaultCinematicPresetId: 'arthouse',
      },
      {
        sceneType: 'cta',
        weight: 1,
        scriptHint: {
          de: 'Call to Action mit Vertrauenssignal (Garantie, Anzahl Kunden etc.).',
          en: 'CTA with trust signal (guarantee, customer count, etc.).',
          es: 'CTA con señal de confianza (garantía, número de clientes, etc.).',
        },
        defaultCinematicPresetId: 'commercial-glossy',
      },
    ],
  },
  {
    id: 'demo-feature',
    glyph: '🔧',
    label: {
      de: 'Demo / Feature Showcase',
      en: 'Demo / Feature Showcase',
      es: 'Demostración / Características',
    },
    desc: {
      de: 'Produkt oder Service Schritt für Schritt zeigen. Funktional.',
      en: 'Show product or service step by step. Functional.',
      es: 'Mostrar producto o servicio paso a paso. Funcional.',
    },
    bestFormats: ['tvc-15', 'tvc-30'],
    bestGoals: ['conversion', 'launch'],
    beats: [
      {
        sceneType: 'hook',
        weight: 1,
        scriptHint: {
          de: 'Zeige das Produkt sofort. Kein Aufbau.',
          en: 'Show the product immediately. No build-up.',
          es: 'Muestra el producto de inmediato. Sin preámbulos.',
        },
        defaultCinematicPresetId: 'commercial-glossy',
      },
      {
        sceneType: 'demo',
        weight: 3,
        scriptHint: {
          de: 'Hauptfeature in Aktion. Macro-Shot oder Split-Screen.',
          en: 'Main feature in action. Macro shot or split screen.',
          es: 'Característica principal en acción. Macro o pantalla dividida.',
        },
        defaultCinematicPresetId: 'commercial-glossy',
      },
      {
        sceneType: 'demo',
        weight: 2,
        scriptHint: {
          de: 'Zweite Funktion oder Kontextnutzung.',
          en: 'Second function or contextual use.',
          es: 'Segunda función o uso contextual.',
        },
        defaultCinematicPresetId: 'commercial-glossy',
      },
      {
        sceneType: 'cta',
        weight: 1.5,
        scriptHint: {
          de: 'Preis oder Verfügbarkeit + CTA.',
          en: 'Price or availability + CTA.',
          es: 'Precio o disponibilidad + CTA.',
        },
        defaultCinematicPresetId: 'commercial-glossy',
      },
    ],
  },
  {
    id: 'lifestyle-aspirational',
    glyph: '🌴',
    label: {
      de: 'Lifestyle / Aspirational',
      en: 'Lifestyle / Aspirational',
      es: 'Lifestyle / Aspiracional',
    },
    desc: {
      de: 'Welt zeigen, in der das Produkt selbstverständlich ist. Stimmung > Information.',
      en: 'Show a world where the product is natural. Mood > information.',
      es: 'Muestra un mundo donde el producto es natural. Atmósfera > información.',
    },
    bestFormats: ['tvc-30', 'tvc-60'],
    bestGoals: ['brand-build', 'awareness'],
    beats: [
      {
        sceneType: 'hook',
        weight: 1.5,
        scriptHint: {
          de: 'Atmosphärisches Bild. Goldene Stunde, wide shot.',
          en: 'Atmospheric image. Golden hour, wide shot.',
          es: 'Imagen atmosférica. Hora dorada, plano amplio.',
        },
        defaultCinematicPresetId: 'cinematic-warm',
      },
      {
        sceneType: 'solution',
        weight: 2.5,
        scriptHint: {
          de: 'Menschen nutzen das Produkt beiläufig — kein Posing.',
          en: 'People use the product casually — no posing.',
          es: 'Personas usan el producto de forma casual — sin posar.',
        },
        defaultCinematicPresetId: 'cinematic-warm',
      },
      {
        sceneType: 'solution',
        weight: 2,
        scriptHint: {
          de: 'Detail-Cut. Hand, Textur, Bewegung.',
          en: 'Detail cut. Hand, texture, motion.',
          es: 'Plano detalle. Mano, textura, movimiento.',
        },
        defaultCinematicPresetId: 'arthouse',
      },
      {
        sceneType: 'cta',
        weight: 1,
        scriptHint: {
          de: 'Subtile Marken-Endcard. Keine Preise.',
          en: 'Subtle brand end card. No prices.',
          es: 'Cierre de marca sutil. Sin precios.',
        },
        defaultCinematicPresetId: 'commercial-glossy',
      },
    ],
  },
  {
    id: 'comparison-switch',
    glyph: '⚖️',
    label: {
      de: 'Vergleich / Wechsel',
      en: 'Comparison / Switch',
      es: 'Comparación / Cambio',
    },
    desc: {
      de: 'Status quo vs. besseres Alternative. Direkter Aufruf zum Wechsel.',
      en: 'Status quo vs. better alternative. Direct call to switch.',
      es: 'Statu quo vs. mejor alternativa. Llamada directa al cambio.',
    },
    bestFormats: ['tvc-30'],
    bestGoals: ['conversion'],
    beats: [
      {
        sceneType: 'hook',
        weight: 1,
        scriptHint: {
          de: 'Frustration mit Status quo. Generisch genug, um nicht angreifbar zu sein.',
          en: 'Frustration with status quo. Generic enough to avoid liability.',
          es: 'Frustración con el statu quo. Genérico para evitar responsabilidad.',
        },
        defaultCinematicPresetId: 'noir',
      },
      {
        sceneType: 'problem',
        weight: 2,
        scriptHint: {
          de: 'Klar machen, was schiefläuft (NIE Wettbewerber namentlich nennen).',
          en: 'Make clear what is wrong (NEVER name competitors).',
          es: 'Aclarar qué falla (NUNCA nombrar competidores).',
        },
        defaultCinematicPresetId: 'noir',
      },
      {
        sceneType: 'solution',
        weight: 2.5,
        scriptHint: {
          de: 'Eigenes Produkt als klare Verbesserung positionieren.',
          en: 'Position own product as clear improvement.',
          es: 'Posicionar el propio producto como clara mejora.',
        },
        defaultCinematicPresetId: 'commercial-glossy',
      },
      {
        sceneType: 'social-proof',
        weight: 1.5,
        scriptHint: {
          de: 'Wechsler-Zahl oder Garantie.',
          en: 'Switcher count or guarantee.',
          es: 'Número de cambiadores o garantía.',
        },
        defaultCinematicPresetId: 'documentary',
      },
      {
        sceneType: 'cta',
        weight: 1,
        scriptHint: {
          de: 'Aktiver Wechsel-Aufruf mit Anreiz.',
          en: 'Active switch call with incentive.',
          es: 'Llamada activa al cambio con incentivo.',
        },
        defaultCinematicPresetId: 'commercial-glossy',
      },
    ],
  },
  {
    id: 'brand-manifesto',
    glyph: '🏛️',
    label: {
      de: 'Brand Manifesto',
      en: 'Brand Manifesto',
      es: 'Manifiesto de Marca',
    },
    desc: {
      de: 'Werte und Haltung der Marke. Pathos. Kein Produkt-Push.',
      en: 'Brand values and stance. Pathos. No product push.',
      es: 'Valores y postura de la marca. Pathos. Sin empuje de producto.',
    },
    bestFormats: ['tvc-60', 'longform'],
    bestGoals: ['brand-build', 'launch'],
    beats: [
      {
        sceneType: 'hook',
        weight: 1.5,
        scriptHint: {
          de: 'Provokante These oder Frage zur Welt.',
          en: 'Provocative thesis or question about the world.',
          es: 'Tesis o pregunta provocadora sobre el mundo.',
        },
        defaultCinematicPresetId: 'arthouse',
      },
      {
        sceneType: 'solution',
        weight: 3,
        scriptHint: {
          de: 'Marken-Werte als Antwort. Bilder von Menschen, Bewegung, Welt.',
          en: 'Brand values as answer. Images of people, motion, world.',
          es: 'Valores de marca como respuesta. Imágenes de personas, movimiento, mundo.',
        },
        defaultCinematicPresetId: 'cinematic-warm',
      },
      {
        sceneType: 'solution',
        weight: 2,
        scriptHint: {
          de: 'Produkt erscheint kurz als Symbol — nicht als Verkauf.',
          en: 'Product appears briefly as symbol — not sale.',
          es: 'El producto aparece brevemente como símbolo, no venta.',
        },
        defaultCinematicPresetId: 'arthouse',
      },
      {
        sceneType: 'cta',
        weight: 1,
        scriptHint: {
          de: 'Tagline + Logo. Keine URL, keine Preise.',
          en: 'Tagline + logo. No URL, no prices.',
          es: 'Eslogan + logo. Sin URL, sin precios.',
        },
        defaultCinematicPresetId: 'commercial-glossy',
      },
    ],
  },
];

export function getAdStoryFramework(id: AdFrameworkId): AdStoryFramework | undefined {
  return AD_STORY_FRAMEWORKS.find((f) => f.id === id);
}

/**
 * Distribute a total duration in seconds across the framework's beats
 * proportional to each beat's weight. Returns per-beat durations rounded
 * to the nearest 0.5s with a minimum of 1.5s per beat.
 */
export function distributeFrameworkDurations(
  framework: AdStoryFramework,
  totalSeconds: number,
): number[] {
  const totalWeight = framework.beats.reduce((sum, b) => sum + b.weight, 0);
  const minPerBeat = 1.5;
  const usableTotal = Math.max(totalSeconds, framework.beats.length * minPerBeat);

  return framework.beats.map((beat) => {
    const raw = (beat.weight / totalWeight) * usableTotal;
    const rounded = Math.max(minPerBeat, Math.round(raw * 2) / 2);
    return rounded;
  });
}

export function getFormatSeconds(format: AdFormatId): number {
  switch (format) {
    case 'tvc-15':
      return 15;
    case 'tvc-30':
      return 30;
    case 'tvc-60':
      return 60;
    case 'longform':
      return 75;
  }
}
