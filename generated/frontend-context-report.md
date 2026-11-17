# Frontend Context Report

Generated: 2026-11-16 06:05:39Z

## Frontend Repo Snapshot
- Workspace: /Users/adarshbhattarai/code/Airabook/Airabook
- Branch: main
- HEAD: b221546
- Backend repo: /Users/adarshbhattarai/code/Airabook/Agent

## Read First
- /Users/adarshbhattarai/code/Airabook/Airabook/AGENTS.md
- /Users/adarshbhattarai/code/Airabook/Airabook/ARCHITECTURE.md
- /Users/adarshbhattarai/code/Airabook/Airabook/README.md
- /Users/adarshbhattarai/code/Airabook/Airabook/SELF_UPDATE_WORKFLOW.md
- /Users/adarshbhattarai/code/Airabook/Agent/AGENTS.md

## Frontend Working Tree


```text
 M ARCHITECTURE.md
 M generated/frontend-context-report.md
 M scripts/run-airabook-qa.mjs
 M src/App.jsx
 M src/components/ChatPanel.jsx
 M src/components/PageEditor/index.jsx
 M src/components/navigation/Sidebar.jsx
 M src/config/serviceEndpoints.js
 M src/context/WorkspaceContext.jsx
 M src/pages/Dashboard.jsx
 M src/services/ApiService.js
 M src/services/workspaceSelection.js
 M storage.rules
?? docs/ACCOUNT_FILES_API_CONTRACT.md
?? e2e/my-files-upload.spec.mjs
?? src/components/files/FileRowActions.jsx
?? src/components/files/FileUploadControl.jsx
?? src/pages/MyFiles.jsx
?? src/services/accountFilesService.js
```

## Backend Snapshot
- Branch: main
- HEAD: ce223fc


```text
 M agent/src/main/java/com/ethela/agent/config/security/FirebaseAuthenticationFilter.java
 M agent/src/main/java/com/ethela/agent/entity/firestore/FirestoreBook.java
 M agent/src/main/java/com/ethela/agent/exception/GlobalExceptionHandler.java
 M agent/src/main/java/com/ethela/agent/knowledge/KnowledgeDocumentService.java
 M agent/src/main/java/com/ethela/agent/knowledge/KnowledgeIndexWorker.java
 M agent/src/main/java/com/ethela/agent/mapper/KnowledgeDocumentRecordMapper.java
 M agent/src/main/java/com/ethela/agent/repository/ChatHistoryRepository.java
 M agent/src/main/java/com/ethela/agent/repository/FirestoreBookRepository.java
 M agent/src/main/java/com/ethela/agent/service/EnterpriseMembershipPolicy.java
 M agent/src/main/java/com/ethela/agent/service/WorkspaceAuthorizationService.java
 M agent/src/main/java/com/ethela/agent/service/WorkspacePermission.java
 M agent/src/main/resources/application.properties
 M agent/src/main/resources/mapper/KnowledgeDocumentRecordMapper.xml
 M agent/src/test/java/com/ethela/agent/knowledge/KnowledgeIndexWorkerTest.java
 M docs/KNOWLEDGE_BASE_API.md
 M docs/KNOWLEDGE_EXTRACTION_PLAN.md
 M docs/README.md
?? agent/src/main/java/com/ethela/agent/controller/FileController.java
?? agent/src/main/java/com/ethela/agent/entity/AccountFileEntity.java
?? agent/src/main/java/com/ethela/agent/entity/AccountFileReferenceEntity.java
?? agent/src/main/java/com/ethela/agent/mapper/AccountFileMapper.java
?? agent/src/main/java/com/ethela/agent/mapper/AccountFileReferenceMapper.java
?? agent/src/main/java/com/ethela/agent/service/files/AccountFileService.java
?? agent/src/main/java/com/ethela/agent/service/files/DocxService.java
?? agent/src/main/java/com/ethela/agent/service/files/MarkdownService.java
?? agent/src/main/java/com/ethela/agent/service/files/PdfService.java
?? agent/src/main/resources/db/migration/022_account_files.sql
?? agent/src/main/resources/db/migration/023_account_file_list_indexes.sql
?? agent/src/main/resources/db/migration/024_account_file_deletion.sql
?? agent/src/main/resources/mapper/AccountFileMapper.xml
?? agent/src/main/resources/mapper/AccountFileReferenceMapper.xml
?? agent/src/test/java/com/ethela/agent/config/security/FirebaseAuthenticationFilterOptionsTest.java
?? agent/src/test/java/com/ethela/agent/controller/FileControllerTest.java
?? agent/src/test/java/com/ethela/agent/service/files/AccountFileServiceTest.java
?? docs/ACCOUNT_FILES_API.md
?? docs/KNOWLEDGE_INGESTION_ARCHITECTURE.md
```

## Recent Commits
- 2026-11-10 b221546 Upgrade Firebase Functions to Node 22
- 2026-11-10 b864b76 Fix dependency lockfile for clean installs
- 2026-11-10 e0aa5a5 Updates
- 2026-11-04 8345a7e Merge pull request #112 from adarshbhattarai/feature/enterprise-workspace-changes
- 2026-11-04 fce0164 redesign the enterprise-workspace and introduced tanstack(reqct-query)
- 2026-10-29 819f04b Merge pull request #111 from adarshbhattarai/feature/api-key-ui
- 2026-10-27 7635dc1 Fix API key dialog smoke test expectations
- 2026-10-27 a4a054e api-key-ui

## High-Signal Paths
- /Users/adarshbhattarai/code/Airabook/Airabook/src/App.jsx
- /Users/adarshbhattarai/code/Airabook/Airabook/src/config/serviceEndpoints.js
- /Users/adarshbhattarai/code/Airabook/Airabook/src/services/ApiService.js
- /Users/adarshbhattarai/code/Airabook/Airabook/functions/index.js
- /Users/adarshbhattarai/code/Airabook/Airabook/functions/airabookaiStream.js
- /Users/adarshbhattarai/code/Airabook/Agent/agent/src/main/java/com/ethela/agent/service/UnifiedChatStreamService.java
- /Users/adarshbhattarai/code/Airabook/Agent/agent/src/main/java/com/ethela/agent/service/planner/PlannerAgentGraphService.java
