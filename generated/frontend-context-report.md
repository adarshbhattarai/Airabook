# Frontend Context Report

Generated: 2026-10-03 07:57:05Z

## Frontend Repo Snapshot
- Workspace: /home/saroj/Documents/final/Airabook
- Branch: feature/enterprise-signin-login-FE
- HEAD: 87e9594
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
 M src/components/navigation/AppHeader.jsx
 M src/components/navigation/MobileTopBar.jsx
 M src/components/navigation/Sidebar.jsx
 M src/config/serviceEndpoints.js
 M src/pages/EnterpriseHome.jsx
 M src/pages/EnterpriseWorkspaceHub.jsx
 M src/pages/Login.jsx
 M src/pages/Signup.jsx
 M src/pages/admin/EnterpriseApprovals.jsx
 M src/pages/auth/v2/PersonalLogin.jsx
 M src/pages/auth/v2/PersonalSignup.jsx
 M src/pages/auth/v2/V2AccountSelector.jsx
 M src/services/enterpriseOnboardingService.js
 M src/services/postLoginRouting.js
 M src/services/workspaceSelection.js
?? WORKSPACE_SELECTION.md
?? e2e/enterprise-operations.spec.mjs
?? e2e/fixtures/enterpriseOperations.html
?? e2e/fixtures/enterpriseOperations.jsx
?? e2e/fixtures/workspaceSelection.html
?? e2e/fixtures/workspaceSelection.jsx
?? e2e/workspace-selection.spec.mjs
?? playwright.operations.config.mjs
?? playwright.workspaces.config.mjs
?? scripts/workspaceSelection.test.mjs
?? src/components/workspace/EnterpriseNotificationStatus.jsx
?? src/components/workspace/WorkspaceMenu.jsx
?? src/hooks/useWorkspaceMenu.js
?? src/layouts/AdminShell.jsx
?? src/pages/WorkspaceChooser.jsx
```

## Backend Snapshot
- Branch: saroj/enterprise-registration/workspace-workflow
- HEAD: c246707


```text
 M ARCHITECTURE.md
 M agent/pom.xml
 M agent/src/main/java/com/ethela/agent/config/security/FirebaseAuthenticationFilter.java
 M agent/src/main/java/com/ethela/agent/controller/UserController.java
 M agent/src/main/java/com/ethela/agent/exception/GlobalExceptionHandler.java
 M agent/src/main/java/com/ethela/agent/service/EnterpriseApiService.java
 M agent/src/main/java/com/ethela/agent/service/EnterpriseOnboardingAdminService.java
 M agent/src/main/java/com/ethela/agent/service/EnterpriseOnboardingService.java
 M agent/src/main/resources/application-postgres.properties
 M agent/src/test/java/com/ethela/agent/service/EnterpriseInvitationServiceTest.java
 M agent/src/test/java/com/ethela/agent/service/EnterpriseOnboardingAdminServiceTest.java
 M agent/src/test/java/com/ethela/agent/service/EnterpriseOnboardingServiceTest.java
 M agent/src/test/java/com/ethela/agent/service/SupabaseEnterpriseWorkflowTest.java
 M agent/src/test/java/com/ethela/agent/support/MybatisTestMappers.java
 M docs/ENTERPRISE_WORKSPACE_GOAL_PLAN.md
 M docs/README.md
?? agent/src/main/java/com/ethela/agent/config/enterprise/EnterpriseOperationsConfiguration.java
?? agent/src/main/java/com/ethela/agent/config/enterprise/EnterpriseOperationsProperties.java
?? agent/src/main/java/com/ethela/agent/controller/EnterpriseOperationsController.java
?? agent/src/main/java/com/ethela/agent/controller/EnterpriseVerificationController.java
?? agent/src/main/java/com/ethela/agent/dto/enterprise/EnterpriseOperationsDtos.java
?? agent/src/main/java/com/ethela/agent/entity/EnterpriseAuditEventEntity.java
?? agent/src/main/java/com/ethela/agent/entity/NotificationOutboxEntity.java
?? agent/src/main/java/com/ethela/agent/entity/OnboardingVerificationEntity.java
?? agent/src/main/java/com/ethela/agent/mapper/EnterpriseAuditEventMapper.java
?? agent/src/main/java/com/ethela/agent/mapper/NotificationOutboxMapper.java
?? agent/src/main/java/com/ethela/agent/mapper/OnboardingVerificationMapper.java
?? agent/src/main/java/com/ethela/agent/service/enterprise/EnterpriseEmailSender.java
?? agent/src/main/java/com/ethela/agent/service/enterprise/EnterpriseNotificationWorker.java
?? agent/src/main/java/com/ethela/agent/service/enterprise/EnterpriseOperationsMonitor.java
?? agent/src/main/java/com/ethela/agent/service/enterprise/EnterpriseOperationsService.java
?? agent/src/main/java/com/ethela/agent/service/enterprise/EnterprisePrivacyRetentionService.java
?? agent/src/main/java/com/ethela/agent/service/enterprise/EnterpriseWorkflowEvents.java
?? agent/src/main/java/com/ethela/agent/service/enterprise/NotificationOutboxService.java
?? agent/src/main/java/com/ethela/agent/service/enterprise/OnboardingVerificationService.java
?? agent/src/main/java/com/ethela/agent/service/enterprise/SmtpEnterpriseEmailSender.java
?? agent/src/main/resources/db/migration/014_enterprise_operations.sql
?? agent/src/test/java/com/ethela/agent/controller/EnterpriseOperationsControllerTest.java
?? agent/src/test/java/com/ethela/agent/service/enterprise/EnterpriseOperationsWorkflowTest.java
?? agent/src/test/java/com/ethela/agent/service/enterprise/SmtpEnterpriseEmailSenderTest.java
?? agent/src/test/resources/enterprise/step9_base_h2.sql
?? agent/src/test/resources/enterprise/step9_h2.sql
?? docs/ENTERPRISE_WORKSPACE_STEP9_IMPLEMENTATION.md
```

## Recent Commits
- 2026-10-02 87e9594 checkpoint for v1
- 2026-09-15 8803245 md file update
- 2026-09-15 54b61cc Enterprise login-signup and previous personal login design improvement
- 2026-08-02 c8ac893 Merge pull request #103 from adarshbhattarai/dev-video-flow
- 2026-08-02 6e27384 Fix deployment
- 2026-08-01 2370cbf Merge pull request #102 from adarshbhattarai/dev-video-flow
- 2026-08-01 0880443 Fix deployment
- 2026-08-01 e09dfd6 Merge pull request #101 from adarshbhattarai/dev-video-flow

## High-Signal Paths
- /home/saroj/Documents/final/Airabook/src/App.jsx
- /home/saroj/Documents/final/Airabook/src/config/serviceEndpoints.js
- /home/saroj/Documents/final/Airabook/src/services/ApiService.js
- /home/saroj/Documents/final/Airabook/functions/index.js
- /home/saroj/Documents/final/Airabook/functions/airabookaiStream.js
- /home/saroj/Documents/final/Agent/agent/src/main/java/com/ethela/agent/service/UnifiedChatStreamService.java
- /home/saroj/Documents/final/Agent/agent/src/main/java/com/ethela/agent/service/planner/PlannerAgentGraphService.java
