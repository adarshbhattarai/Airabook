# AI Credit And Storage Policy

Use this file when changing:
- AI credit charging
- image generation cost
- storage usage accounting
- monthly credit grants
- scheduled billing maintenance

This document is the intended product policy for credits and storage.
If code conflicts with this document, treat the code as drift to be fixed.

## Core Policy

Airabook credits should be charged for **AI usage**, not for simply storing files.

That means:
- AI text features can charge credits
- AI image generation can charge credits
- voice / transcription / TTS can charge credits
- plain file storage should **not** deduct credits on a daily schedule

## Storage Policy

`quotaCounters.storageBytesUsed` is a tracking field, not a billing field.

It should be used for:
- showing storage usage in the UI
- quota visibility
- future reporting / limits
- debugging uploads and deletes

It should be updated:
- when media is uploaded successfully
- when media is deleted successfully

It should **not** by itself trigger a daily credit deduction.

## Upload And Delete Accounting

When a user uploads a file:
- Storage accepts the file
- the Storage trigger updates album/media metadata
- the server increments `quotaCounters.storageBytesUsed`

When a user deletes a file:
- deletion should go through the server-side delete flow
- the server decrements `quotaCounters.storageBytesUsed`

The client must not directly mutate storage byte counters.

## AI Charging Policy

Credits should be deducted when an AI feature is actually used.

Examples:
- rewrite text
- generate chapter suggestions
- generate page content
- voice / STT / TTS flows
- generate image

If a feature uses model tokens or other billable AI work, it should call `consumeCredits(...)`.

## Image Generation Policy

Image generation is a billable AI action.

Current intended policy:
- each generated image should charge about `24` credits
- this should be enforced in the server-side image generation flow
- the charge should happen before the expensive model/provider call

Relevant implementation path:
- `/Users/adeshbhattarai/code/Airabook/functions/generateImage.js`

Important note:
- the current code should be checked against this policy because the configured minimum credit charge may differ from `24`

## Monthly Credit Grant Policy

Monthly included credits should be refreshed lazily and idempotently.

Preferred behavior:
- when the user signs in or the app loads billing state
- when billing is refreshed
- before spending credits

The grant logic should be keyed by billing period so it does not double-grant.

A global scheduled scan across all users should not be the primary source of monthly credit refresh because it scales reads/writes with total user count.

## Scheduled Maintenance Policy

Scheduled maintenance should be minimal and should not scan the entire `users` collection for monthly grants.

Scheduled maintenance should **not**:
- deduct credits only because `storageBytesUsed > 0`
- refresh monthly credits for every user in the system

Current preferred implementation:
- do not export an active scheduler for monthly credit refresh
- refresh only for the authenticated user through a callable/bootstrap path

## Usage Event Policy

Usage events should explain why credits were deducted.

Each billable AI action should record:
- `feature`
- `source`
- `provider`
- token / usage metadata when available
- `creditsCharged`
- `creditsDeducted`

Storage-only changes should not create a credit charge event unless product policy explicitly changes later.

## Guardrails

- Do not charge credits for plain avatar, cover, album asset, or page media uploads.
- Do not charge daily storage retention credits.
- Do not derive credit deductions from `storageBytesUsed` alone.
- Keep `storageBytesUsed` accurate even if storage is not billed.
- Keep AI billing server-side, not in the client.

## Source Of Truth Files

- `/Users/adeshbhattarai/code/Airabook/CREDIT_BILLING_AGENT.md`
- `/Users/adeshbhattarai/code/Airabook/MEDIA_STORAGE_AGENT.md`
- `/Users/adeshbhattarai/code/Airabook/functions/payments/creditLedger.js`
- `/Users/adeshbhattarai/code/Airabook/functions/payments/processCreditMaintenance.js`
- `/Users/adeshbhattarai/code/Airabook/functions/generateImage.js`

## Quick Prompt For Future Agents

```text
Open /Users/adeshbhattarai/code/Airabook/AI_CREDIT_STORAGE_POLICY.md first.
Airabook should charge credits for AI usage, not for plain file storage. `storageBytesUsed` is for tracking uploads/deletes and quota visibility only. Image generation is billable and should charge about 24 credits server-side. Monthly credit grants should be lazy + idempotent, with cron used only as a repair/backstop, not as daily storage billing.
```
