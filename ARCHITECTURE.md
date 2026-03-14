# Architecture

## Overview

Airabook is the frontend repository for the product. It combines:
- React 18 + Vite UI code
- Firebase client integrations for Auth, Firestore, and Storage
- Firebase Hosting configuration
- Firebase Cloud Functions for serverless operations and some AI-related endpoints
- Browser-side integration points into the Spring Boot backend at `/Users/adeshbhattarai/code/AiraAI/Agent`

This repo is not just UI. It owns both browser code and Firebase-hosted backend logic.

## Main Areas

### `src/`
The React application.

High-signal subareas:
- `components/`: shared widgets and feature UI
- `pages/`: route screens like books, dashboard, media, notes, donate, admin
- `services/`: API wrappers and frontend integration logic
- `config/`: runtime/env resolution and service endpoint mapping
- `context/`: auth/theme providers
- `lib/`: Firebase init, streaming helpers, validation, and utilities

### `functions/`
Firebase Cloud Functions and server-side support code.

High-signal subareas:
- `index.js`: exports and environment initialization
- `airabookaiStream.js`: AI streaming endpoint path
- `agents/`: agent-oriented helper services
- `flows/`: Genkit flow definitions
- `services/`: server-side domain helpers
- `tools/`: function-side tool modules
- `payments/`: Stripe/payment flows
- `tests/`: local and integration scripts

## Runtime Boundaries

### Browser-side frontend
Owned here:
- routing
- page state and UI interactions
- Firebase client SDK usage
- calling Firebase Functions
- calling Spring endpoints from the browser

Key files:
- `src/App.jsx`
- `src/config/runtimeConfig.js`
- `src/config/serviceEndpoints.js`
- `src/services/ApiService.js`

### Firebase Functions backend
Owned here:
- callable functions
- auth-backed Firestore mutations
- server-side AI or streaming helpers that still live in Firebase
- payments and webhook integrations

Key files:
- `functions/index.js`
- `functions/airabookaiStream.js`
- `functions/agents/agentServices.js`
- `functions/flows/*`

### Spring backend
Owned in `/Users/adeshbhattarai/code/AiraAI/Agent`:
- Spring Boot REST endpoints
- planner/chat/voice streaming and orchestration
- Spring AI Alibaba ReactAgent/Graph flows
- Java-side tools, prompts, and memory-aware workflows

Frontend Spring integration points currently show up in:
- `src/config/serviceEndpoints.js`
- `src/services/ApiService.js`
- feature-specific browser services under `src/services/`

## Request Path Patterns

### Firebase-native feature
1. UI event in `src/components/` or `src/pages/`
2. Client service or Firebase SDK call
3. Firebase Function and/or Firestore update
4. UI refresh through state/context/hooks

### Spring-backed feature
1. UI event in browser
2. endpoint resolution through runtime config and service endpoints
3. authenticated request through `ApiService` or feature service
4. Spring Boot backend handles planner/chat/voice/API logic
5. UI consumes response or stream

### Cross-repo AI feature
1. UI issues prompt or action
2. request may go to Firebase Functions or directly to Spring
3. Spring may run planner/chat/voice orchestration
4. response/stream returns to browser
5. UI renders cards, events, or assistant output

## Design Rules
- Keep browser-only code in `src/`.
- Keep privileged mutations and secrets in `functions/` or the Spring backend, never in client code.
- When the frontend references a Spring endpoint, document the backend file or route that owns it.
- When deprecating Firebase AI paths in favor of Spring, leave the boundary explicit rather than ambiguous.

## First Files To Inspect For Most Tasks
- `src/App.jsx`
- `src/config/serviceEndpoints.js`
- `src/services/ApiService.js`
- `functions/index.js`
- `/Users/adeshbhattarai/code/AiraAI/Agent/AGENTS.md`
