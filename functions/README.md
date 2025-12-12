# Firebase Functions - Quick Reference

## 🚀 Getting Started

### Local Development
```bash
# Start emulators (from project root)
firebase emulators:start

# Start with debugging enabled
firebase emulators:start --inspect-functions
```

### Deployed Functions
```bash
# Deploy all functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:createBook

# View logs
firebase functions:log
```

---

## 📁 Available Functions

### `createBook`
Creates a new baby book for the authenticated user.

**Type:** Callable HTTPS function

**Parameters:**
- `title` (string, required) - The name of the baby
- `creationType` (string, required) - Either "auto-generate" or "blank"

**Returns:**
```javascript
{
  success: true,
  bookId: "abc123",
  message: "Book created successfully!"
}
```

**Usage in React:**
```javascript
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

const createBookFunction = httpsCallable(functions, 'createBook');
const result = await createBookFunction({
  title: "Baby's Name",
  creationType: "auto-generate"
});
console.log('Book ID:', result.data.bookId);
```

**Authentication:** Required

**Firestore Operations:**
1. Creates document in `books` collection
2. Updates user's `accessibleBookIds` array

---

### `onBookCreated` (Trigger)
Automatically runs when a new book is created.

**Type:** Firestore trigger

**Triggered by:** New document in `books` collection

**Use cases:**
- Send welcome email
- Update analytics
- Create related documents

---

## 🐛 Debugging Quick Tips

### 1. View Logs in Terminal
All `console.log()` statements appear in the terminal where you ran `firebase emulators:start`.

### 2. Emulator UI
Open `http://localhost:4000` and click "Logs" tab for visual debugging.

### 3. Add Debug Logs
```javascript
exports.myFunction = onCall(async (request) => {
  console.log('🎯 Function called with:', request.data);
  console.log('👤 User:', request.auth?.uid);
  
  try {
    // Your code
    const result = await doSomething();
    console.log('✅ Success:', result);
    return result;
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
});
```

### 4. Test from Frontend
Check browser console (F12) for error messages when calling functions.

---

## 📦 Project Structure

```
functions/
├── index.js           # Your functions code
├── package.json       # Dependencies
├── node_modules/      # Installed packages
└── README.md         # This file
```

---

## 🔧 Common Issues

### Function Not Updating
**Problem:** Changes to function code not reflected

**Solution:** Restart emulators (Ctrl+C, then `firebase emulators:start`)

### Authentication Errors
**Problem:** "User must be authenticated"

**Solution:** 
- Check user is logged in
- Verify `request.auth` exists
- Check emulator connection

### Firestore Database Configuration
**Note:** This project uses the **default Firestore database**.

All functions use `admin.firestore()` without specifying a database ID, which automatically uses the default database in both development (emulators) and production environments.

---

## 🔒 Deployment & Permissions (403/CORS)

### Issue: 403 Forbidden / CORS Error on New Environments
If you see `403` or `CORS` errors on a new environment (e.g., `qa`, `go`) but not on `dev`, it's because **Gen 2 Functions are private by default**.

### Fix 1: Code Configuration
We added `invoker: 'public'` to our function definitions:
```javascript
exports.myFunc = onCall({ invoker: 'public', ... }, ...);
```

### Fix 2: Manual Cloud Run Policy Override
If the error persists after deployment, the IAM policy might not have updated. Fix it with `gcloud`:

```bash
# Example for 'createUserDoc' function on 'airabook-qa' project
gcloud run services add-iam-policy-binding createuserdoc \
  --region=us-central1 \
  --project=airabook-qa \
  --member=allUsers \
  --role=roles/run.invoker
```

Shortcut to fix every callable in an environment (uses the `deployment-callable=true` label Firebase adds to `onCall` Gen 2 functions):

```bash
PROJECT=airabook-qa
REGION=us-central1

for svc in $(gcloud run services list \
  --platform=managed \
  --region=$REGION \
  --project=$PROJECT \
  --format='value(metadata.name)' \
  --filter='metadata.labels.deployment-callable=true'); do

  echo "Granting allUsers invoker on $svc..."
  gcloud run services add-iam-policy-binding "$svc" \
    --region=$REGION \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --project=$PROJECT
done
```

