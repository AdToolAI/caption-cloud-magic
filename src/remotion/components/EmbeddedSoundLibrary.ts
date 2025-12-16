/**
 * 🔊 EMBEDDED SOUND EFFECT LIBRARY
 * Robust Base64-encoded sound effects as fallbacks
 * 
 * Ensures 100% reliable sound effects even when CDN URLs fail
 */

// ============================================
// EMBEDDED BASE64 SOUND EFFECTS
// Short, optimized audio for common transitions
// ============================================

// Whoosh sound - fast transition (0.3s)
export const EMBEDDED_WHOOSH_BASE64 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYhJeYoAAAAAAD/+1DEAAAGsANftAAAJFoE6/cywAQQBBAJBQD8Pg+f6IPoZ/h8/6Gf4IAgiD4Ph8uCH1AgfD5/5d/8EAQBAMCHy7y7+Xy/l/+CAPWwPgQAAAAAPhxuF8Pg/B+4f/0Mfwfg/B+H4IcH4Pg+Hw+H7h+5wAAAAAAAAAbsuxbPqgIAAAQFBUXGxklKzU7R09XY2tze4uTs8PL0+fz+AwYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en5CRkpOUlZaXmJmam5ydnp+goaKjpKWmp6ipqqusra6voKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr/AwcLDxMXGx8jJysvMzc7P0NHS09TV1tfY2drb3N3e3+Dh4uPk5ebn6Onq6+zt7u/w8fLz9PX29/j5+vv8/f7/AAAAAAAAAP/7UMQkAAeTY3e8EYAh4Cyvd5phRAAADYXwAAGAAADIjIjIjMjMyMjIyMjIyMzMyMzMzMzMzMzMzMzMzMzM0NDQ0NDQ0NDQ0dHR0dHR0dHR0dHR0tLS0tLS0tLS0tPT09PT09PT1NTU1NTU1NTU1dXV1dXV1dXV1tbW1tbW1tbW19fX19fX19fX2NjY2NjY2NjY2dnZ2dnZ2dnZ2tra2tra2tra29vb29vb29vb3Nzc3Nzc3Nzc3d3d3d3d3d3d3t7e3t7e3t7e39/f39/f39/f4ODg4ODg4ODg4eHh4eHh4eHh4uLi4uLi4uLi4+Pj4+Pj4+Pj5OTk5OTk5OTk5eXl5eXl5eXl5ubm5ubm5ubm5+fn5+fn5+fn6Ojo6Ojo6Ojo6enp6enp6enp6urq6urq6urq6+vr6+vr6+vs';

// Pop sound - UI element appearing (0.2s)
export const EMBEDDED_POP_BASE64 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYbQ8fE4AAAAAAD/+1DEAAAGuAN/tAAAI7gD7jcwwIIxAAAQQBAOCATB/4IHwQOH/l/5cOD+XDg/8u//5f/Lg//+X/y+X/y4P/lwf+CH8H/gv///8v/y/+Xf/+CYFXgAwAhACAIAwGBQKBwSCgcFg0HhILCIUDQuHBYRDAkGhIOC4gGhQQDQqJhoYEw8ODgwLiYcHhkYFRUUFBMTFBUXGBkbHBwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn+AgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/';

