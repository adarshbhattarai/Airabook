# Frontend Context Report

Generated: 2026-11-03 15:24:02Z

## Frontend Repo Snapshot
- Workspace: /home/sarojx/Documents/airabookai/airabook
- Branch: feature/enterprise-workspace-changes
- HEAD: 819f04b
- Backend repo: /home/sarojx/Documents/airabookai/Agent

## Read First
- /home/sarojx/Documents/airabookai/airabook/AGENTS.md
- /home/sarojx/Documents/airabookai/airabook/ARCHITECTURE.md
- /home/sarojx/Documents/airabookai/airabook/README.md
- /home/sarojx/Documents/airabookai/airabook/SELF_UPDATE_WORKFLOW.md
- /home/sarojx/Documents/airabookai/Agent/AGENTS.md

## Frontend Working Tree


```text
 M ARCHITECTURE.md
 M WORKSPACE_SELECTION.md
 M e2e/fixtures/enterpriseWorkspace.jsx
 M e2e/workspace-selection.spec.mjs
 M generated/frontend-context-report.md
 M package-lock.json
 M package.json
 M scripts/workspaceSelection.test.mjs
 M src/App.jsx
 M src/components/navigation/AppHeader.jsx
 M src/components/navigation/MobileTopBar.jsx
 M src/components/navigation/Sidebar.jsx
 M src/components/workspace/EnterpriseOnboardingNotice.jsx
 M src/components/workspace/EnterpriseTeamManagement.jsx
 M src/components/workspace/WorkspaceMenu.jsx
 M src/hooks/useWorkspaceMenu.js
 M src/layouts/AppShell.jsx
 M src/pages/Dashboard.jsx
 M src/pages/EnterpriseHome.jsx
 M src/pages/EnterpriseWorkspaceHub.jsx
 M src/pages/WorkspaceChooser.jsx
 M src/pages/auth/v2/EnterpriseSignup.jsx
 M src/services/ApiService.js
 M src/services/enterpriseOnboardingService.js
 M src/services/workspaceSelection.js
?? src/context/AppQueryProvider.jsx
?? src/context/WorkspaceContext.jsx
?? src/hooks/useEnterpriseOnboardingNotification.js
?? src/services/enterpriseQueries.js
```

## Backend Snapshot
- Branch: saroj/enterprise-info-refine
- HEAD: 975fd54


```text
Working tree clean.
```

## Recent Commits
- 2026-10-29 819f04b Merge pull request #111 from adarshbhattarai/feature/api-key-ui
- 2026-10-27 7635dc1 Fix API key dialog smoke test expectations
- 2026-10-27 a4a054e api-key-ui
- 2026-10-16 d32b34e Merge pull request #110 from adarshbhattarai/feature/enterprise-ui-refinment
- 2026-10-17 06e7865 Restore lockfile unrelated to UI changes
- 2026-10-17 068c198 workspace selector ui
- 2026-10-16 c0969c0 ui refinment
- 2026-10-12 fa90d8d Merge pull request #105 from adarshbhattarai/feature/enterprise-signin-login-FE

## High-Signal Paths
- /home/sarojx/Documents/airabookai/airabook/src/App.jsx
- /home/sarojx/Documents/airabookai/airabook/src/config/serviceEndpoints.js
- /home/sarojx/Documents/airabookai/airabook/src/services/ApiService.js
- /home/sarojx/Documents/airabookai/airabook/functions/index.js
- /home/sarojx/Documents/airabookai/airabook/functions/airabookaiStream.js
- /home/sarojx/Documents/airabookai/Agent/agent/src/main/java/com/ethela/agent/service/UnifiedChatStreamService.java
- /home/sarojx/Documents/airabookai/Agent/agent/src/main/java/com/ethela/agent/service/planner/PlannerAgentGraphService.java
