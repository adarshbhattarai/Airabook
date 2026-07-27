# Frontend Context Report

Generated: 2026-07-24 07:26:16Z

## Frontend Repo Snapshot
- Workspace: /Users/adarshbhattarai/code/Airabook/Airabook
- Branch: dev-video-flow
- HEAD: 9fe3b9d
- Backend repo: /Users/adarshbhattarai/code/Airabook/Agent

## Read First
- /Users/adarshbhattarai/code/Airabook/Airabook/AGENTS.md
- /Users/adarshbhattarai/code/Airabook/Airabook/ARCHITECTURE.md
- /Users/adarshbhattarai/code/Airabook/Airabook/README.md
- /Users/adarshbhattarai/code/Airabook/Airabook/SELF_UPDATE_WORKFLOW.md
- /Users/adarshbhattarai/code/Airabook/Agent/AGENTS.md

## Frontend Working Tree


```text
 M AGENTS.md
 M CLAUDE.md
 M MEDIA_STORAGE_AGENT.md
 M README.md
 M e2e/movies.spec.mjs
 M functions/createBook.js
 M functions/createPage.js
 M functions/deleteMedia.js
 M functions/mediaProcessor.js
 M functions/services/pageService.js
 M functions/updatePage.js
 M generated/frontend-context-report.md
 M package-lock.json
 M scripts/STRIPE_SCRIPT_USAGE.md
 M src/components/BlockEditor.jsx
 M src/components/ManimVideoDialog/index.jsx
 M src/components/PageEditor/index.jsx
 M src/config/serviceEndpoints.js
 M src/hooks/usePaginationReflow.js
 M src/index.css
 M src/pages/BookDetail.jsx
 M src/pages/Movies.jsx
 M src/services/videoJobsService.js
?? .codex/skills/airabook-ui-design/SKILL.md
?? functions/tests/page-media-unit-tests.cjs
?? functions/utils/pageMedia.js
?? src/lib/pageMedia.js
?? src/lib/pageMedia.test.mjs
```

## Backend Snapshot
- Branch: dev-AiraCleanUp
- HEAD: c71ba56


```text
 M agent/src/main/java/com/ethela/agent/entity/firestore/FirestorePage.java
 M agent/src/main/java/com/ethela/agent/service/video/ImageAssetBuilder.java
 M agent/src/main/java/com/ethela/agent/service/video/VideoPageClipWorkflowService.java
 M agent/src/test/java/com/ethela/agent/service/video/ImageAssetBuilderTest.java
 M agent/src/test/java/com/ethela/agent/service/video/VideoPageClipRenderPipelineTest.java
 M agent/src/test/java/com/ethela/agent/service/video/VideoPageClipWorkflowNodeTest.java
 M docs/MANIM_VIDEO_WORKFLOW.md
```

## Recent Commits
- 2026-03-27 9fe3b9d feat(video): Manim clip generation UI, e2e tests, emulator seed scripts
- 2026-03-22 84395fe Color match
- 2026-03-21 4a34b9b Video Flow
- 2026-03-21 233e993 Video flow idea
- 2026-03-21 69a272a Update
- 2026-03-21 0bed0a5 Update
- 2026-03-20 32a82aa Update
- 2026-03-20 9e0cbaf Update

## High-Signal Paths
- /Users/adarshbhattarai/code/Airabook/Airabook/src/App.jsx
- /Users/adarshbhattarai/code/Airabook/Airabook/src/config/serviceEndpoints.js
- /Users/adarshbhattarai/code/Airabook/Airabook/src/services/ApiService.js
- /Users/adarshbhattarai/code/Airabook/Airabook/functions/index.js
- /Users/adarshbhattarai/code/Airabook/Airabook/functions/airabookaiStream.js
- /Users/adarshbhattarai/code/Airabook/Agent/agent/src/main/java/com/ethela/agent/service/UnifiedChatStreamService.java
- /Users/adarshbhattarai/code/Airabook/Agent/agent/src/main/java/com/ethela/agent/service/planner/PlannerAgentGraphService.java
