# Frontend Context Report

Generated: 2026-09-30 14:49:52Z

## Frontend Repo Snapshot
- Workspace: /home/saroj/Documents/final/Airabook
- Branch: feature/enterprise-signin-login-FE
- HEAD: 8803245
- Backend repo: /home/saroj/Documents/final/Agent

## Read First
- /home/saroj/Documents/final/Airabook/AGENTS.md
- /home/saroj/Documents/final/Airabook/ARCHITECTURE.md
- /home/saroj/Documents/final/Airabook/README.md
- /home/saroj/Documents/final/Airabook/SELF_UPDATE_WORKFLOW.md
- /home/saroj/Documents/final/Agent/AGENTS.md

## Frontend Working Tree


```text
 M ARCHITECTURE.md
 M generated/frontend-context-report.md
 M package.json
 M src/App.jsx
 M src/components/AdminRoute.jsx
 M src/components/navigation/Sidebar.jsx
 M src/config/serviceEndpoints.js
 M src/context/AuthContext.jsx
 M src/pages/Dashboard.jsx
 M src/pages/EnterpriseHome.jsx
 M src/pages/auth/v2/EnterpriseLogin.jsx
 M src/pages/auth/v2/EnterpriseRequestPending.jsx
 M src/pages/auth/v2/EnterpriseSignup.jsx
 M src/pages/auth/v2/PersonalLogin.jsx
 M src/pages/auth/v2/PersonalSignup.jsx
 M src/pages/auth/v2/V2AccountSelector.jsx
 M src/pages/auth/v2/components/AccountSwitcher.jsx
 M src/pages/auth/v2/index.jsx
 M src/services/enterpriseOnboardingService.js
?? e2e/enterprise-team.spec.mjs
?? e2e/fixtures/enterpriseWorkspace.html
?? e2e/fixtures/enterpriseWorkspace.jsx
?? playwright.enterprise.config.mjs
?? src/components/workspace/EnterpriseOnboardingNotice.jsx
?? src/components/workspace/EnterpriseTeamManagement.jsx
?? src/hooks/useSystemAdminAccess.js
?? src/pages/EnterpriseWorkspaceHub.jsx
?? src/pages/admin/EnterpriseApprovals.jsx
?? src/services/enterpriseTeamPolicy.js
?? src/services/postLoginRouting.js
?? src/services/workspaceSelection.js
```

## Backend Snapshot
- Branch: saroj/enterprise-registration/workspace-workflow
- HEAD: 35ba5df


```text
 M agent/src/main/java/com/ethela/agent/controller/EnterpriseAccountController.java
 M agent/src/main/java/com/ethela/agent/dto/enterprise/EnterpriseDtos.java
 M agent/src/main/java/com/ethela/agent/entity/Account.java
 M agent/src/main/java/com/ethela/agent/entity/EnterpriseInvitationEntity.java
 M agent/src/main/java/com/ethela/agent/entity/WorkspaceAccountEntity.java
 M agent/src/main/java/com/ethela/agent/mapper/EnterpriseQueryMapper.java
 M agent/src/main/java/com/ethela/agent/mapper/WorkspaceAccountMapper.java
 M agent/src/main/java/com/ethela/agent/service/ApplicationUserProvisioningService.java
 M agent/src/main/java/com/ethela/agent/service/EnterpriseApiService.java
 M agent/src/main/java/com/ethela/agent/service/EnterpriseMembershipPolicy.java
 M agent/src/main/java/com/ethela/agent/service/EnterpriseOnboardingAdminService.java
 M agent/src/main/java/com/ethela/agent/service/EnterpriseOnboardingService.java
 M agent/src/main/java/com/ethela/agent/service/impl/AccountServiceImpl.java
 M agent/src/main/resources/mapper/WorkspaceAccountMapper.xml
 M agent/src/test/java/com/ethela/agent/controller/EnterpriseApiControllerTest.java
 M agent/src/test/java/com/ethela/agent/service/EnterpriseApprovalServiceTest.java
 M agent/src/test/java/com/ethela/agent/service/EnterpriseInvitationServiceTest.java
 M agent/src/test/java/com/ethela/agent/service/EnterpriseOnboardingAdminServiceTest.java
 M agent/src/test/java/com/ethela/agent/service/EnterpriseOnboardingServiceTest.java
 M agent/src/test/java/com/ethela/agent/service/WorkspaceAuthorizationServiceTest.java
 M agent/src/test/java/com/ethela/agent/service/impl/AccountServiceImplTest.java
 M agent/src/test/java/com/ethela/agent/support/MybatisTestMappers.java
 M docs/ENTERPRISE-INVITATION-API-IMPLEMENTATION-STATUS.md
 M docs/ENTERPRISE_WORKSPACE_GOAL_PLAN.md
 M docs/README.md
?? agent/src/main/java/com/ethela/agent/entity/EnterpriseAccountEntity.java
?? agent/src/main/java/com/ethela/agent/entity/PersonalAccountEntity.java
?? agent/src/main/java/com/ethela/agent/mapper/EnterpriseAccountMapper.java
?? agent/src/main/java/com/ethela/agent/mapper/PersonalAccountMapper.java
?? agent/src/main/resources/db/migration/009_create_account_subtype_tables.sql
?? agent/src/main/resources/db/migration/010_backfill_account_subtypes.sql
?? agent/src/main/resources/db/migration/011_enforce_account_subtype_constraints.sql
?? agent/src/main/resources/db/migration/012_remove_legacy_account_subtype_columns.sql
?? agent/src/main/resources/db/migration/013_account_invitations.sql
?? agent/src/test/java/com/ethela/agent/service/SupabaseEnterpriseWorkflowTest.java
?? agent/src/test/resources/enterprise/step8_migration.sql
?? docs/ENTERPRISE_WORKSPACE_STEP8_IMPLEMENTATION.md
```

## Recent Commits
- 2026-09-15 8803245 md file update
- 2026-09-15 54b61cc Enterprise login-signup and previous personal login design improvement
- 2026-08-02 c8ac893 Merge pull request #103 from adarshbhattarai/dev-video-flow
- 2026-08-02 6e27384 Fix deployment
- 2026-08-01 2370cbf Merge pull request #102 from adarshbhattarai/dev-video-flow
- 2026-08-01 0880443 Fix deployment
- 2026-08-01 e09dfd6 Merge pull request #101 from adarshbhattarai/dev-video-flow
- 2026-08-01 e0881c9 Updates

## High-Signal Paths
- /home/saroj/Documents/final/Airabook/src/App.jsx
- /home/saroj/Documents/final/Airabook/src/config/serviceEndpoints.js
- /home/saroj/Documents/final/Airabook/src/services/ApiService.js
- /home/saroj/Documents/final/Airabook/functions/index.js
- /home/saroj/Documents/final/Airabook/functions/airabookaiStream.js
- /home/saroj/Documents/final/Agent/agent/src/main/java/com/ethela/agent/service/UnifiedChatStreamService.java
- /home/saroj/Documents/final/Agent/agent/src/main/java/com/ethela/agent/service/planner/PlannerAgentGraphService.java