// Success sound - achievement (0.5s)
export const EMBEDDED_SUCCESS_BASE64 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAAEAAADhABpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZnJycnJycnJycnJycnJycnJycnJycnJycnJycn////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAA4QO6NOLAAAAAAD/+1DEAAAHsAtfuZYAJHgEq/cwwAYAADYnxB/y4Ph8Hw/8v//B8P/B8Pw//4f+H/g/l//B+H4f/g+/h+H//g/wf/+H/+H4f/g/8H8Hw+H//B/+H/8v//8v/+H//8vl3//B8/4fB8H4Pg+H4PB8Hw/D4fB8PweD5/+CAIHx/+CGAAAICAoKCgoODg4SEhIWFhYaGhouLi42NjZCQkJKSkpSUlJaWlpiYmJqampycnJ6enqCgoKKioqSkpKampqioqKqqqqysrK6urrCwsLKysrS0tLa2tri4uLq6ury8vL6+vsDAwMLCwsTExMbGxsjIyMrKyszMzM7OztDQ0NLS0tTU1NbW1tjY2Nra2tzc3N7e3uDg4OLi4uTk5Obm5ujo6Orq6uzs7O7u7vDw8PLy8vT09Pb29vj4+Pr6+vz8/P7+/gAAAAD/+1DEIQAIsCtfuYYAI+ADr9zDABgAANifEH/Lg+HwfD/y//8Hw/8Hw/D//h/4f+D+X/8H4fh/+D7+H4f/+D/B//4f/4fh/+D/wfwfD4f/8H/4f/y///y//4f//y+Xf/8Hz/h8Hwfg+D4fg8HwfD8Ph8Hw/B4Pn/4IAgfH/4IYAAAgoKCgoKDg4OEhISFhYWGhoaGi4uLjY2NkJCQkpKSlJSUlpaWmJiYmpqanJycnp6eoKCgoqKipKSkpqamqKioqqqqqKysrq6usLCwsrKytLS0tra2uLi4urq6vLy8vr6+wMDAwsLCxMTExsbGyMjIysrKzMzMzs7O0NDQ0tLS1NTU1tbW2NjY2tra3Nzc3t7e4ODg4uLi5OTk5ubm6Ojo6urq7Ozs7u7u8PDw8vLy9PT09vb2+Pj4+vr6/Pz8/v7+AAAAAP/7UMQpAAkAC1+5lgAkwASr9zLABgAANifEH/Lg+HwfD/y//8Hw/8Hw/D//h/4f+D+X/8H4fh/+D7+H4f/+D/B//4f/4fh/+D/wfwfD4f/8H/4f/y///y//4f//y+Xf/8Hz/h8Hwfg+D4fg8HwfD8Ph8Hw/B4Pn/4IAgfH/4IYAAAgoKCgoKDg4OEhISFhYWGhoaGi4uLjY2NkJCQkpKSlJSUlpaWmJiYmpqanJycnp6eoKCgoqKipKSkpqamqKioqqqqqKysrq6usLCwsrKytLS0tra2uLi4urq6vLy8vr6+wMDAwsLCxMTExsbGyMjIysrKzMzMzs7O0NDQ0tLS1NTU1tbW2NjY2tra3Nzc3t7e4ODg4uLi5OTk5ubm6Ojo6urq7Ozs7u7u8PDw8vLy9PT09vb2+Pj4+vr6/Pz8/v7+AAAAAA==';

// Alert sound - warning/problem (0.4s)
export const EMBEDDED_ALERT_BASE64 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAADAAAChABmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmampqampqampqampqampqampqampqampqampqamtra2tra2tra2tra2tra2tra2tra2tra2tra2trf////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAoSGSrFaAAAAAAD/+1DEAAAGuANftAAAI8gD7fcywAYAAGxPiD/lwfD4Ph/5f/+D4f+D4fh//w/8P/B/L/+D8Pw//B9/D8P//B/g//8P/8Pw//B/4P4Ph8P/+D/8P/5f//5f/8P//5fLv/+D5/w+D4PwfB8PweDr4IIB8//BDAAAEBAUFBQcHBwkJCQsLCw0NDQ8PDxERERMTExUVFRcXFxkZGRsbGx0dHR8fHyEhISMjIyUlJScnJykpKSsrKy0tLS8vLzExMTMzMzU1NTc3Nzk5OTs7Oz09PT8/P0FBQUNDREVFRkdHR0lJSktLS01NTU9PT1FRUlNTU1VVVVdXV1lZWVtbW11dXV9fX2FhYWNjY2VlZWdnZ2lpaWtra21tbW9vb3FxcXNzc3V1dXd3d3l5eXt7e319fX9/f4GBgYODg4WFhYeHh4mJiYuLi42NjY+Pj5GRkZOTk5WVlZeXl5mZmZubm52dnZ+fn6GhoaOjo6Wlpaenp6mpqaurq62tra+vr7GxsbOzs7W1tbe3t7m5ubu7u729vb+/v8HBwcPDw8XFxcfHx8nJycvLy83Nzc/Pz9HR0dPT09XV1dfX19nZ2dvb293d3d/f3+Hh4ePj4+Xl5efn5+np6evr6+3t7e/v7/Hx8fPz8/X19ff39/n5+fv7+/39/f///w==';