To double-check a specific callable’s IAM (e.g., when seeing CORS/403 on a higher environment):

```bash
gcloud run services get-iam-policy querybookflow \
  --region=us-central1 \
  --project=airabook-qa \
  --format=json
```

Confirm `roles/run.invoker` includes `allUsers`. If not, rerun the loop above for that environment.

See `.agent/workflows/troubleshoot_cloud_run_permissions.md` for a full guide.

---

## 🚀 Firebase Functions – Deployment & Permissions Guide

This project uses Firebase Cloud Functions (Gen 2) with multiple environments: `airabook-dev`, `airabook-qa`, `airabook-go`, and `airabook-prod`. Gen 2 functions run on Cloud Run, which changes how permissions and callable/public access work. Use this guide to deploy and configure all environments consistently.

### 1. Deploying Functions to Any Environment
```bash
firebase deploy --project <PROJECT_ID>
```
Examples:
```bash
firebase deploy --project airabook-dev
firebase deploy --project airabook-qa
firebase deploy --project airabook-go
firebase deploy --project airabook-prod
```

### 2. Gen 2 Callable Functions Are Private by Default
Any `onCall()` function becomes a private Cloud Run service unless opened. If not public, the browser may see CORS failures, `Unauthenticated`, HTTP 403 on `OPTIONS`, or `FirebaseError: internal`. Cloud Run logs will show “The request was not authenticated. Either allow unauthenticated invocations…”. Fix by granting public access.

### 3. Enabling Public Access for All Callable Functions
All callable functions exported via `exports.myFunction = onCall({...});` need:
```
allUsers → roles/run.invoker
```

**Automatic script (recommended)** — run after every deployment per environment:
```bash
PROJECT=<PROJECT_ID>
REGION=us-central1

for svc in $(gcloud run services list \
  --platform=managed \
  --region=$REGION \
  --project=$PROJECT \
  --format='value(metadata.name)' \
  --filter='metadata.labels.deployment-callable=true'); do

  echo "Granting allUsers invoker on $svc..."
  gcloud run services add-iam-policy-binding "$svc" \
    --region=$REGION \
    --member="allUsers" \
    --role="roles/run.invoker" \
    --project=$PROJECT
done
```
Run it like:
```bash
PROJECT=airabook-qa   # or airabook-go / airabook-prod
# then run the loop above
```
This ensures every callable function in that environment is publicly invokable from your frontend.

### 4. Fixing Deployment Errors (`iam.serviceaccounts.actAs`)
If deployment logs contain `Caller is missing permission 'iam.serviceaccounts.actAs'`, Cloud Functions cannot impersonate the Compute Engine default service account. Fix per project:
```bash
PROJECT=<PROJECT_ID>
PROJECT_NUM=$(gcloud projects describe $PROJECT --format="value(projectNumber)")

gcloud iam service-accounts add-iam-policy-binding \
  "$PROJECT_NUM-compute@developer.gserviceaccount.com" \
  --member="serviceAccount:firebase-adminsdk-fbsvc@$PROJECT.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project=$PROJECT
```

### 5. Environment Variable & Secrets Notes
This project uses Firebase Functions v2 parameters + Secrets.
To pull secrets into GitHub Actions:
```bash
firebase functions:secrets:access --project <PROJECT_ID>
```
Every environment must separately store OpenAI/Gemini keys, Stripe secrets, app base URLs, and other env-specific secrets. Secrets do not copy across projects.

### 6. Workflow Summary (per environment)
1) Deploy: `firebase deploy --project <PROJECT_ID>`
2) Make callables public: run the auto-binding script above
3) Fix `actAs` permissions (first time only) if deploy fails

### 7. Troubleshooting Quick Reference
| Symptom                               | Cause                              | Fix                                    |
| ------------------------------------- | ---------------------------------- | -------------------------------------- |
| CORS blocked, no Access-Control-Allow-Origin | Cloud Run function is private      | Grant `allUsers → roles/run.invoker`    |
| `FirebaseError: internal`             | Cloud Run rejects OPTIONS          | Same as above                          |
| 403 on deploy                         | Missing `iam.serviceAccountUser`   | Run `actAs` fix command                |
| `GEMINI_API_KEY not found`            | Secret missing in project          | Add secret for that environment        |
| Dev works, QA doesn’t                 | IAM not applied in QA              | Run public-access script               |

