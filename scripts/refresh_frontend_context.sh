#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_ROOT="${AIRA_BACKEND_ROOT:-/Users/adeshbhattarai/code/AiraAI/Agent}"
REPORT_DIR="${REPO_ROOT}/generated"
REPORT_FILE="${REPORT_DIR}/frontend-context-report.md"
MEMORY_FILE="${CODEX_FE_MEMORY_FILE:-/Users/adeshbhattarai/.codex/memories/airabook-frontend.md}"

mkdir -p "${REPORT_DIR}"
mkdir -p "$(dirname "${MEMORY_FILE}")"

timestamp="$(date -u '+%Y-%m-%d %H:%M:%SZ')"
branch="$(git -C "${REPO_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
head_sha="$(git -C "${REPO_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
recent_commits="$(git -C "${REPO_ROOT}" log --date=short --pretty='- %ad %h %s' -n 8 2>/dev/null || true)"
status_lines="$(git -C "${REPO_ROOT}" status --short --untracked-files=all 2>/dev/null || true)"
backend_branch="$(git -C "${BACKEND_ROOT}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
backend_head="$(git -C "${BACKEND_ROOT}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
backend_status="$(git -C "${BACKEND_ROOT}" status --short --untracked-files=all 2>/dev/null || true)"

if [[ -z "${recent_commits}" ]]; then
  recent_commits="- No commit history available."
fi
if [[ -z "${status_lines}" ]]; then
  status_lines="Working tree clean."
fi
if [[ -z "${backend_status}" ]]; then
  backend_status="Working tree clean."
fi

cat > "${REPORT_FILE}" <<EOF2
# Frontend Context Report

Generated: ${timestamp}

## Frontend Repo Snapshot
- Workspace: ${REPO_ROOT}
- Branch: ${branch}
- HEAD: ${head_sha}
- Backend repo: ${BACKEND_ROOT}

## Read First
- ${REPO_ROOT}/AGENTS.md
- ${REPO_ROOT}/ARCHITECTURE.md
- ${REPO_ROOT}/README.md
- ${REPO_ROOT}/SELF_UPDATE_WORKFLOW.md
- ${BACKEND_ROOT}/AGENTS.md

## Frontend Working Tree


txt
${status_lines}

## Backend Snapshot
- Branch: ${backend_branch}
- HEAD: ${backend_head}


txt
${backend_status}

## Recent Commits
${recent_commits}

## High-Signal Paths
- ${REPO_ROOT}/src/App.jsx
- ${REPO_ROOT}/src/config/serviceEndpoints.js
- ${REPO_ROOT}/src/services/ApiService.js
- ${REPO_ROOT}/functions/index.js
- ${REPO_ROOT}/functions/airabookaiStream.js
- ${BACKEND_ROOT}/agent/src/main/java/com/ethela/agent/service/UnifiedChatStreamService.java
- ${BACKEND_ROOT}/agent/src/main/java/com/ethela/agent/service/planner/PlannerAgentGraphService.java
EOF2

perl -0pi -e 's/^txt$/```text/mg; $count=0; s/```text\n([^`]*?)\n\n(?=##|\z)/```text\n$1\n```\n\n/msg' "${REPORT_FILE}"

cat > "${MEMORY_FILE}" <<EOF2
# Airabook Frontend Memory

Last refreshed: ${timestamp}
Workspace: ${REPO_ROOT}

## Project Identity
- React/Vite frontend plus Firebase Functions repo.
- UI code lives in src/.
- Firebase Functions live in functions/.
- Spring backend lives in ${BACKEND_ROOT}.

## First Files To Read
- ${REPO_ROOT}/AGENTS.md
- ${REPO_ROOT}/ARCHITECTURE.md
- ${REPO_ROOT}/README.md
- ${REPORT_FILE}
- ${BACKEND_ROOT}/AGENTS.md

## High-Signal Frontend Files
- src/App.jsx
- src/config/serviceEndpoints.js
- src/services/ApiService.js
- functions/index.js
- functions/airabookaiStream.js

## Refresh Rule
Run scripts/refresh_frontend_context.sh after meaningful frontend, Firebase Functions, or backend-integration changes.
EOF2

echo "Updated ${REPORT_FILE}"
echo "Updated ${MEMORY_FILE}"
