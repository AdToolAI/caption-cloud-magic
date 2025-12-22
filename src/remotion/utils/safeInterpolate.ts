import { interpolate, InterpolateOptions } from 'remotion';

/**
 * A safe wrapper around Remotion's interpolate function that validates inputs
 * to prevent "RangeError: Invalid array length" errors.
 * 
 * This function ensures:
 * - Input ranges are strictly ascending
 * - No duplicate or equal values in input range
 * - Minimum valid range of [0, 1] if invalid inputs are provided
 * - All values are valid numbers (not NaN, undefined, or null)
 */
export function safeInterpolate(
  input: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
  options?: InterpolateOptions
): number {
  // Ensure input is a valid number
  const safeInput = Number.isFinite(input) ? input : 0;

  // Convert and validate input range values
  const validatedInputRange: number[] = [];
  
  for (let i = 0; i < inputRange.length; i++) {
    let val = Number(inputRange[i]);
    
    // Handle NaN, undefined, null
    if (!Number.isFinite(val)) {
      val = i === 0 ? 0 : (validatedInputRange[i - 1] || 0) + 1;
    }
    
    // Ensure strictly ascending (each value must be greater than previous)
    if (i > 0 && val <= validatedInputRange[i - 1]) {
      val = validatedInputRange[i - 1] + 0.001;
    }
    
    validatedInputRange.push(val);
  }

  // Ensure we have at least 2 elements
  if (validatedInputRange.length < 2) {
    validatedInputRange.length = 0;
    validatedInputRange.push(0, 30);
  }

  // Final check: ensure first < second (minimum valid range)
  if (validatedInputRange[0] >= validatedInputRange[1]) {
    validatedInputRange[0] = 0;
    validatedInputRange[1] = Math.max(1, Math.abs(validatedInputRange[1]) || 30);
  }

  // Validate output range has same length
  const validatedOutputRange = outputRange.length === validatedInputRange.length 
    ? outputRange.map(v => Number.isFinite(Number(v)) ? Number(v) : 0)
    : validatedInputRange.map((_, i) => i === 0 ? 0 : 1);

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
    console.warn('safeInterpolate fallback triggered:', { input, inputRange, outputRange, error });
    return validatedOutputRange[0] ?? 0;
  }
}

/**
 * Helper to create a safe duration value (minimum 1 frame)
 */
export function safeDuration(duration: number | undefined | null, fallback: number = 30): number {
  const val = Number(duration);
  return Number.isFinite(val) && val > 0 ? val : fallback;
}
