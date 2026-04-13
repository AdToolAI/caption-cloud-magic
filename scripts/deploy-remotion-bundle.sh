#!/usr/bin/env bash
# ============================================================
# Deploy Remotion Bundle to S3
# 
# Builds the Remotion site bundle from the current repo code
# and uploads it to the S3 bucket used by REMOTION_SERVE_URL.
#
# Prerequisites:
#   - AWS CLI configured (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
#   - Node.js / Bun installed
#   - Remotion CLI available
#
# Usage:
#   ./scripts/deploy-remotion-bundle.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# S3 target — must match REMOTION_SERVE_URL secret
S3_BUCKET="remotionlambda-eucentral1-13gm4o6s90"
S3_SITE_PATH="sites/adtool-remotion-bundle"
AWS_REGION="eu-central-1"

BUNDLE_DIR="$PROJECT_ROOT/build"

echo "🔧 Building Remotion bundle from $PROJECT_ROOT/src/remotion ..."

# Bundle the Remotion site (output goes to $PROJECT_ROOT/build by default)
cd "$PROJECT_ROOT"
npx remotion bundle \
  --entry-point src/remotion/index.ts \
  --log=verbose

if [ ! -f "$BUNDLE_DIR/index.html" ]; then
  echo "❌ Bundle failed — no index.html found in $BUNDLE_DIR"
  exit 1
fi

# Stamp version marker into the bundle for verification
VERSION_FILE="$BUNDLE_DIR/bundle-version.json"
BUNDLE_VERSION=$(grep -oP "SUBTITLE_RENDER_VERSION\s*=\s*'([^']+)'" "$PROJECT_ROOT/src/remotion/utils/subtitleConstants.ts" | sed "s/.*'\(.*\)'/\1/" || echo "unknown")
cat > "$VERSION_FILE" <<EOF
{
  "version": "$BUNDLE_VERSION",
  "built_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "git_sha": "$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
}
EOF

echo "📦 Bundle built successfully. Version: $BUNDLE_VERSION"
echo "📤 Uploading to s3://$S3_BUCKET/$S3_SITE_PATH ..."

# Upload to S3 (sync for efficiency)
aws s3 sync "$BUNDLE_DIR" "s3://$S3_BUCKET/$S3_SITE_PATH" \
  --region "$AWS_REGION" \
  --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html" \
  --exclude "bundle-version.json"

# Upload HTML and version file without long cache (so Lambda always gets fresh entry)
aws s3 cp "$BUNDLE_DIR/index.html" "s3://$S3_BUCKET/$S3_SITE_PATH/index.html" \
  --region "$AWS_REGION" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html"

aws s3 cp "$VERSION_FILE" "s3://$S3_BUCKET/$S3_SITE_PATH/bundle-version.json" \
  --region "$AWS_REGION" \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "application/json"

echo "✅ Remotion bundle deployed to s3://$S3_BUCKET/$S3_SITE_PATH"
echo "   Version: $BUNDLE_VERSION"
echo "   Verify:  https://$S3_BUCKET.s3.$AWS_REGION.amazonaws.com/$S3_SITE_PATH/bundle-version.json"

# Clean up
rm -rf "$BUNDLE_DIR"
echo "🧹 Local bundle cleaned up."
