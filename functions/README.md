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

