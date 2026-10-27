# Frontend Context Report

Generated: 2026-10-27 12:28:43Z

## Frontend Repo Snapshot
- Workspace: /home/sarojx/Documents/airabookai/airabook
- Branch: feature/api-key-ui
- HEAD: d32b34e
- Backend repo: /home/sarojx/Documents/airabookai/Agent

## Read First
- /home/sarojx/Documents/airabookai/airabook/AGENTS.md
- /home/sarojx/Documents/airabookai/airabook/ARCHITECTURE.md
- /home/sarojx/Documents/airabookai/airabook/README.md
- /home/sarojx/Documents/airabookai/airabook/SELF_UPDATE_WORKFLOW.md
- /home/sarojx/Documents/airabookai/Agent/AGENTS.md

## Frontend Working Tree


```text
 M WORKSPACE_SELECTION.md
 M e2e/workspace-selection.spec.mjs
 M generated/frontend-context-report.md
 M src/config/serviceEndpoints.js
 M src/pages/EnterpriseHome.jsx
?? src/components/workspace/EnterpriseApiKeyDialog.jsx
?? src/services/apiKeyService.js
```

## Backend Snapshot
- Branch: main
- HEAD: 7e8ffb7


```text
 M agent/src/main/java/com/ethela/agent/dto/enterprise/EnterpriseDtos.java
 M agent/src/main/java/com/ethela/agent/mapper/EnterpriseQueryRows.java
 M agent/src/main/java/com/ethela/agent/service/EnterpriseApiService.java
 M agent/src/main/java/com/ethela/agent/service/impl/ApiKeyServiceImpl.java
 M agent/src/main/resources/mapper/EnterpriseQueryMapper.xml
 M agent/src/test/java/com/ethela/agent/controller/EnterpriseApiControllerTest.java
 M agent/src/test/java/com/ethela/agent/service/EnterpriseInvitationServiceTest.java
 M docs/ENTERPRISE_WORKSPACE_ARCHITECTURE.md
```

## Recent Commits
- 2026-10-16 d32b34e Merge pull request #110 from adarshbhattarai/feature/enterprise-ui-refinment
- 2026-10-17 06e7865 Restore lockfile unrelated to UI changes
- 2026-10-17 068c198 workspace selector ui
- 2026-10-16 c0969c0 ui refinment
- 2026-10-12 fa90d8d Merge pull request #105 from adarshbhattarai/feature/enterprise-signin-login-FE
- 2026-10-10 a5cea19 resove e2d test issue
- 2026-10-09 dfc5545 Update npm lockfile
- 2026-10-09 2cb14d1 resolve the merge conflict

## High-Signal Paths
- /home/sarojx/Documents/airabookai/airabook/src/App.jsx
- /home/sarojx/Documents/airabookai/airabook/src/config/serviceEndpoints.js
- /home/sarojx/Documents/airabookai/airabook/src/services/ApiService.js
- /home/sarojx/Documents/airabookai/airabook/functions/index.js
- /home/sarojx/Documents/airabookai/airabook/functions/airabookaiStream.js
- /home/sarojx/Documents/airabookai/Agent/agent/src/main/java/com/ethela/agent/service/UnifiedChatStreamService.java
- /home/sarojx/Documents/airabookai/Agent/agent/src/main/java/com/ethela/agent/service/planner/PlannerAgentGraphService.java