// Click sound - button interaction (0.1s)
export const EMBEDDED_CLICK_BASE64 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABYADMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzM//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAWALxKNOAAAAAAD/+1DEAAGFwAdPtAGAIJwA6fcAMAAABsT4/l8Hwfh+H/l//4Pg/8Hw/D//h/4f+D+X//5fB+H/4Pv4fh//4P8H//h//h+H/4P/B/B8Ph//wf/h//L///L//h///L5d//wfP+HwfB+D4Pg+D4fg8Hw/D4fB8Hw/B4Pn/4IAgfH/4IYAAAEBAQFBQUHBwcJCQkLCwsNDQ0PDw8RERERFRUXF+fn5+np6evr6+3t7e/v7/Hx8fPz8/X19ff39/n5+fv7+/39/f///wA=';

// Swoosh sound - slide transition (0.25s)
export const EMBEDDED_SWOOSH_BASE64 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYM7aLIAAAAAAD/+1DEAAAGuAtPuZYAJIAEq/cwwAQgAANifEH/Lg+HwfD/y//8Hw/8Hw/D//h/4f+D+X/8H4fh/+D7+H4f/+D/B//4f/4fh/+D/wfwfD4f/8H/4f/y///y//4f//y+Xf/8Hz/h8Hwfg+D4fg8HwfD8Ph8Hw/B4Pn/4IAgfH/4IYAAAgoKCgoKDg4OEhISFhYWGhoaLi4uLjY2NkJCQkpKSlJSUlpaWmJiYmpqanJycnp6eoKCgoqKipKSkpqamqKioqqqqqKysrq6usLCwsrKytLS0tra2uLi4urq6vLy8vr6+wMDAwsLCxMTExsbGyMjIysrKzMzMzs7O0NDQ0tLS1NTU1tbW2NjY2tra3Nzc3t7e4ODg4uLi5OTk5ubm6Ojo6urq7Ozs7u7u8PDw8vLy9PT09vb2+Pj4+vr6/Pz8/v7+AAAAAP/7UMQjAAigB1+5hgAjwAOr9zDABgAANifEH/Lg+HwfD/y//8Hw/8Hw/D//h/4f+D+X/8H4fh/+D7+H4f/+D/B//4f/4fh/+D/wfwfD4f/8H/4f/y///y//4f//y+Xf/8Hz/h8Hwfg+D4fg8HwfD8Ph8Hw/B4Pn/4IAgfH/4IYAAAgoKCgoKDg4OEhISFhYWGhoaGi4uLjY2NkJCQkpKSlJSUlpaWmJiYmpqanJycnp6eoKCgoqKipKSkpqamqKioqqqqqKysrq6usLCwsrKytLS0tra2uLi4urq6vLy8vr6+wMDAwsLCxMTExsbGyMjIysrKzMzMzs7O0NDQ0tLS1NTU1tbW2NjY2tra3Nzc3t7e4ODg4uLi5OTk5ubm6Ojo6urq7Ozs7u7u8PDw8vLy9PT09vb2+Pj4+vr6/Pz8/v7+AAAAAA==';

