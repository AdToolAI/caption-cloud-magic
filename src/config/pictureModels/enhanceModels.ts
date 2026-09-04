import type { PictureModelDefinition } from './types';

/**
 * Enhance models (Upscale / Restore / Colorize).
 *
 * Topaz entries stay `enabled: false` until the real cost + quality test run
 * passed and the final prices were approved.
 */
export const ENHANCE_MODELS: PictureModelDefinition[] = [
  {
    id: 'clarity-pro',
    name: 'Clarity Pro',
    vendor: 'philz1337x',
    provider: 'replicate',
    providerModelId:
      'philz1337x/clarity-upscaler:dfad41707589d68ecdccd1dfa600d55a208f9310748e44bfe35b4a6291453d5e',
    category: 'enhance',
    capabilities: ['upscale'],
    bestFor: [
      { en: 'AI images', de: 'KI-Bilder', es: 'Imágenes de IA' },
      { en: 'Artwork', de: 'Artwork', es: 'Arte' },
      { en: 'Landscapes', de: 'Landschaften', es: 'Paisajes' },
    ],
    description: {
      en: 'Create detail — invents plausible texture where the original has none.',
      de: 'Detail erzeugen — erfindet plausible Textur, wo das Original keine hat.',
      es: 'Crear detalle: inventa textura plausible donde el original no la tiene.',
    },
    badges: [{ en: 'Create detail', de: 'Detail erzeugen', es: 'Crear detalle' }],
    supportedScales: [2, 4],
    presets: [
      {
        id: 'faithful',
        label: { en: 'Faithful', de: 'Originalgetreu', es: 'Fiel' },
        values: { creativity: -6 },
      },
      {
        id: 'balanced',
        label: { en: 'Balanced', de: 'Ausgewogen', es: 'Equilibrado' },
        values: { creativity: 0 },
      },
      {
        id: 'ultra-detail',
        label: { en: 'Ultra Detail', de: 'Ultra-Detail', es: 'Ultra detalle' },
        values: { creativity: 7 },
      },
    ],
    pricing: {
      unit: 'per_run',
      providerCostEUR: 0.012,
      // Live prices — must not change with this refactor.
      fixedSellEUR: { 2: 0.03, 4: 0.06 },
    },
    typicalProcessingSeconds: [20, 45],
    enabled: true,
  },
  {
    id: 'topaz-image-upscale',
    name: 'Topaz Image Upscale',
    vendor: 'Topaz Labs',
    provider: 'replicate',
    providerModelId: 'topazlabs/image-upscale',
    category: 'enhance',
    capabilities: ['upscale', 'face_enhance'],
    bestFor: [
      { en: 'Photography', de: 'Fotografie', es: 'Fotografía' },
      { en: 'Products', de: 'Produkte', es: 'Productos' },
      { en: 'Faces', de: 'Gesichter', es: 'Rostros' },
      { en: 'Text', de: 'Text', es: 'Texto' },
    ],
    description: {
      en: 'Preserve reality — keeps the original truthful while adding resolution.',
      de: 'Realität bewahren — bleibt dem Original treu und gewinnt Auflösung.',
      es: 'Preservar la realidad: fiel al original y con más resolución.',
    },
    badges: [{ en: 'Preserve reality', de: 'Realität bewahren', es: 'Preservar la realidad' }],
    supportedScales: [2, 4, 6],
    presets: [
      {
        id: 'auto',
        label: { en: 'Auto (Recommended)', de: 'Auto (empfohlen)', es: 'Auto (recomendado)' },
        values: { enhanceModel: 'Standard V2' },
      },
      { id: 'standard-v2', label: { en: 'Standard V2', de: 'Standard V2', es: 'Standard V2' }, values: { enhanceModel: 'Standard V2' } },
      { id: 'high-fidelity-v2', label: { en: 'High Fidelity V2', de: 'High Fidelity V2', es: 'High Fidelity V2' }, values: { enhanceModel: 'High Fidelity V2' } },
      { id: 'low-resolution-v2', label: { en: 'Low Resolution V2', de: 'Low Resolution V2', es: 'Low Resolution V2' }, values: { enhanceModel: 'Low Resolution V2' } },
      { id: 'cgi', label: { en: 'CGI', de: 'CGI', es: 'CGI' }, values: { enhanceModel: 'CGI' } },
      { id: 'text-refine', label: { en: 'Text Refine', de: 'Text Refine', es: 'Text Refine' }, values: { enhanceModel: 'Text Refine' } },
    ],
    pricing: {
      unit: 'per_output_megapixel',
      providerCostEUR: 0.0018,
      costUnverified: true,
    },
    typicalProcessingSeconds: [20, 45],
    enabled: false,
    beta: true,
    featureFlag: 'picture.enhance.topaz_upscale',
  },
  {
    id: 'topaz-dust-scratch',
    name: 'Topaz Dust & Scratch v2',
    vendor: 'Topaz Labs',
    provider: 'replicate',
    providerModelId: 'topazlabs/dust-scratch',
    category: 'enhance',
    capabilities: ['restore'],
    bestFor: [
      { en: 'Old photos', de: 'Alte Fotos', es: 'Fotos antiguas' },
      { en: 'Scans', de: 'Scans', es: 'Escaneos' },
    ],
    description: {
      en: 'Removes dust, scratches and scan damage from old photographs.',
      de: 'Entfernt Staub, Kratzer und Scanschäden aus alten Fotografien.',
      es: 'Elimina polvo, arañazos y daños de escaneo de fotos antiguas.',
    },
    pricing: { unit: 'per_run', providerCostEUR: 0.02, costUnverified: true },
    typicalProcessingSeconds: [15, 40],
    enabled: false,
    beta: true,
    featureFlag: 'picture.enhance.topaz_restore',
  },
  {
    id: 'topaz-colorization',
    name: 'Topaz Image Colorization',
    vendor: 'Topaz Labs',
    provider: 'replicate',
    providerModelId: 'topazlabs/image-colorization',
    category: 'enhance',
    capabilities: ['colorize'],
    bestFor: [
      { en: 'Black & white photos', de: 'Schwarz-Weiß-Fotos', es: 'Fotos en blanco y negro' },
      { en: 'Archive material', de: 'Archivmaterial', es: 'Material de archivo' },
    ],
    description: {
      en: 'Colorizes black & white photographs, from natural to vivid.',
      de: 'Koloriert Schwarz-Weiß-Fotos, von natürlich bis kräftig.',
      es: 'Colorea fotos en blanco y negro, de natural a vívido.',
    },
    pricing: { unit: 'per_run', providerCostEUR: 0.02, costUnverified: true },
    typicalProcessingSeconds: [15, 40],
    enabled: false,
    beta: true,
    featureFlag: 'picture.enhance.topaz_colorize',
  },
];
