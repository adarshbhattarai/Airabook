#!/usr/bin/env bash
# Deploy functions + hosting + Firestore rules + Storage rules for a given alias.
# Loads per-env .env.<alias> (e.g., .env.dev, .env.prod) to supply keys (Gemini/OpenAI/Stripe/etc.).

set -euo pipefail

ALIAS="${1:-dev}"
EXTRA_ARGS=("${@:2}")

case "$ALIAS" in
  dev) PROJECT_ID="airabook-dev" ;;
  dev2) PROJECT_ID="airaproject-f5298" ;;
  qa) PROJECT_ID="airabook-qa" ;;
  go) PROJECT_ID="airabook-21bf5" ;;
  prod) PROJECT_ID="airabook-prod" ;;
  *)
    echo "Usage: $0 {dev|dev2|qa|go|prod} [extra firebase deploy args]"
    exit 1
    ;;
esac

BUCKET="${PROJECT_ID}.firebasestorage.app"

# Load per-environment env file if present
ENV_FILE=".env.${ALIAS}"
if [ -f "${ENV_FILE}" ]; then
  echo "Loading environment from ${ENV_FILE}"
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
else
  echo "No ${ENV_FILE} found; proceeding with existing environment."
fi

echo "Deploying to alias=${ALIAS} project=${PROJECT_ID} bucket=${BUCKET}"

export CLOUDSDK_AUTH_QUOTA_PROJECT="${PROJECT_ID}"
export FIREBASE_STORAGE_BUCKET="${BUCKET}"

firebase deploy \
  --only functions,hosting,firestore:rules,storage \
  --project "${ALIAS}" \
  --force \
  --non-interactive \
  ${EXTRA_ARGS:+${EXTRA_ARGS[@]}}
