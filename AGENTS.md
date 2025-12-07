# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React app (`components/`, `pages/`, `context/`, `lib/` for Firebase init/helpers); entry at `src/main.jsx`. Use the `@/` alias from `jsconfig.json` instead of deep relatives.
- `functions/`: Firebase Cloud Functions, admin helpers, and local test scripts; keep privileged logic here, not in `src/`. Deploys run from this folder when invoked by Firebase CLI.
- `public/` serves static assets; `dist/` is Vite build output (gitignored). `scripts/` holds emulator/Stripe helpers. Root configs: `firebase.json`, `firestore.rules`, `storage.rules`.

## Build, Test, and Development Commands
- Local with emulators: `npm run emulators:local` then `npm start` (alias `npm run local`).
- Local against dev backend: `npm run dev`.
- Builds: `npm run build:dev`, `build:qa`, `build:go`, `build:prod` (or `npm run build` for default production). Preview with `npm run preview` or `preview:qa`/`preview:go`.
- Emulator utilities: `npm run emulators:export` / `emulators:import` to persist data; seed fixtures via `npm run seed:data`.
- Cloud Functions checks: from project root `npm run test:auth`; deploy functions+hosting with `npm run deploy:dev|qa|go|prod`.

## Coding Style & Naming Conventions
- React + Tailwind with 2-space indentation, single quotes, semicolons, functional components, and hooks. Keep Tailwind classes in JSX; avoid ad-hoc global CSS outside `src/index.css`.
- Components use `PascalCase` filenames (`BookDetail.jsx`); hooks/utils use `camelCase`. Prefer the `@/` alias.
- Lint with the React App ESLint config: `npx eslint src` before committing JS/JSX changes.

## Testing Guidelines
- Primary loop is emulator smoke testing: `npm run emulators:local` → `npm start` → exercise auth, book/notes CRUD, media upload, routing.
- Use `npm run test:auth` for function auth sanity and `npm run seed:data` to stage sample data before manual checks.
- Add automated tests alongside features (`src/__tests__/` for UI; `functions/` for backend). Name tests after the behavior under test.

## Commit & Pull Request Guidelines
- Commit messages: imperative and scoped (e.g., `Add book cover cropper`, `Harden firestore media rules`); keep summaries concise.
- PRs should state intent, environment used (emulators vs `dev/qa/go/prod`), and any data/migration steps. Include screenshots or recordings for UI changes and link related issues.

## Security & Configuration Tips
- Never commit `.env.*.local` files or service account secrets. Update `firestore.rules` and `storage.rules` with feature changes and validate through emulators before deploying.
- Confirm the `--mode` flag and Firebase alias (`local`, `dev`, `qa`, `go`, `prod`) when switching environments to avoid cross-project writes.
