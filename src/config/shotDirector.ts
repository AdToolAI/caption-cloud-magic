/**
 * Shot Director — cinematic prompt-builder constants.
 *
 * Each option carries an English `promptFragment` (kept in English by core rule:
 * "visual prompts for AI models MUST remain in English for output quality")
 * and localized labels/descriptions for the UI.
 */

export type ShotCategory = 'angle' | 'lighting' | 'movement' | 'framing';

export interface ShotOption {
  id: string;
  /** English prompt fragment appended verbatim to the user's prompt. */
  promptFragment: string;
  label: { en: string; de: string; es: string };
  description: { en: string; de: string; es: string };
}

export const CAMERA_ANGLES: ShotOption[] = [
  {
    id: 'eye-level',
    promptFragment: 'shot at eye level',
    label: { en: 'Eye Level', de: 'Augenhöhe', es: 'A nivel de los ojos' },
    description: { en: 'Neutral, natural perspective.', de: 'Neutrale, natürliche Perspektive.', es: 'Perspectiva neutral.' },
  },
  {
    id: 'low-angle',
    promptFragment: 'shot from a low angle looking up',
    label: { en: 'Low Angle', de: 'Froschperspektive', es: 'Ángulo bajo' },
    description: { en: 'Makes the subject powerful.', de: 'Wirkt mächtig & heroisch.', es: 'Sujeto poderoso.' },
  },
  {
    id: 'high-angle',
    promptFragment: 'shot from a high angle looking down',
    label: { en: 'High Angle', de: 'Vogelperspektive', es: 'Ángulo alto' },
    description: { en: 'Subject feels small or vulnerable.', de: 'Subjekt wirkt klein.', es: 'Sujeto vulnerable.' },
  },
  {
    id: 'dutch-tilt',
    promptFragment: 'shot with a dutch tilt',
    label: { en: 'Dutch Tilt', de: 'Schräglage', es: 'Inclinación holandesa' },
    description: { en: 'Tense, off-balance.', de: 'Spannung, Unruhe.', es: 'Tensión y desequilibrio.' },
  },
  {
    id: 'birds-eye',
    promptFragment: "shot from a bird's eye view directly above",
    label: { en: "Bird's Eye", de: 'Bird-Eye', es: 'Vista de pájaro' },
    description: { en: 'Top-down drone perspective.', de: 'Direkt von oben.', es: 'Vista desde arriba.' },
  },
  {
    id: 'worms-eye',
    promptFragment: "shot from a worm's eye view from the ground",
    label: { en: "Worm's Eye", de: 'Bodensicht', es: 'Vista de gusano' },
    description: { en: 'Extreme low-angle from the ground.', de: 'Vom Boden aufwärts.', es: 'Desde el suelo.' },
  },
  {
    id: 'over-shoulder',
    promptFragment: 'over-the-shoulder shot',
    label: { en: 'Over-the-Shoulder', de: 'Über-die-Schulter', es: 'Sobre el hombro' },
    description: { en: 'Classic dialogue framing.', de: 'Klassisch für Dialoge.', es: 'Para diálogos.' },
  },
  {
    id: 'pov',
    promptFragment: 'first-person POV shot',
    label: { en: 'POV', de: 'POV', es: 'POV' },
    description: { en: 'First-person perspective.', de: 'Ich-Perspektive.', es: 'Primera persona.' },
  },
];

