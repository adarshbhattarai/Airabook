# Frontend Context Report

Generated: 2026-03-16 05:10:35Z

## Frontend Repo Snapshot
- Workspace: /Users/adeshbhattarai/code/Airabook
- Branch: main
- HEAD: 1daddba
- Backend repo: /Users/adeshbhattarai/code/AiraAI/Agent

## Read First
- /Users/adeshbhattarai/code/Airabook/AGENTS.md
- /Users/adeshbhattarai/code/Airabook/ARCHITECTURE.md
- /Users/adeshbhattarai/code/Airabook/README.md
- /Users/adeshbhattarai/code/Airabook/SELF_UPDATE_WORKFLOW.md
- /Users/adeshbhattarai/code/AiraAI/Agent/AGENTS.md

## Frontend Working Tree


```text
 M AGENTS.md
 M DYNAMIC_PROJECT_CONFIGURATION.md
 M MEDIA_STORAGE_AGENT.md
 M README.md
 M functions/.gitignore
 M functions/createBook.js
 M functions/createUserDoc.js
 M functions/generateImage.js
 M functions/genkit.js
 M functions/index.js
 M functions/package.json
 M functions/payments/createCheckoutSession.js
 M functions/payments/paymentService.js
 M functions/payments/stripeWebhook.js
 M functions/payments/userBillingRepository.js
 M functions/textGenerator.js
 M functions/utils/limits.js
 M generated/frontend-context-report.md
 M src/App.jsx
 M src/components/Navbar.jsx
 M src/components/VoiceAssistantButton.jsx
 M src/components/dashboard/DashboardTalkView.jsx
 M src/components/dashboard/talk3d/DashboardTalk3DView.jsx
 M src/components/dashboard/talk3d/useTalkDemoState.js
 M src/components/navigation/Sidebar.jsx
 M src/context/AuthContext.jsx
 M src/hooks/useVoiceAssistant.js
 M src/lib/billing.js
 M src/pages/AiraHome.jsx
 M src/pages/Donate.jsx
 M src/pages/DonateSuccess.jsx
 M src/pages/Home.jsx
 M src/pages/ProfileSettings.jsx
 M storage.rules
?? CREDIT_BILLING_AGENT.md
?? functions/.env.genkit.example
?? functions/payments/catalog.js
?? functions/payments/createBillingPortalSession.js
?? functions/payments/createCreditPackCheckoutSession.js
?? functions/payments/createSubscriptionCheckoutSession.js
?? functions/payments/creditLedger.js
?? functions/payments/getUsageSummary.js
?? functions/payments/processCreditMaintenance.js
?? functions/payments/refreshBillingState.js
?? functions/payments/stripeClient.js
?? functions/scripts/start-genkit-local.sh
?? functions/tests/run-billing-tests.cjs
?? functions/updateUserProfile.js
?? src/components/voice/VoiceIdSelector.jsx
?? src/hooks/useVoiceSelection.js
?? src/lib/billingCatalog.js
?? src/services/voiceOptionsService.js
```

## Backend Snapshot
- Branch: dev-AiraCleanUp
- HEAD: 77bc74b


```text
 M AGENTS.md
 M agent/README.md
 M agent/src/main/java/com/ethela/agent/config/FirebaseConfig.java
 M agent/src/main/java/com/ethela/agent/config/SpeechToTextConfig.java
 M agent/src/main/java/com/ethela/agent/entity/user/Billing.java
 M agent/src/main/java/com/ethela/agent/handler/VoiceWebSocketHandler.java
 M agent/src/main/java/com/ethela/agent/service/impl/ChatServiceImpl.java
 M agent/src/main/java/com/ethela/agent/service/stt/GoogleSpeechToTextService.java
 M agent/src/main/java/com/ethela/agent/service/tts/ElevenLabsTextToSpeechService.java
 M agent/src/main/java/com/ethela/agent/service/tts/OpenAiFallbackTextToSpeechService.java
 M agent/src/main/java/com/ethela/agent/service/voice/VoiceOptionsService.java
 M agent/src/main/java/com/ethela/agent/service/voice/VoiceProcessingServiceImpl.java
 M agent/src/main/java/com/ethela/agent/service/voice/VoiceSessionServiceImpl.java
 M agent/src/main/resources/application.properties
 M docs/generated/agent-context-report.md
?? agent/src/main/java/com/ethela/agent/service/billing/BillingAccessDeniedException.java
?? agent/src/main/java/com/ethela/agent/service/billing/BillingAccessService.java
?? agent/src/main/java/com/ethela/agent/service/billing/BillingAccessServiceImpl.java
?? agent/src/main/java/com/ethela/agent/service/billing/BillingUsageService.java
?? agent/src/main/java/com/ethela/agent/service/billing/BillingUsageServiceImpl.java
?? agent/src/test/java/com/ethela/agent/config/SpeechToTextConfigProjectResolutionTest.java
?? agent/src/test/java/com/ethela/agent/service/billing/BillingAccessServiceImplTest.java
?? agent/src/test/java/com/ethela/agent/service/voice/VoiceOptionsServiceTest.java
?? agent/src/test/java/com/ethela/agent/service/voice/VoiceProcessingServiceBillingGuardTest.java
?? agent/src/test/java/com/ethela/agent/service/voice/VoiceSessionServiceImplTest.java
?? docs/CREDIT_BILLING_AGENT.md
```

## Recent Commits
- 2026-03-15 1daddba Update on storage rules and UI
- 2026-03-15 9fd2c34 Update
- 2026-03-15 4e94484 Update
- 2026-03-14 c36be18 Update on pages
- 2026-03-14 a5eff04 Update
- 2026-03-11 1ccf66e Update
- 2026-03-08 47a05db Update
- 2026-03-07 b563d2f Update

## High-Signal Paths
- /Users/adeshbhattarai/code/Airabook/src/App.jsx
- /Users/adeshbhattarai/code/Airabook/src/config/serviceEndpoints.js
- /Users/adeshbhattarai/code/Airabook/src/services/ApiService.js
- /Users/adeshbhattarai/code/Airabook/functions/index.js
- /Users/adeshbhattarai/code/Airabook/functions/airabookaiStream.js
- /Users/adeshbhattarai/code/AiraAI/Agent/agent/src/main/java/com/ethela/agent/service/UnifiedChatStreamService.java
- /Users/adeshbhattarai/code/AiraAI/Agent/agent/src/main/java/com/ethela/agent/service/planner/PlannerAgentGraphService.java
