#!/usr/bin/env bash
# Deploy Firebase Cloud Functions for a given alias (dev, dev2, qa, go, prod).
# Uses the correct bucket suffix and sets a quota project to avoid 403s during identitytoolkit calls.

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

# Load per-environment env file (e.g., .env.dev, .env.prod) if present.
# Put keys like GEMINI_API_KEY, OPENAI_API_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET in these files.
ENV_FILE=".env.${ALIAS}"
if [ -f "${ENV_FILE}" ]; then
  echo "Loading environment from ${ENV_FILE}"
  # shellcheck disable=SC1090
  set -a
  source "${ENV_FILE}"
  set +a
else
  echo "No ${ENV_FILE} found; proceeding with existing environment."
fi

echo "Deploying functions to alias=${ALIAS} project=${PROJECT_ID} bucket=${BUCKET}"

# Ensure quota project is set to avoid identitytoolkit 403s during delete/redeploy
export CLOUDSDK_AUTH_QUOTA_PROJECT="${PROJECT_ID}"
export FIREBASE_STORAGE_BUCKET="${BUCKET}"

firebase deploy \
  --only functions \
  --project "${ALIAS}" \
  --force \
  --non-interactive \
  ${EXTRA_ARGS:+${EXTRA_ARGS[@]}}
