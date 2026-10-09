# Frontend Context Report

Generated: 2026-10-07 15:17:03Z

## Frontend Repo Snapshot

- Workspace: /home/saroj/Documents/final/Airabook
- Branch: feature/enterprise-signin-login-FE
- HEAD: b198a25
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
 M e2e/enterprise-operations.spec.mjs
 M e2e/workspace-selection.spec.mjs
 M generated/frontend-context-report.md
 M src/components/Navbar.jsx
 M src/components/ui/button.jsx
 M src/components/ui/input.jsx
 M src/components/ui/textarea.jsx
 D src/components/workspace/EnterpriseNotificationStatus.jsx
 M src/components/workspace/EnterpriseOnboardingNotice.jsx
 M src/components/workspace/EnterpriseTeamManagement.jsx
 M src/components/workspace/WorkspaceMenu.jsx
 M src/config/serviceEndpoints.js
 M src/layouts/AdminShell.jsx
 M src/pages/EnterpriseHome.jsx
 M src/pages/EnterpriseWorkspaceHub.jsx
 M src/pages/Login.jsx
 M src/pages/Signup.jsx
 M src/pages/WorkspaceChooser.jsx
 M src/pages/admin/AdminDashboard.jsx
 M src/pages/admin/EnterpriseApprovals.jsx
 D src/pages/auth/v2/EnterpriseLogin.jsx
 M src/pages/auth/v2/EnterpriseRequestPending.jsx
 M src/pages/auth/v2/EnterpriseSignup.jsx
 M src/pages/auth/v2/PersonalLogin.jsx
 M src/pages/auth/v2/PersonalSignup.jsx
 M src/pages/auth/v2/V2AccountSelector.jsx
 D src/pages/auth/v2/components/AccountSwitcher.jsx
 M src/pages/auth/v2/components/AuthBrandPanel.jsx
 M src/pages/auth/v2/components/AuthField.jsx
 M src/pages/auth/v2/components/AuthFooter.jsx
 M src/pages/auth/v2/components/AuthShell.jsx
 M src/pages/auth/v2/components/AuthTopBar.jsx
 M src/pages/auth/v2/components/Divider.jsx
 M src/pages/auth/v2/index.jsx
 M src/services/enterpriseOnboardingService.js
