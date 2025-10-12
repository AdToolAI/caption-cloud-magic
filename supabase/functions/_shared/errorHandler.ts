/**
 * Centralized Error Handler
 * Logs detailed errors server-side while returning generic messages to clients
 */

export const ErrorCodes = {
  AUTHENTICATION: 'authentication_required',
  VALIDATION: 'invalid_input',
  NOT_FOUND: 'resource_not_found',
  RATE_LIMIT: 'rate_limit_exceeded',
  PAYMENT_REQUIRED: 'payment_required',
  LIMIT_REACHED: 'limit_reached',
  INTERNAL: 'internal_error',
  SERVICE_UNAVAILABLE: 'service_unavailable',
} as const;

type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

interface ErrorOptions {
  code: ErrorCode;
  userMessage: string;
  statusCode: number;
  internalDetails?: any;
  context?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Creates a secure error response that logs details server-side but returns generic messages to clients
 */
export function createErrorResponse(options: ErrorOptions): Response {
  const { code, userMessage, statusCode, internalDetails, context } = options;

  // Log detailed error server-side only
  console.error('Error Details:', {
    code,
    statusCode,
    context: context || 'Unknown',
    timestamp: new Date().toISOString(),
    // Log the actual error but never send to client
    details: internalDetails,
  });

  // Return generic error to client
  return new Response(
    JSON.stringify({
      error: userMessage,
      code,
    }),
    {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Common error response helpers
 */
export const ErrorResponses = {
  authentication: (details?: any, context?: string) =>
    createErrorResponse({
      code: ErrorCodes.AUTHENTICATION,
      userMessage: 'Authentication required',
      statusCode: 401,
      internalDetails: details,
      context,
    }),

  validation: (details?: any, context?: string) =>
    createErrorResponse({
      code: ErrorCodes.VALIDATION,
      userMessage: 'Invalid input provided',
      statusCode: 400,
      internalDetails: details,
      context,
    }),

  notFound: (details?: any, context?: string) =>
    createErrorResponse({
      code: ErrorCodes.NOT_FOUND,
      userMessage: 'Resource not found',
      statusCode: 404,
      internalDetails: details,
      context,
    }),

  rateLimit: (details?: any, context?: string) =>
    createErrorResponse({
      code: ErrorCodes.RATE_LIMIT,
      userMessage: 'Rate limit exceeded. Please try again later',
      statusCode: 429,
      internalDetails: details,
      context,
    }),

  paymentRequired: (details?: any, context?: string) =>
    createErrorResponse({
      code: ErrorCodes.PAYMENT_REQUIRED,
      userMessage: 'Payment required. Please upgrade your plan',
      statusCode: 402,
      internalDetails: details,
      context,
    }),

  limitReached: (details?: any, context?: string) =>
    createErrorResponse({
      code: ErrorCodes.LIMIT_REACHED,
      userMessage: 'Usage limit reached. Please upgrade your plan',
      statusCode: 429,
      internalDetails: details,
      context,
    }),

  internal: (details?: any, context?: string) =>
    createErrorResponse({
      code: ErrorCodes.INTERNAL,
      userMessage: 'An error occurred processing your request',
      statusCode: 500,
      internalDetails: details,
      context,
    }),

  serviceUnavailable: (details?: any, context?: string) =>
    createErrorResponse({
      code: ErrorCodes.SERVICE_UNAVAILABLE,
      userMessage: 'Service temporarily unavailable',
      statusCode: 503,
      internalDetails: details,
      context,
    }),
};
