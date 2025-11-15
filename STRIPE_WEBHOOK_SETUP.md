# Stripe Webhook Setup Guide

## Overview

Stripe webhooks allow Stripe to notify your application when payment events occur (e.g., payment completed, subscription created). This guide explains how to set up webhooks for local development and deployed environments.

## How Webhooks Work

```
┌─────────┐                    ┌──────────────┐                    ┌──────────┐
│ Stripe  │  ──Webhook Event──>│ Your Function│  ──Update DB──>   │ Firestore│
│         │                    │              │                    │          │
└─────────┘                    └──────────────┘                    └──────────┘
     │                                │
     │                                │
     └──Signs with secret─────────────┘
        (verifies authenticity)
```

## Local Development Setup

### Step 1: Get Webhook Secret from Stripe CLI

1. **Start Stripe CLI** (in a separate terminal):
   ```bash
   stripe listen --forward-to http://localhost:5001/demo-project/us-central1/stripeWebhook
   ```

2. **Copy the webhook signing secret** from the output:
   ```
   > Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxx (^C to quit)
   ```

3. **Add to `functions/.runtimeconfig.json`**:
   ```json
   {
     "stripe": {
       "secret_key": "sk_test_...",
       "webhook_secret": "whsec_xxxxxxxxxxxxx"  // ← Paste here
     },
     "app": {
       "public_url": "http://localhost:5173"
     }
   }
   ```

**Important**: This secret changes every time you restart `stripe listen`. Always use the one from your current session.

### Step 2: Test Locally

1. Make a test payment in your app
2. Watch Stripe CLI terminal - you'll see webhook events
3. Check Firestore emulator - payment records should appear

## Deployed Environment Setup

### For Each Environment (Dev/QA/Prod)

#### Step 1: Get Your Function URL

After deploying, your function URL will be:
- **Dev**: `https://us-central1-airabook-dev.cloudfunctions.net/stripeWebhook`
- **QA**: `https://us-central1-airabook-qa.cloudfunctions.net/stripeWebhook`
- **Prod**: `https://us-central1-airabook-prod.cloudfunctions.net/stripeWebhook`

#### Step 2: Create Webhook Endpoint in Stripe Dashboard

1. **Go to Stripe Dashboard**:
   - Test mode: https://dashboard.stripe.com/test/webhooks
   - Live mode: https://dashboard.stripe.com/webhooks

2. **Click "Add endpoint"**

3. **Enter your function URL**:
   ```
   https://us-central1-airabook-dev.cloudfunctions.net/stripeWebhook
   ```

4. **Select events to listen to**:
   - ✅ `checkout.session.completed`
   - ✅ `invoice.paid`
   - ✅ `payment_intent.succeeded` (optional)

5. **Click "Add endpoint"**

#### Step 3: Get the Signing Secret

1. **Click on the endpoint** you just created
2. **In "Signing secret" section**, click "Reveal"
3. **Copy the secret** (starts with `whsec_...`)

#### Step 4: Set in Firebase Functions Config

**For Dev Environment**:
```bash
firebase use dev
firebase functions:config:set \
  stripe.secret_key=sk_test_xxx \
  stripe.webhook_secret=whsec_xxx \
  app.public_url=https://airabook-dev.web.app
```

**For QA Environment**:
```bash
firebase use qa
firebase functions:config:set \
  stripe.secret_key=sk_test_xxx \
  stripe.webhook_secret=whsec_xxx \
  app.public_url=https://airabook-qa.web.app
```

**For Prod Environment**:
```bash
firebase use prod
firebase functions:config:set \
  stripe.secret_key=sk_live_xxx \
  stripe.webhook_secret=whsec_xxx \
  app.public_url=https://airabook-prod.web.app
```

**Note**: Use `sk_test_...` for dev/qa, `sk_live_...` for production.

#### Step 5: Redeploy Functions

After setting config, redeploy:
```bash
firebase deploy --only functions
```

## Environment Comparison

| Environment | Webhook Secret Source | Function URL | Stripe Mode |
|-------------|----------------------|--------------|-------------|
| **Local** | Stripe CLI (`stripe listen`) | `http://localhost:5001/demo-project/us-central1/stripeWebhook` | Test |
| **Dev** | Stripe Dashboard endpoint | `https://us-central1-airabook-dev.cloudfunctions.net/stripeWebhook` | Test |
| **QA** | Stripe Dashboard endpoint | `https://us-central1-airabook-qa.cloudfunctions.net/stripeWebhook` | Test |
| **Prod** | Stripe Dashboard endpoint | `https://us-central1-airabook-prod.cloudfunctions.net/stripeWebhook` | Live |

## Security Notes

1. **Never commit secrets** to git
   - `.runtimeconfig.json` should be gitignored
   - Use `.runtimeconfig.json.example` as a template

2. **Use different secrets** for each environment
   - Local: Temporary secret from Stripe CLI
   - Dev/QA: Test mode secrets from Stripe Dashboard
   - Prod: Live mode secrets from Stripe Dashboard

3. **Webhook verification** is critical
   - Your function verifies the webhook signature using the secret
   - This ensures the webhook actually came from Stripe
   - Never skip signature verification in production

## Troubleshooting

### Webhook Not Received Locally

1. **Check Stripe CLI is running**:
   ```bash
   stripe listen --forward-to http://localhost:5001/demo-project/us-central1/stripeWebhook
   ```

2. **Verify function is running**:
   - Check emulator UI: http://localhost:4000
   - Look for `stripeWebhook` function

3. **Check webhook secret matches**:
   - Must match the one shown in Stripe CLI output

### Webhook Not Received in Deployed Environment

1. **Verify endpoint URL** in Stripe Dashboard matches your function URL

2. **Check function logs**:
   ```bash
   firebase functions:log --only stripeWebhook
   ```

3. **Test webhook manually**:
   - In Stripe Dashboard → Webhooks → Your endpoint
   - Click "Send test webhook"
   - Check function logs for errors

4. **Verify config is set**:
   ```bash
   firebase functions:config:get
   ```

### Signature Verification Failed

- **Cause**: Webhook secret doesn't match
- **Solution**: 
  - Local: Use the secret from current `stripe listen` session
  - Deployed: Use the secret from Stripe Dashboard endpoint

## Quick Reference Commands

```bash
# Local Development
stripe listen --forward-to http://localhost:5001/demo-project/us-central1/stripeWebhook

# Set config for Dev
firebase use dev
firebase functions:config:set stripe.webhook_secret=whsec_xxx

# Set config for Prod
firebase use prod
firebase functions:config:set stripe.webhook_secret=whsec_xxx

# View current config
firebase functions:config:get

# Test webhook (in Stripe Dashboard)
# Webhooks → Your endpoint → "Send test webhook"
```

## Additional Resources

- [Stripe Webhooks Documentation](https://stripe.com/docs/webhooks)
- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)
- [Firebase Functions Config](https://firebase.google.com/docs/functions/config-env)