?? src/services/adminUsersService.js
```

## Backend Snapshot

- Branch: saroj/enterprise-registration/workspace-workflow
- HEAD: 76dfc32

```text
 M ARCHITECTURE.md
 M agent/pom.xml
 M agent/src/main/java/com/ethela/agent/config/enterprise/EnterpriseOperationsProperties.java
 M agent/src/main/java/com/ethela/agent/controller/AccountController.java
 M agent/src/main/java/com/ethela/agent/controller/EnterpriseAccountController.java
 D agent/src/main/java/com/ethela/agent/controller/EnterpriseAdminController.java
 D agent/src/main/java/com/ethela/agent/controller/EnterpriseOperationsController.java
 M agent/src/main/java/com/ethela/agent/controller/FlowController.java
 D agent/src/main/java/com/ethela/agent/dto/account/AccountCreateRequest.java
 M agent/src/main/java/com/ethela/agent/dto/account/AccountUpdateRequest.java
 M agent/src/main/java/com/ethela/agent/dto/enterprise/EnterpriseDtos.java
 M agent/src/main/java/com/ethela/agent/dto/enterprise/EnterpriseOperationsDtos.java
 M agent/src/main/java/com/ethela/agent/dto/user/UserResponse.java
 D agent/src/main/java/com/ethela/agent/entity/EnterpriseAccountReviewEntity.java
 M agent/src/main/java/com/ethela/agent/entity/EnterpriseInvitationEntity.java
 D agent/src/main/java/com/ethela/agent/entity/NotificationOutboxEntity.java
 M agent/src/main/java/com/ethela/agent/mapper/ApplicationUserMapper.java
 D agent/src/main/java/com/ethela/agent/mapper/EnterpriseAccountReviewMapper.java
 M agent/src/main/java/com/ethela/agent/mapper/EnterpriseQueryMapper.java
 M agent/src/main/java/com/ethela/agent/mapper/EnterpriseQueryRows.java
 D agent/src/main/java/com/ethela/agent/mapper/NotificationOutboxMapper.java
 M agent/src/main/java/com/ethela/agent/service/AccountService.java
 M agent/src/main/java/com/ethela/agent/service/EnterpriseApiService.java
 M agent/src/main/java/com/ethela/agent/service/EnterpriseOnboardingAdminService.java
 M agent/src/main/java/com/ethela/agent/service/EnterpriseOnboardingService.java
 D agent/src/main/java/com/ethela/agent/service/enterprise/EnterpriseEmailSender.java
 D agent/src/main/java/com/ethela/agent/service/enterprise/EnterpriseNotificationWorker.java
 D agent/src/main/java/com/ethela/agent/service/enterprise/EnterpriseOperationsMonitor.java
 D agent/src/main/java/com/ethela/agent/service/enterprise/EnterpriseOperationsService.java
 M agent/src/main/java/com/ethela/agent/service/enterprise/EnterprisePrivacyRetentionService.java
 M agent/src/main/java/com/ethela/agent/service/enterprise/EnterpriseWorkflowEvents.java
 D agent/src/main/java/com/ethela/agent/service/enterprise/NotificationOutboxService.java
 M agent/src/main/java/com/ethela/agent/service/enterprise/OnboardingVerificationService.java
 D agent/src/main/java/com/ethela/agent/service/enterprise/SmtpEnterpriseEmailSender.java
 M agent/src/main/java/com/ethela/agent/service/impl/AccountServiceImpl.java
 M agent/src/main/java/com/ethela/agent/service/impl/UserServiceImpl.java
 M agent/src/main/resources/application-postgres.properties
 M agent/src/main/resources/mapper/ApplicationUserMapper.xml
 M agent/src/test/java/com/ethela/agent/controller/AccountControllerAuthorizationTest.java
 M agent/src/test/java/com/ethela/agent/controller/EnterpriseApiControllerTest.java
 M agent/src/test/java/com/ethela/agent/controller/EnterpriseOperationsControllerTest.java
 M agent/src/test/java/com/ethela/agent/controller/UserControllerAuthorizationTest.java
 D agent/src/test/java/com/ethela/agent/service/EnterpriseApprovalServiceTest.java
 M agent/src/test/java/com/ethela/agent/service/EnterpriseInvitationServiceTest.java
 M agent/src/test/java/com/ethela/agent/service/SupabaseEnterpriseWorkflowTest.java
 M agent/src/test/java/com/ethela/agent/service/enterprise/EnterpriseOperationsWorkflowTest.java
 D agent/src/test/java/com/ethela/agent/service/enterprise/SmtpEnterpriseEmailSenderTest.java
 M agent/src/test/java/com/ethela/agent/service/impl/AccountServiceImplTest.java
 M agent/src/test/java/com/ethela/agent/service/impl/UserServiceImplTest.java
 M agent/src/test/java/com/ethela/agent/support/MybatisTestMappers.java
 M agent/src/test/resources/enterprise/step9_h2.sql
 M docs/ENTERPRISE-API-IMPLEMENTATION-STATUS.md
 M docs/ENTERPRISE-INVITATION-API-IMPLEMENTATION-STATUS.md
 M docs/ENTERPRISE_WORKSPACE_GOAL_PLAN.md
 M docs/ENTERPRISE_WORKSPACE_STEP9_IMPLEMENTATION.md
 M docs/README.md
 M docs/contracts/enterprise-workspace-target.openapi.yaml
?? agent/src/main/java/com/ethela/agent/controller/EnterpriseCompatibilityController.java
?? agent/src/test/java/com/ethela/agent/service/ApplicationUserDirectoryTest.java
?? docs/ENTERPRISE_WORKSPACE_STEP10_IMPLEMENTATION.md
```

## Recent Commits

- 2026-10-03 b198a25 email-notification and e2e test cases created
- 2026-10-02 87e9594 checkpoint for v1
- 2026-09-15 8803245 md file update
- 2026-09-15 54b61cc Enterprise login-signup and previous personal login design improvement
- 2026-08-02 c8ac893 Merge pull request #103 from adarshbhattarai/dev-video-flow
- 2026-08-02 6e27384 Fix deployment
- 2026-08-01 2370cbf Merge pull request #102 from adarshbhattarai/dev-video-flow
- 2026-08-01 0880443 Fix deployment

## High-Signal Paths

- /home/saroj/Documents/final/Airabook/src/App.jsx
- /home/saroj/Documents/final/Airabook/src/config/serviceEndpoints.js
- /home/saroj/Documents/final/Airabook/src/services/ApiService.js
- /home/saroj/Documents/final/Airabook/functions/index.js
- /home/saroj/Documents/final/Airabook/functions/airabookaiStream.js
- /home/saroj/Documents/final/Agent/agent/src/main/java/com/ethela/agent/service/UnifiedChatStreamService.java
- /home/saroj/Documents/final/Agent/agent/src/main/java/com/ethela/agent/service/planner/PlannerAgentGraphService.java
