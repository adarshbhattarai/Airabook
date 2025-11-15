# Webhook Secret Management Guide

## Quick Answer

**Local Development**: Update every time you restart `stripe listen` (secret changes)  
**Deployed Environments**: One-time setup per environment (secret persists)

## Detailed Breakdown

### Local Development (Emulator)

**Frequency**: Every time you restart Stripe CLI

**Why**: Stripe CLI generates a new webhook signing secret each time you run `stripe listen`

**Workflow**:
1. Start Stripe CLI: `stripe listen --forward-to http://localhost:5001/demo-project/us-central1/stripeWebhook`
2. Copy the `whsec_...` secret from output
3. Update `functions/.runtimeconfig.json` with the new secret
4. Restart your emulators if needed

**Tip**: Keep Stripe CLI running in a separate terminal window to avoid restarting frequently.

### Deployed Environments (Dev/QA/Prod)

**Frequency**: One-time setup per environment

**Why**: Webhook endpoints in Stripe Dashboard have permanent signing secrets

**Workflow**:
1. **First time setup** (one-time per environment):
   ```bash
   # For Dev
   firebase use dev
   firebase functions:config:set stripe.webhook_secret=whsec_xxx
   
   # For QA  
   firebase use qa
   firebase functions:config:set stripe.webhook_secret=whsec_xxx
   
   # For Prod
   firebase use prod
   firebase functions:config:set stripe.webhook_secret=whsec_xxx
   ```

2. **Secret persists** until you:
   - Delete the webhook endpoint in Stripe Dashboard
   - Manually change it via `firebase functions:config:set`
   - Rotate secrets for security

**Important**: Once set, you don't need to reconfigure unless you:
- Create a new webhook endpoint
- Rotate secrets for security
- Switch Stripe accounts

## File Management

### What Gets Committed to Git

✅ **Commit these** (safe, no secrets):
- `.runtimeconfig.json.example` - Template file with placeholders
- `.gitignore` - Ensures `.runtimeconfig.json` is never committed

❌ **Never commit** (contains secrets):
- `.runtimeconfig.json` - Contains actual webhook secrets
- Any file with real Stripe keys

### File Structure

```
functions/
├── .gitignore                    # ✅ Committed (ignores .runtimeconfig.json)
├── .runtimeconfig.json.example   # ✅ Committed (template)
└── .runtimeconfig.json           # ❌ Gitignored (your actual secrets)
```

## How to Remember

### Option 1: Use the Example File

1. Copy the example file:
   ```bash
   cd functions
   cp .runtimeconfig.json.example .runtimeconfig.json
   ```

2. Fill in your secrets (this file is gitignored)

3. When Stripe CLI gives you a new secret, just update the file

### Option 2: Create a Setup Script

Create `scripts/setup-stripe-local.sh`:

```bash
#!/bin/bash
echo "Starting Stripe CLI..."
echo "Copy the webhook secret (whsec_...) when it appears"
echo ""
stripe listen --forward-to http://localhost:5001/demo-project/us-central1/stripeWebhook
```

### Option 3: Document Your Workflow

Add to your project's `README.md` or create a `SETUP.md`:

```markdown
## Local Stripe Setup

1. Start Stripe CLI: `stripe listen --forward-to http://localhost:5001/demo-project/us-central1/stripeWebhook`
2. Copy webhook secret from output
3. Update `functions/.runtimeconfig.json`:
   ```json
   {
     "stripe": {
       "webhook_secret": "whsec_PASTE_HERE"
     }
   }
   ```
4. Restart emulators if needed
```

## Checklist

### First Time Setup (One-Time)

- [ ] Create `.runtimeconfig.json` from `.runtimeconfig.json.example`
- [ ] Get Stripe test keys from Dashboard
- [ ] Add `VITE_STRIPE_PUBLISHABLE_KEY` to `.env.localemulator`
- [ ] Set up webhook endpoints in Stripe Dashboard for each environment
- [ ] Configure Firebase Functions config for dev/qa/prod

### Daily Development

- [ ] Start Stripe CLI: `stripe listen --forward-to ...`
- [ ] Copy webhook secret from Stripe CLI output
- [ ] Update `functions/.runtimeconfig.json` if secret changed
- [ ] Start emulators: `npm run emulators:local`
- [ ] Start frontend: `npm start`

## Troubleshooting

### "Webhook secret doesn't match"

**Local**: Make sure you're using the secret from your current `stripe listen` session

**Deployed**: Verify the secret in Stripe Dashboard matches what's in Firebase config:
```bash
firebase functions:config:get stripe.webhook_secret
```

### "Forgot to update secret"

**Local**: Just restart Stripe CLI and update `.runtimeconfig.json`

**Deployed**: Check Stripe Dashboard → Webhooks → Your endpoint → Signing secret

## Best Practices

1. **Never commit secrets** - `.runtimeconfig.json` is gitignored for a reason
2. **Use example file** - Copy from `.runtimeconfig.json.example` as a template
3. **Document workflow** - Add setup steps to your README
4. **Separate environments** - Use different secrets for dev/qa/prod
5. **Rotate periodically** - Change webhook secrets every 90 days for security

## Summary

| Environment | Setup Frequency | Secret Source | Persistence |
|-------------|----------------|---------------|-------------|
| **Local** | Every Stripe CLI restart | Stripe CLI output | Temporary (until CLI restarts) |
| **Dev** | One-time | Stripe Dashboard | Permanent (until changed) |
| **QA** | One-time | Stripe Dashboard | Permanent (until changed) |
| **Prod** | One-time | Stripe Dashboard | Permanent (until changed) |

**Remember**: Local secrets change frequently, deployed secrets persist until you change them.