export const LIGHTING_MOODS: ShotOption[] = [
  {
    id: 'golden-hour',
    promptFragment: 'lit by warm golden hour sunlight with long shadows',
    label: { en: 'Golden Hour', de: 'Goldene Stunde', es: 'Hora dorada' },
    description: { en: 'Warm, soft, cinematic sun.', de: 'Warmes Sonnenlicht.', es: 'Sol cálido.' },
  },
  {
    id: 'blue-hour',
    promptFragment: 'lit by cool blue hour twilight',
    label: { en: 'Blue Hour', de: 'Blaue Stunde', es: 'Hora azul' },
    description: { en: 'Cool dusk twilight.', de: 'Kühle Dämmerung.', es: 'Crepúsculo frío.' },
  },
  {
    id: 'hard-noir',
    promptFragment: 'hard noir lighting with high contrast deep shadows',
    label: { en: 'Hard Noir', de: 'Film Noir', es: 'Noir duro' },
    description: { en: 'High-contrast, dramatic shadows.', de: 'Harte Kontraste.', es: 'Sombras dramáticas.' },
  },
  {
    id: 'soft-studio',
    promptFragment: 'soft diffused studio lighting',
    label: { en: 'Soft Studio', de: 'Weiches Studio', es: 'Estudio suave' },
    description: { en: 'Even, flattering studio light.', de: 'Gleichmäßig & weich.', es: 'Luz uniforme.' },
  },
  {
    id: 'neon-cyberpunk',
    promptFragment: 'lit by vibrant neon cyberpunk lighting in pink and cyan',
    label: { en: 'Neon Cyberpunk', de: 'Neon Cyberpunk', es: 'Neón Cyberpunk' },
    description: { en: 'Pink + cyan neon.', de: 'Pink & Cyan Neon.', es: 'Neón rosa y cian.' },
  },
  {
    id: 'candlelight',
    promptFragment: 'lit by warm flickering candlelight',
    label: { en: 'Candlelight', de: 'Kerzenlicht', es: 'Luz de velas' },
    description: { en: 'Intimate flickering warmth.', de: 'Intim & flackernd.', es: 'Cálido íntimo.' },
  },
  {
    id: 'overcast-natural',
    promptFragment: 'lit by soft overcast natural daylight',
    label: { en: 'Overcast Natural', de: 'Bedeckter Himmel', es: 'Cielo nublado' },
    description: { en: 'Soft even daylight, no shadows.', de: 'Diffuses Tageslicht.', es: 'Luz natural difusa.' },
  },
  {
    id: 'backlit',
    promptFragment: 'backlit silhouette with strong rim light',
    label: { en: 'Backlit Silhouette', de: 'Gegenlicht', es: 'Contraluz' },
    description: { en: 'Strong rim light, silhouette.', de: 'Silhouette gegen Licht.', es: 'Luz por detrás.' },
  },
  {
    id: 'volumetric',
    promptFragment: 'volumetric god-rays cutting through atmospheric haze',
    label: { en: 'Volumetric Rays', de: 'Lichtstrahlen', es: 'Rayos volumétricos' },
    description: { en: 'God-rays through haze.', de: 'Strahlen durch Nebel.', es: 'Rayos atmosféricos.' },
  },
  {
    id: 'moonlit',
    promptFragment: 'lit by cool silver moonlight',
    label: { en: 'Moonlit', de: 'Mondlicht', es: 'Luz de luna' },
    description: { en: 'Cool nighttime silver.', de: 'Kühles Mondlicht.', es: 'Plata nocturna.' },
  },
];

export const CAMERA_MOVEMENTS: ShotOption[] = [
  {
    id: 'static',
    promptFragment: 'static locked-down camera',
    label: { en: 'Static Lockdown', de: 'Statisch', es: 'Estática' },
    description: { en: 'No movement.', de: 'Keine Bewegung.', es: 'Sin movimiento.' },
  },
  {
    id: 'push-in',
    promptFragment: 'slow cinematic push-in',
    label: { en: 'Slow Push-In', de: 'Langsamer Push-In', es: 'Acercamiento lento' },
    description: { en: 'Slow zoom toward subject.', de: 'Langsames Heranfahren.', es: 'Zoom hacia el sujeto.' },
  },
  {
    id: 'pull-out',
    promptFragment: 'slow pull-out reveal',
    label: { en: 'Pull-Out Reveal', de: 'Pull-Out Reveal', es: 'Alejamiento revelador' },
    description: { en: 'Reveals the wider scene.', de: 'Zeigt die ganze Szene.', es: 'Revela la escena.' },
  },
  {
    id: 'dolly-left',
    promptFragment: 'smooth dolly movement to the left',
    label: { en: 'Dolly Left', de: 'Dolly links', es: 'Dolly izquierda' },
    description: { en: 'Tracks horizontally left.', de: 'Seitlich nach links.', es: 'Hacia la izquierda.' },
  },
  {
    id: 'dolly-right',
    promptFragment: 'smooth dolly movement to the right',
    label: { en: 'Dolly Right', de: 'Dolly rechts', es: 'Dolly derecha' },
    description: { en: 'Tracks horizontally right.', de: 'Seitlich nach rechts.', es: 'Hacia la derecha.' },
  },
  {
    id: 'crane-up',
    promptFragment: 'crane shot rising upward',
    label: { en: 'Crane Up', de: 'Kran aufwärts', es: 'Grúa hacia arriba' },
    description: { en: 'Rises from low to high.', de: 'Steigt nach oben.', es: 'Sube en altura.' },
  },
  {
    id: 'crane-down',
    promptFragment: 'crane shot descending downward',
    label: { en: 'Crane Down', de: 'Kran abwärts', es: 'Grúa hacia abajo' },
    description: { en: 'Drops from high to low.', de: 'Senkt sich ab.', es: 'Desciende.' },
  },
  {
    id: 'orbit-left',
    promptFragment: 'orbital camera movement circling counter-clockwise',
    label: { en: 'Orbit Left', de: 'Orbit links', es: 'Órbita izquierda' },
    description: { en: 'Circles around subject.', de: 'Kreist um Subjekt.', es: 'Rodea al sujeto.' },
  },
  {
    id: 'orbit-right',
    promptFragment: 'orbital camera movement circling clockwise',
    label: { en: 'Orbit Right', de: 'Orbit rechts', es: 'Órbita derecha' },
    description: { en: 'Circles clockwise.', de: 'Kreist im Uhrzeigersinn.', es: 'Sentido horario.' },
  },
  {
    id: 'handheld',
    promptFragment: 'handheld camera with subtle natural shake',
    label: { en: 'Handheld', de: 'Handkamera', es: 'Cámara en mano' },
    description: { en: 'Documentary-style shake.', de: 'Doku-Stil Wackeln.', es: 'Estilo documental.' },
  },
];