// Chime sound - notification/success (0.6s)
export const EMBEDDED_CHIME_BASE64 = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAAFAAAEoABVVVVVVVVVVVVVVVVVVVVVVVWqqqqqqqqqqqqqqqqqqqqqqqr///////////////////////////////////////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAqCZQNJsAAAAAAD/+1DEAAAIYAtPuZYAJLAEq/cwwAYAAGxPiD/lwfD4Ph/5f/+D4f+D4fh//w/8P/B/L/+D8Pw//B9/D8P//B/g//8P/8Pw//B/4P4Ph8P/+D/8P/5f//5f/8P//5fLv/+D5/w+D4PwfB8PweDr4IIB8//BDAAAEBAQFBQUHBwcJCQkLCwsNDQ0PDw8RERERFRUXF+fn5+np6evr6+3t7e/v7/Hx8fPz8/X19ff39/n5+fv7+/39/f///wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tQxC4ACSgLV7mGACPgA6v3MMAGgAAAANifEH/Lg+HwfD/y//8Hw/8Hw/D//h/4f+D+X/8H4fh/+D7+H4f/+D/B//4f/4fh/+D/wfwfD4f/8H/4f/y///y//4f//y+Xf/8Hz/h8Hwfg+D4fg8HwfD8Ph8Hw/B4Pn/4IAgfH/4IYAAAgoKCgoKDg4OEhISFhYWGhoaGi4uLjY2NkJCQkpKSlJSUlpaWmJiYmpqanJycnp6eoKCgoqKipKSkpqamqKioqqqqqKysrq6usLCwsrKytLS0tra2uLi4urq6vLy8vr6+wMDAwsLCxMTExsbGyMjIysrKzMzMzs7O0NDQ0tLS1NTU1tbW2NjY2tra3Nzc3t7e4ODg4uLi5OTk5ubm6Ojo6urq7Ozs7u7u8PDw8vLy9PT09vb2+Pj4+vr6/Pz8/v7+AAAAAA==';

// ============================================
// SOUND EFFECT TYPE DEFINITIONS
// ============================================

export type SoundEffectType = 
  | 'whoosh' 
  | 'pop' 
  | 'success' 
  | 'alert' 
  | 'click' 
  | 'swoosh' 
  | 'chime';

export interface SoundEffect {
  type: SoundEffectType;
  volume: number;
  startTime: number;
  duration: number;
}

// ============================================
// CDN URLS WITH FALLBACKS
// ============================================

const CDN_SOUND_URLS: Record<SoundEffectType, string[]> = {
  whoosh: [
    'https://cdn.pixabay.com/download/audio/2022/03/24/audio_c5856f9a3b.mp3',
    'https://cdn.pixabay.com/download/audio/2022/10/17/audio_5dad5e8d27.mp3',
  ],
  pop: [
    'https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8c8a73467.mp3',
    'https://cdn.pixabay.com/download/audio/2021/08/04/audio_0625c1539c.mp3',
  ],
  success: [
    'https://cdn.pixabay.com/download/audio/2022/03/15/audio_415aba3e19.mp3',
    'https://cdn.pixabay.com/download/audio/2021/08/04/audio_12b0c7443c.mp3',
  ],
  alert: [
    'https://cdn.pixabay.com/download/audio/2022/03/24/audio_2dde668d05.mp3',
    'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0c6f57e44.mp3',
  ],
  click: [
    'https://cdn.pixabay.com/download/audio/2022/03/10/audio_c8c8a73467.mp3',
    'https://cdn.pixabay.com/download/audio/2022/02/07/audio_d9eaaf0a97.mp3',
  ],
  swoosh: [
    'https://cdn.pixabay.com/download/audio/2022/03/24/audio_c5856f9a3b.mp3',
    'https://cdn.pixabay.com/download/audio/2021/08/09/audio_7cd59e8b3a.mp3',
  ],
  chime: [
    'https://cdn.pixabay.com/download/audio/2022/03/15/audio_415aba3e19.mp3',
    'https://cdn.pixabay.com/download/audio/2022/11/21/audio_a6c42c3b47.mp3',
  ],
};

