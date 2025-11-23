# 🔥 Firebase Environment Quick Reference

## Switch Firebase Projects

```bash
# Using npm scripts (recommended)
npm run firebase:use:dev    # Switch to dev
npm run firebase:use:qa     # Switch to QA
npm run firebase:use:prod   # Switch to production

# Using Firebase CLI
firebase use dev
firebase use qa
firebase use prod

# Check current project
firebase use
npm run firebase:projects
```

## Build for Different Environments

```bash
npm run dev              # Development (uses emulators)
npm run build:qa         # Build for QA
npm run build:prod       # Build for production
```

## Deploy to Different Environments

```bash
# Deploy everything
npm run deploy:qa        # Deploy to QA
npm run deploy:prod      # Deploy to production

# Deploy specific services
npm run deploy:qa:hosting      # Deploy hosting to QA
npm run deploy:qa:functions    # Deploy functions to QA
npm run deploy:prod:hosting    # Deploy hosting to production
npm run deploy:prod:functions  # Deploy functions to production
```

## Environment Files

Create these files with your Firebase config:
- `.env.development` - For local dev with emulators
- `.env.qa` - For QA environment
- `.env.production` - For production

## Project Configuration

Update `.firebaserc` with your project IDs:
```json
{
  "projects": {
    "default": "your-default-project-id",
    "dev": "your-dev-project-id",
    "qa": "your-qa-project-id",
    "prod": "your-prod-project-id"
  }
}
```

## Common Workflows

### Local Development
```bash
npm run emulators    # Start emulators (terminal 1)
npm run dev          # Start dev server (terminal 2)
```

### QA Testing
```bash
npm run firebase:use:qa
npm run build:qa
npm run deploy:qa:hosting
```

### Production Deployment
```bash
npm run firebase:use:prod
npm run build:prod
npm run deploy:prod:hosting
```

---

For detailed instructions, see [FIREBASE_ENVIRONMENTS_SETUP.md](./FIREBASE_ENVIRONMENTS_SETUP.md)