### 8. Notes on Code Behavior
`onCall({ cors: true })` does not handle CORS when the Cloud Run service is private. Allowing `allUsers` only bypasses Cloud Run’s HTTP gate; you still enforce auth inside the function.

---

### 9. New Environment Bootstrap (e.g., `go`/`prod`)
Use these once when standing up a fresh project (replace `PROJECT_ID`/`PROJECT_NUM` and `CI_SA_EMAIL`):

```bash
# Enable Firebase Storage API (same as clicking “Get started” in Console)
gcloud services enable firebasestorage.googleapis.com --project=PROJECT_ID

# Let CI see API status (pick one)
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:CI_SA_EMAIL" \
  --role="roles/serviceusage.serviceUsageViewer"
# or broader
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:CI_SA_EMAIL" \
  --role="roles/editor"

# Allow CI to impersonate default service accounts for Gen 2 deploys
gcloud iam service-accounts add-iam-policy-binding \
  "PROJECT_ID@appspot.gserviceaccount.com" \
  --member="serviceAccount:CI_SA_EMAIL" \
  --role="roles/iam.serviceAccountUser" \
  --project=PROJECT_ID

PROJECT_NUM=123456789012  # from gcloud projects describe
gcloud iam service-accounts add-iam-policy-binding \
  "$PROJECT_NUM-compute@developer.gserviceaccount.com" \
  --member="serviceAccount:CI_SA_EMAIL" \
  --role="roles/iam.serviceAccountUser" \
  --project=PROJECT_ID

# Pub/Sub + Eventarc plumbing for Gen 2 background functions
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:service-$PROJECT_NUM@gs-project-accounts.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:service-$PROJECT_NUM@gcp-sa-pubsub.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:$PROJECT_NUM-compute@developer.gserviceaccount.com" \
  --role="roles/run.invoker"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:$PROJECT_NUM-compute@developer.gserviceaccount.com" \
  --role="roles/eventarc.eventReceiver"

# Eventarc service agent access to buckets/triggers
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:service-$PROJECT_NUM@gcp-sa-eventarc.iam.gserviceaccount.com" \
  --role="roles/eventarc.serviceAgent"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:service-$PROJECT_NUM@gcp-sa-eventarc.iam.gserviceaccount.com" \
  --role="roles/storage.admin"

# If service identities are missing in a brand-new project, create them first:
gcloud beta services identity create --service=eventarc.googleapis.com --project=PROJECT_ID
gcloud beta services identity create --service=pubsub.googleapis.com --project=PROJECT_ID
gcloud beta services identity create --service=storage.googleapis.com --project=PROJECT_ID
```

### 10. Deployment Troubleshooting (recent errors)
- **Deploy fails: “Please assign Cloud Functions Admin”**  
  Grant the deployer (or CI SA) `roles/cloudfunctions.admin` on the target project:  
  `gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:CI_SA_EMAIL" --role="roles/cloudfunctions.admin"`

- **Gen 2 storage triggers 403 `storage.buckets.get` / Eventarc permission**  
  1) Make sure the default bucket exists (Console → Storage → Get started or `gcloud services enable firebasestorage.googleapis.com`).  
  2) Ensure Eventarc service agent has permissions:  
  `PROJECT_NUM=$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')`  
  `gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:service-$PROJECT_NUM@gcp-sa-eventarc.iam.gserviceaccount.com" --role="roles/eventarc.serviceAgent"`  
  `gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:service-$PROJECT_NUM@gcp-sa-eventarc.iam.gserviceaccount.com" --role="roles/storage.admin"`  
  3) Confirm compute default has Eventarc/Run roles (see bootstrap section). Retry after a few minutes for propagation.

- **Artifact cleanup warning**  
  Set a cleanup policy to avoid container image build-up:  
  `firebase functions:artifacts:setpolicy --project PROJECT_ID --location us-central1 --days 30 --force`  
  (if the Artifact Registry repo doesn’t exist yet, deploy functions once, then rerun)  
  (or add `--force` to `firebase deploy` once to auto-create the policy)

