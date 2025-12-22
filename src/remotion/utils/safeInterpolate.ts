import { interpolate, InterpolateOptions } from 'remotion';

/**
 * A safe wrapper around Remotion's interpolate function that validates inputs
 * to prevent "RangeError: Invalid array length" errors.
 * 
 * This function ensures:
 * - Input ranges are valid arrays with at least 2 elements
 * - Input ranges are strictly ascending
 * - No duplicate or equal values in input range
 * - All values are valid numbers (not NaN, undefined, or null)
 * - Output range matches input range length
 */
export function safeInterpolate(
  input: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
  options?: InterpolateOptions
): number {
  // ========== EARLY VALIDATION ==========
  
  // 1. Check if inputRange is a valid array with at least 2 elements
  if (!inputRange || !Array.isArray(inputRange) || inputRange.length < 2) {
    console.warn('safeInterpolate: Invalid inputRange, using fallback', { inputRange });
    if (Array.isArray(outputRange) && outputRange.length > 0) {
      const val = Number(outputRange[0]);
      return Number.isFinite(val) ? val : 0;
    }
    return 0;
  }
  
  // 2. Check if outputRange is a valid array with at least 2 elements
  if (!outputRange || !Array.isArray(outputRange) || outputRange.length < 2) {
    console.warn('safeInterpolate: Invalid outputRange, using fallback', { outputRange });
    return 0;
  }

  // 3. Ensure input is a valid finite number
  const safeInput = Number.isFinite(input) ? input : 0;

  // 4. Validate and correct inputRange - ensure strictly ascending
  const validatedInputRange: number[] = [];
  
  for (let i = 0; i < inputRange.length; i++) {
    let val = Number(inputRange[i]);
    
    // Handle NaN, undefined, null, Infinity
    if (!Number.isFinite(val)) {
      val = i === 0 ? 0 : (validatedInputRange[i - 1] || 0) + 1;
    }
    
    // Ensure strictly ascending (each value must be greater than previous)
    if (i > 0) {
      const prevVal = validatedInputRange[i - 1];
      if (val <= prevVal) {
        val = prevVal + 0.001;
      }
    }
    
    validatedInputRange.push(val);
  }

  // 5. Final check: ensure we have at least 2 valid ascending values
  if (validatedInputRange.length < 2) {
    console.warn('safeInterpolate: Could not build valid inputRange', { inputRange });
    const val = Number(outputRange[0]);
    return Number.isFinite(val) ? val : 0;
  }

  // 6. Double-check first < second
  if (validatedInputRange[0] >= validatedInputRange[1]) {
    validatedInputRange[0] = 0;
    validatedInputRange[1] = Math.max(1, validatedInputRange[1] + 1);
  }

  // 7. Build validatedOutputRange - MUST have same length as validatedInputRange
  const validatedOutputRange: number[] = [];
  for (let i = 0; i < validatedInputRange.length; i++) {
    let outVal: number;
    if (i < outputRange.length) {
      outVal = Number(outputRange[i]);
    } else {
      // Use last valid output value if outputRange is shorter
      outVal = Number(outputRange[outputRange.length - 1]);
    }
    validatedOutputRange.push(Number.isFinite(outVal) ? outVal : 0);
  }

  // 8. Final safety check before calling interpolate
  if (validatedInputRange.length !== validatedOutputRange.length) {
    console.error('safeInterpolate: Length mismatch after validation', {
      inputLen: validatedInputRange.length,
      outputLen: validatedOutputRange.length
    });
    return validatedOutputRange[0] ?? 0;
  }

  try {
    return interpolate(
      safeInput,
      validatedInputRange,
      validatedOutputRange,
      { 
        extrapolateLeft: 'clamp', 
        extrapolateRight: 'clamp', 
        ...options 
      }
    );
  } catch (error) {
    // Ultimate fallback - return first output value
    console.error('safeInterpolate: interpolate() threw error, using fallback', { 
      input, 
      inputRange, 
      outputRange, 
      validatedInputRange,
      validatedOutputRange,
      error 
    });
    return validatedOutputRange[0] ?? 0;
  }
}

/**
 * Helper to create a safe duration value (minimum 2 frames for valid interpolation)
 */
export function safeDuration(duration: number | undefined | null, fallback: number = 30): number {
  const val = Number(duration);
  // Minimum 2 frames to ensure valid inputRange can be created
  if (Number.isFinite(val) && val >= 2) {
    return val;
  }
  return Math.max(2, fallback);
}

/**
 * Helper to calculate safe exit start time
 * Ensures exitStart is always valid (positive and less than duration)
 */
export function safeExitStart(duration: number | undefined | null, exitDuration: number = 20): number {
  const safeDur = safeDuration(duration, 30);
  const safeExit = Math.max(1, safeDur - exitDuration);
  // Ensure exitStart < duration (at least 1 frame before end)
  return Math.min(safeExit, safeDur - 1);
}

/**
 * Helper to create a safe input range from start and end values
 * Ensures the range is valid even with problematic inputs
 */
export function safeInputRange(start: number | undefined | null, end: number | undefined | null): [number, number] {
  let safeStart = Number(start);
  let safeEnd = Number(end);
  
  if (!Number.isFinite(safeStart)) safeStart = 0;
  if (!Number.isFinite(safeEnd)) safeEnd = 30;
  
  // Ensure start < end
  if (safeStart >= safeEnd) {
    safeEnd = safeStart + 1;
  }
  
  return [safeStart, safeEnd];
}
