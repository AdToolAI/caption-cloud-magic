/**
 * Phoneme Mapping Utility for ElevenLabs Lip-Sync
 * 
 * Maps ElevenLabs character timestamps to visemes for character animation
 */

export interface PhonemeTimestamp {
  character: string;
  start_time: number;
  end_time: number;
}

export interface AlignmentData {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

// Viseme types based on mouth shapes
export type Viseme = 
  | 'neutral'    // Resting position
  | 'wide'       // A, I - Wide open
  | 'medium'     // E - Medium open  
  | 'round'      // O - Round
  | 'small_round' // U - Small round
  | 'closed'     // M, B, P - Closed lips
  | 'teeth_lip'  // F, V, W - Teeth on lip
  | 'teeth'      // T, D, S, Z - Teeth showing
  | 'tongue_up'  // L, N - Tongue up
  | 'back'       // R - Back
  | 'back_open'; // K, G - Back open

// Character to viseme mapping
const CHAR_TO_VISEME: Record<string, Viseme> = {
  // Silence/punctuation
  ' ': 'neutral',
  '.': 'neutral',
  ',': 'neutral',
  '!': 'neutral',
  '?': 'neutral',
  '-': 'neutral',
  ':': 'neutral',
  ';': 'neutral',
  '"': 'neutral',
  "'": 'neutral',
  '\n': 'neutral',
  
  // A, I - Wide open (most open mouth)
  'a': 'wide',
  'A': 'wide',
  'i': 'wide',
  'I': 'wide',
  'ä': 'wide',
  'Ä': 'wide',
  'y': 'wide',
  'Y': 'wide',
  
  // E - Medium open
  'e': 'medium',
  'E': 'medium',
  
  // O - Round
  'o': 'round',
  'O': 'round',
  'ö': 'round',
  'Ö': 'round',
  
  // U - Small round
  'u': 'small_round',
  'U': 'small_round',
  'ü': 'small_round',
  'Ü': 'small_round',
  
  // M, B, P - Closed lips
  'm': 'closed',
  'M': 'closed',
  'b': 'closed',
  'B': 'closed',
  'p': 'closed',
  'P': 'closed',
  
  // F, V, W - Teeth on lip
  'f': 'teeth_lip',
  'F': 'teeth_lip',
  'v': 'teeth_lip',
  'V': 'teeth_lip',
  'w': 'teeth_lip',
  'W': 'teeth_lip',
  
  // T, D, S, Z - Teeth showing
  't': 'teeth',
  'T': 'teeth',
  'd': 'teeth',
  'D': 'teeth',
  's': 'teeth',
  'S': 'teeth',
  'z': 'teeth',
  'Z': 'teeth',
  'ß': 'teeth',
  'c': 'teeth',
  'C': 'teeth',
  'x': 'teeth',
  'X': 'teeth',
  
  // L, N - Tongue up
  'l': 'tongue_up',
  'L': 'tongue_up',
  'n': 'tongue_up',
  'N': 'tongue_up',
  
  // R - Back
  'r': 'back',
  'R': 'back',
  'j': 'back',
  'J': 'back',
  
  // K, G, H, CH - Back open
  'k': 'back_open',
  'K': 'back_open',
  'g': 'back_open',
  'G': 'back_open',
  'h': 'back_open',
  'H': 'back_open',
  'q': 'back_open',
  'Q': 'back_open',
};

/**
 * Convert ElevenLabs alignment data to phoneme timestamps array
 */
export function alignmentToPhonemes(alignment: AlignmentData): PhonemeTimestamp[] {
  if (!alignment?.characters) return [];
  
  return alignment.characters.map((char, index) => ({
    character: char,
    start_time: alignment.character_start_times_seconds[index] || 0,
    end_time: alignment.character_end_times_seconds[index] || 0,
  }));
}

/**
 * Get viseme for a specific character
 */
export function getVisemeForCharacter(char: string): Viseme {
  return CHAR_TO_VISEME[char] || 'neutral';
}

/**
 * Get the current viseme based on playback time
 */
export function getCurrentViseme(
  phonemes: PhonemeTimestamp[],
  currentTimeSeconds: number
): Viseme {
  if (!phonemes || phonemes.length === 0) return 'neutral';
  
  // Find the phoneme that contains the current time
  const currentPhoneme = phonemes.find(
    p => currentTimeSeconds >= p.start_time && currentTimeSeconds <= p.end_time
  );
  
  if (!currentPhoneme) return 'neutral';
  
  return getVisemeForCharacter(currentPhoneme.character);
}

/**
 * Get viseme intensity (0-1) based on position within phoneme
 */
export function getVisemeIntensity(
  phonemes: PhonemeTimestamp[],
  currentTimeSeconds: number
): number {
  if (!phonemes || phonemes.length === 0) return 0;
  
  const currentPhoneme = phonemes.find(
    p => currentTimeSeconds >= p.start_time && currentTimeSeconds <= p.end_time
  );
  
  if (!currentPhoneme) return 0;
  
  const phonemeDuration = currentPhoneme.end_time - currentPhoneme.start_time;
  if (phonemeDuration <= 0) return 1;
  
  const progress = (currentTimeSeconds - currentPhoneme.start_time) / phonemeDuration;
  
  // Smooth in-out curve
  return Math.sin(progress * Math.PI);
}

/**
 * Determine emotion from text analysis (basic)
 */
export function detectEmotionFromText(text: string): string {
  const lowerText = text.toLowerCase();
  
  // Excited/Happy indicators
  if (lowerText.includes('!') || 
      lowerText.includes('großartig') || 
      lowerText.includes('fantastisch') ||
      lowerText.includes('perfekt') ||
      lowerText.includes('wow') ||
      lowerText.includes('amazing') ||
      lowerText.includes('wonderful')) {
    return 'excited';
  }
  
  // Problem/Concerned indicators
  if (lowerText.includes('problem') || 
      lowerText.includes('schwierig') ||
      lowerText.includes('herausforderung') ||
      lowerText.includes('leider') ||
      lowerText.includes('unfortunately')) {
    return 'concerned';
  }
  
  // Thinking indicators
  if (lowerText.includes('?') ||
      lowerText.includes('stellen sie sich vor') ||
      lowerText.includes('imagine') ||
      lowerText.includes('denken') ||
      lowerText.includes('überlegen')) {
    return 'thinking';
  }
  
  // Happy indicators
  if (lowerText.includes('lösung') ||
      lowerText.includes('erfolg') ||
      lowerText.includes('besser') ||
      lowerText.includes('solution') ||
      lowerText.includes('success')) {
    return 'happy';
  }
  
  // Surprised indicators
  if (lowerText.includes('überraschend') ||
      lowerText.includes('unglaublich') ||
      lowerText.includes('surprising') ||
      lowerText.includes('incredible')) {
    return 'surprised';
  }
  
  return 'neutral';
}

/**
 * Determine gesture from scene type
 */
export function getGestureForSceneType(sceneType: string): string {
  const gestureMap: Record<string, string> = {
    hook: 'explaining',
    problem: 'shrugging',
    solution: 'pointing',
    feature: 'explaining',
    proof: 'pointing',
    cta: 'pointing',
  };
  
  return gestureMap[sceneType] || 'idle';
}

/**
 * Process full voiceover response and extract phonemes
 */
export function processVoiceoverResponse(response: {
  alignment?: AlignmentData;
  audioUrl?: string;
  duration?: number;
}): {
  phonemes: PhonemeTimestamp[];
  audioUrl?: string;
  duration?: number;
} {
  return {
    phonemes: response.alignment ? alignmentToPhonemes(response.alignment) : [],
    audioUrl: response.audioUrl,
    duration: response.duration,
  };
}