### 11. Production/Go Quick Checklist (new project setup)
1) Enable Firebase Storage in Console (`Storage` → Get Started).  
2) Create service identities if missing:  
   `gcloud beta services identity create --service=eventarc.googleapis.com --project=PROJECT_ID`  
   `gcloud beta services identity create --service=pubsub.googleapis.com --project=PROJECT_ID`  
   `gcloud beta services identity create --service=storage.googleapis.com --project=PROJECT_ID`  
3) Grant IAM:  
   - Storage SA `service-$PROJECT_NUM@gs-project-accounts.iam.gserviceaccount.com` → `roles/storage.admin` (fixes `defaultBucket` 403).  
   - Eventarc SA `service-$PROJECT_NUM@gcp-sa-eventarc.iam.gserviceaccount.com` → `roles/eventarc.serviceAgent` + `roles/storage.admin`.  
   - Pub/Sub SA `service-$PROJECT_NUM@gcp-sa-pubsub.iam.gserviceaccount.com` → `roles/iam.serviceAccountTokenCreator`.  
   - Pub/Sub storage SA `service-$PROJECT_NUM@gs-project-accounts.iam.gserviceaccount.com` → `roles/pubsub.publisher`.  
   - Compute default `$PROJECT_NUM-compute@developer.gserviceaccount.com` → `roles/run.invoker`, `roles/eventarc.eventReceiver`; optionally `roles/storage.objectAdmin` if storage triggers still fail.  
   - App Engine default `PROJECT_ID@appspot.gserviceaccount.com` → `roles/iam.serviceAccountUser` for CI SA.  
   - Cloud Functions service identity `service-$PROJECT_NUM@gcf-admin-robot.iam.gserviceaccount.com` → `roles/cloudfunctions.admin`, `roles/run.admin`, `roles/eventarc.serviceAgent`, `roles/iam.serviceAccountTokenCreator` (and temporarily `roles/editor` if setup is flaky).  
   - CI SA (`firebase-adminsdk-…@$PROJECT_ID.iam.gserviceaccount.com`) → `roles/cloudfunctions.admin`, `roles/serviceusage.serviceUsageViewer`, `roles/iam.serviceAccountUser` on compute/appspot.  
4) Create App Engine app once (required for Firebase deploy tooling):  
   `gcloud app create --project=PROJECT_ID --region=us-central`  
5) Deploy (`firebase deploy --project <alias>`), then set Artifact cleanup:  
   `firebase functions:artifacts:setpolicy --project <alias> --location us-central1 --days 30 --force` (after first functions deploy; resolves cleanup policy warnings).  
6) Make callables public (per env): run the `deployment-callable=true` loop to add `allUsers → roles/run.invoker`.  
7) If you see `defaultBucket` 403 again, re-check step 1 and the Storage SA binding. If storage triggers fail validation, re-check Eventarc SA/storage.admin and compute eventReceiver.  
8) Enable Firebase Extensions API if deploy prompts:  
   `gcloud services enable firebaseextensions.googleapis.com --project=PROJECT_ID`
9) Ensure Cloud Billing API is enabled (if deploy/tooling prompts):  
   `gcloud services enable cloudbilling.googleapis.com --project=PROJECT_ID`
10) Create Cloud Functions service identity (if `gcf-admin-robot` not found):  
   `gcloud beta services identity create --service=cloudfunctions.googleapis.com --project=PROJECT_ID`  
   Then grant it:  
   `gcloud projects add-iam-policy-binding PROJECT_ID --member="serviceAccount:service-$PROJECT_NUM@gcf-admin-robot.iam.gserviceaccount.com" --role="roles/iam.serviceAccountTokenCreator"`  
   Optionally `roles/editor` during first setup if needed.

## 📚 Learn More

- Full debugging guide: See `FUNCTIONS_DEBUG_GUIDE.md` in project root
- Firebase Functions docs: https://firebase.google.com/docs/functions
- Emulator documentation: https://firebase.google.com/docs/emulator-suite

---

## 🎯 Next Steps

1. Test `createBook` function from your app
2. Check logs in terminal or Emulator UI
3. Add more functions as needed
4. Deploy to production when ready: `firebase deploy --only functions`

