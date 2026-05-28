/**
 * r39: Single source of truth for Lambda function name resolution.
 * All render edge functions must use this instead of local getLambdaFunctionName().
 */

const DEFAULT_LAMBDA_FUNCTION = 'remotion-render-4-0-462-mem3008mb-disk10240mb-600sec';

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
 * Canonical S3 bucket where the Remotion site BUNDLE (serve URL) is deployed
 * AND where render outputs are written. Using a single bucket avoids
 * cross-bucket IAM/ACL issues (previously the legacy output bucket
 * `…-13gm4o6s90` returned AccessDenied during render).
 *
 * The AWS Lambda execution role has read/write IAM permissions on every
 * bucket matching `remotionlambda-*`, so the same bucket works for both.
 */
export const REMOTION_BUNDLE_BUCKET_NAME = 'remotionlambda-eucentral1-6ul51trd3p';
export const DEFAULT_BUCKET_NAME = REMOTION_BUNDLE_BUCKET_NAME;

/**
 * Legacy output bucket — kept only as a constant so old DB rows referencing
 * it remain interpretable. New renders MUST NOT target this bucket.
 */
export const LEGACY_OUTPUT_BUCKET_NAME = 'remotionlambda-eucentral1-13gm4o6s90';
