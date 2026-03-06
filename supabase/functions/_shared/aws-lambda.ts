/**
 * r39: Single source of truth for Lambda function name resolution.
 * All render edge functions must use this instead of local getLambdaFunctionName().
 */

const DEFAULT_LAMBDA_FUNCTION = 'remotion-render-4-0-424-mem3008mb-disk2048mb-600sec';

/**
 * Resolves the Lambda function name from REMOTION_LAMBDA_FUNCTION_ARN secret.
 * Handles both full ARN format and plain function name.
 */
export function getLambdaFunctionName(): string {
  const arn = Deno.env.get('REMOTION_LAMBDA_FUNCTION_ARN') || '';
  if (arn.includes(':function:')) {
    return arn.split(':function:')[1] || arn;
  }
  return arn || DEFAULT_LAMBDA_FUNCTION;
}

/**
 * Returns the AWS region for Lambda invocations.
 */
export const AWS_REGION = 'eu-central-1';

/**
 * Default S3 bucket for Remotion renders.
 */
export const DEFAULT_BUCKET_NAME = 'remotionlambda-eucentral1-13gm4o6s90';