export const SHOT_FRAMINGS: ShotOption[] = [
  {
    id: 'extreme-wide',
    promptFragment: 'extreme wide establishing shot',
    label: { en: 'Extreme Wide', de: 'Extrem weit', es: 'Plano general extremo' },
    description: { en: 'Vast landscape scale.', de: 'Riesige Landschaft.', es: 'Paisaje vasto.' },
  },
  {
    id: 'wide',
    promptFragment: 'wide shot showing full body and environment',
    label: { en: 'Wide Shot', de: 'Weit', es: 'Plano general' },
    description: { en: 'Full body + surroundings.', de: 'Ganzer Körper + Umfeld.', es: 'Cuerpo + entorno.' },
  },
  {
    id: 'medium',
    promptFragment: 'medium shot from waist up',
    label: { en: 'Medium Shot', de: 'Halbtotale', es: 'Plano medio' },
    description: { en: 'Waist up.', de: 'Ab Hüfte aufwärts.', es: 'De cintura para arriba.' },
  },
  {
    id: 'medium-close',
    promptFragment: 'medium close-up from chest up',
    label: { en: 'Medium Close-Up', de: 'Nah', es: 'Plano medio corto' },
    description: { en: 'Chest up.', de: 'Ab Brust aufwärts.', es: 'De pecho para arriba.' },
  },
  {
    id: 'close-up',
    promptFragment: 'close-up shot focused on the face',
    label: { en: 'Close-Up', de: 'Großaufnahme', es: 'Primer plano' },
    description: { en: 'Face only.', de: 'Nur Gesicht.', es: 'Solo el rostro.' },
  },
  {
    id: 'extreme-close',
    promptFragment: 'extreme close-up on detail like eyes or hands',
    label: { en: 'Extreme Close-Up', de: 'Extreme Großaufnahme', es: 'Primerísimo primer plano' },
    description: { en: 'Eyes / lips / detail.', de: 'Augen / Lippen / Detail.', es: 'Detalle extremo.' },
  },
  {
    id: 'two-shot',
    promptFragment: 'two-shot framing both subjects together',
    label: { en: 'Two-Shot', de: 'Two-Shot', es: 'Plano de dos' },
    description: { en: 'Two subjects in frame.', de: 'Zwei Personen im Bild.', es: 'Dos sujetos.' },
  },
  {
    id: 'establishing',
    promptFragment: 'establishing shot setting the scene location',
    label: { en: 'Establishing', de: 'Establishing-Shot', es: 'Plano de situación' },
    description: { en: 'Sets scene location.', de: 'Etabliert den Ort.', es: 'Establece el lugar.' },
  },
];

export const SHOT_CATEGORIES: Record<ShotCategory, ShotOption[]> = {
  angle: CAMERA_ANGLES,
  lighting: LIGHTING_MOODS,
  movement: CAMERA_MOVEMENTS,
  framing: SHOT_FRAMINGS,
};

export type ShotSelection = Partial<Record<ShotCategory, string>>;

export const findOption = (
  category: ShotCategory,
  id: string | undefined,
): ShotOption | undefined => {
  if (!id) return undefined;
  return SHOT_CATEGORIES[category].find((o) => o.id === id);
};