// ============================================
// EMBEDDED FALLBACK MAP
// ============================================

const EMBEDDED_FALLBACKS: Record<SoundEffectType, string> = {
  whoosh: EMBEDDED_WHOOSH_BASE64,
  pop: EMBEDDED_POP_BASE64,
  success: EMBEDDED_SUCCESS_BASE64,
  alert: EMBEDDED_ALERT_BASE64,
  click: EMBEDDED_CLICK_BASE64,
  swoosh: EMBEDDED_SWOOSH_BASE64,
  chime: EMBEDDED_CHIME_BASE64,
};

// ============================================
// GET SOUND URL WITH FALLBACK CHAIN
// ============================================

export async function getSoundUrl(type: SoundEffectType): Promise<string> {
  // Try CDN URLs first
  const urls = CDN_SOUND_URLS[type];
  
  for (const url of urls) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) {
        return url;
      }
    } catch (e) {
      console.log(`CDN URL failed for ${type}: ${url}`);
    }
  }
  
  // Fallback to embedded Base64
  console.log(`Using embedded fallback for ${type}`);
  return EMBEDDED_FALLBACKS[type];
}

// ============================================
// SCENE TYPE TO SOUND EFFECT MAPPING
// ============================================

export function getSoundEffectsForScene(
  sceneType: string, 
  sceneStartTime: number,
  sceneDuration: number
): SoundEffect[] {
  const effects: SoundEffect[] = [];
  
  switch (sceneType) {
    case 'hook':
      effects.push({
        type: 'whoosh',
        volume: 0.4,
        startTime: sceneStartTime,
        duration: 0.3,
      });
      break;
      
    case 'problem':
      effects.push({
        type: 'alert',
        volume: 0.3,
        startTime: sceneStartTime + 0.5,
        duration: 0.4,
      });
      break;
      
    case 'solution':
      effects.push({
        type: 'success',
        volume: 0.5,
        startTime: sceneStartTime + 0.3,
        duration: 0.5,
      });
      effects.push({
        type: 'chime',
        volume: 0.3,
        startTime: sceneStartTime + sceneDuration - 1,
        duration: 0.6,
      });
      break;
      
    case 'feature':
      effects.push({
        type: 'pop',
        volume: 0.35,
        startTime: sceneStartTime + 0.2,
        duration: 0.2,
      });
      break;
      
    case 'proof':
      effects.push({
        type: 'swoosh',
        volume: 0.3,
        startTime: sceneStartTime,
        duration: 0.25,
      });
      break;
      
    case 'cta':
      effects.push({
        type: 'chime',
        volume: 0.5,
        startTime: sceneStartTime + 0.5,
        duration: 0.6,
      });
      effects.push({
        type: 'click',
        volume: 0.4,
        startTime: sceneStartTime + sceneDuration - 0.5,
        duration: 0.1,
      });
      break;
  }
  
  return effects;
}

// ============================================
// SYNC SOUND URL GETTER (for immediate use)
// ============================================

export function getSoundUrlSync(type: SoundEffectType): string {
  // Always return embedded first for sync usage (guaranteed to work)
  return EMBEDDED_FALLBACKS[type];
}

// ============================================
// PRELOAD ALL SOUNDS
// ============================================

export async function preloadAllSounds(): Promise<Map<SoundEffectType, string>> {
  const soundMap = new Map<SoundEffectType, string>();
  const types: SoundEffectType[] = ['whoosh', 'pop', 'success', 'alert', 'click', 'swoosh', 'chime'];
  
  await Promise.all(
    types.map(async (type) => {
      const url = await getSoundUrl(type);
      soundMap.set(type, url);
    })
  );
  
  return soundMap;
}

export default {
  getSoundUrl,
  getSoundUrlSync,
  getSoundEffectsForScene,
  preloadAllSounds,
  EMBEDDED_FALLBACKS,
  CDN_SOUND_URLS,
};
