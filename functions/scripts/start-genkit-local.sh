#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FUNCTIONS_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${FUNCTIONS_DIR}"

if [[ ! -f ".env.genkit.local" ]]; then
  echo "Missing functions/.env.genkit.local"
  echo "Create it from functions/.env.genkit.example and set GEMINI_API_KEY."
  exit 1
fi

echo "Loading environment from functions/.env.genkit.local"
set -a
# shellcheck disable=SC1091
source ".env.genkit.local"
set +a

exec npx genkit-cli start --non-interactive -- node -e "require('./genkit.js'); setInterval(() => {}, 1 << 30)"
