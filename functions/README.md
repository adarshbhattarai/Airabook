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

### Firestore Database Not Found
**Problem:** "Database 'airabook' not found"

**Solution:** Already configured! Uses `db.settings({databaseId: 'airabook'})` in index.js

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

