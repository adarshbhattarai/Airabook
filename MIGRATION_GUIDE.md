# 🔄 Cloud Functions Migration Guide

This guide explains how your cloud functions have been migrated to work with local emulators.

---

## 📋 What Changed

### ✅ Functions Migrated:
1. **`createBook`** - Creates baby books
2. **`uploadMedia`** - Handles image/video uploads
3. **`rewriteNote`** - AI text generation with Vertex AI
4. **`helloWorld`** - Test function

### ✅ Key Improvements:
- **Unified v2 format** - All functions use Firebase Functions v2
- **Local development support** - Works with emulators
- **Service account handling** - Graceful fallback for local dev
- **Dependencies updated** - All required packages added

---

## 🔧 Service Account Key - Do You Need It?

### For Local Development: **OPTIONAL** ✅

**Your functions will work WITHOUT the service account key** because:

1. **Emulators handle authentication** - No real Firebase auth needed
2. **Local storage emulator** - Files stored locally, not in cloud
3. **Graceful fallback** - Code tries to load key, continues if not found

### For Production: **REQUIRED** ✅

**You DO need the service account key for:**
- Real Firebase Storage uploads
- Vertex AI API calls
- Production authentication

---

## 🚀 How to Use

### 1. Start Emulators with Functions
```bash
# Start all emulators (including functions)
npm run emulators:debug

# Or just functions
firebase emulators:start --only functions
```

### 2. Test Your Functions

**From your React app:**
```javascript
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

// Test createBook
const createBookFunction = httpsCallable(functions, 'createBook');
const result = await createBookFunction({
  title: "My Baby Book",
  creationType: "auto-generate"
});

// Test rewriteNote
const rewriteFunction = httpsCallable(functions, 'rewriteNote');
const rewritten = await rewriteFunction({
  text: "My baby is so cute",
  style: "Warm & supportive"
});
```

**Direct HTTP calls:**
```bash
# Test helloWorld
curl http://localhost:5001/demo-project/us-central1/helloWorld

# Test uploadMedia (with auth token)
curl -X POST http://localhost:5001/demo-project/us-central1/uploadMedia \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@path/to/image.jpg"
```

---

## 📁 File Structure

```
functions/
├── index.js                 # Main entry point
├── createBook.js           # Book creation logic
├── imageProcessor.js       # Media upload handling
├── textGenerator.js        # AI text generation
├── serviceAccountKey.json  # Service account (local dev)
├── package.json            # Dependencies
└── .gitignore             # Git ignore rules
```

---

## 🔍 Function Details

### 1. `createBook` Function

**Type:** Callable HTTPS function

**Parameters:**
```javascript
{
  title: "Baby's Name",
  creationType: "auto-generate" | "blank"
}
```

**Returns:**
```javascript
{
  success: true,
  bookId: "abc123",
  message: "Book created successfully!"
}
```

**Local Behavior:**
- ✅ Creates book in Firestore emulator
- ✅ Updates user's accessible books
- ✅ Generates default chapters if auto-generate

### 2. `uploadMedia` Function

**Type:** HTTP Request function

**Usage:**
```javascript
// From frontend
const formData = new FormData();
formData.append('image', file);

fetch('http://localhost:5001/demo-project/us-central1/uploadMedia', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${idToken}`
  },
  body: formData
});
```

**Local Behavior:**
- ✅ Uploads to Storage emulator
- ✅ Creates mediaUrls document in Firestore
- ✅ Returns signed URLs (local emulator URLs)

### 3. `rewriteNote` Function

**Type:** Callable HTTPS function

**Parameters:**
```javascript
{
  text: "Original text",
  style: "Warm & supportive" | "Improve clarity" | "Concise summary" | "Fix grammar only"
}
```

**Returns:**
```javascript
{
  rewritten: "AI-generated improved text"
}
```

**Local Behavior:**
- ⚠️ **Requires Vertex AI credentials** for real AI generation
- ✅ Falls back gracefully if no credentials
- ✅ Can be mocked for testing

### 4. `helloWorld` Function

**Type:** HTTP Request function

**Usage:**
```bash
curl http://localhost:5001/demo-project/us-central1/helloWorld
```

**Returns:**
```
"Hello from Firebase!"
```

---

## 🐛 Debugging Your Functions

### 1. View Function Logs
```bash
# In terminal where emulators are running
# All console.log statements appear here
```

### 2. Use VSCode Debugger
```bash
# Start emulators with debug
npm run emulators:debug

# Attach VSCode debugger
# Set breakpoints in functions/index.js
```

### 3. Test Individual Functions
```javascript
// In browser console
const functions = firebase.functions();
const helloWorld = functions.httpsCallable('helloWorld');
helloWorld().then(result => console.log(result));
```

---

## 🔐 Authentication in Local Development

### For Callable Functions (createBook, rewriteNote):
```javascript
// Your React app automatically handles auth
const result = await httpsCallable(functions, 'createBook')({
  title: "Test Book"
});
// ✅ User auth context is automatically passed
```

### For HTTP Functions (uploadMedia, helloWorld):
```javascript
// You need to manually pass auth token
const idToken = await user.getIdToken();
fetch('http://localhost:5001/demo-project/us-central1/uploadMedia', {
  headers: {
    'Authorization': `Bearer ${idToken}`
  }
});
```

---

## 🚨 Common Issues & Solutions

### Issue 1: "Function not found"
**Error:** `Function not found: createBook`

**Solutions:**
- ✅ Restart emulators after code changes
- ✅ Check function name matches exactly
- ✅ Verify function is exported in index.js

### Issue 2: "Unauthorized" for uploadMedia
**Error:** `401 Unauthorized`

**Solutions:**
- ✅ Ensure user is logged in
- ✅ Pass Authorization header with Bearer token
- ✅ Check token is valid

### Issue 3: Vertex AI not working
**Error:** `Failed to generate text`

**Solutions:**
- ✅ Set up Google Cloud credentials
- ✅ Enable Vertex AI API
- ✅ Check project ID matches

### Issue 4: Service account key not found
**Error:** `Cannot find module './serviceAccountKey.json'`

**Solutions:**
- ✅ This is normal for local development
- ✅ Functions will use emulator authentication
- ✅ Only needed for production deployment

---

## 🎯 Testing Strategy

### 1. Unit Testing
```javascript
// Test individual functions
const { createBook } = require('./createBook');
// Mock request/response objects
```

### 2. Integration Testing
```javascript
// Test with emulators
// Use your existing test.js file
```

### 3. End-to-End Testing
```javascript
// Test from React app
// Create book, upload media, rewrite text
```

---

## 🚀 Deployment

### Deploy to Production
```bash
# Deploy all functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:createBook
```

### Environment Variables
For production, set these in Firebase Console:
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account
- `VERTEX_AI_PROJECT_ID` - Your project ID
- `VERTEX_AI_LOCATION` - Region (us-central1)

---

## 📊 Performance Considerations

### Local Development:
- ✅ Fast iteration with emulators
- ✅ No cloud costs
- ✅ Offline development

### Production:
- ⚠️ Vertex AI has costs per request
- ⚠️ Storage has costs per GB
- ⚠️ Functions have execution time limits

---

## 🎉 Summary

**Your functions are now ready for local development!**

### What Works Locally:
- ✅ `createBook` - Full functionality
- ✅ `uploadMedia` - With emulator storage
- ✅ `helloWorld` - Simple test function
- ⚠️ `rewriteNote` - Needs Vertex AI setup

### Next Steps:
1. **Test functions** with emulators
2. **Set up Vertex AI** for text generation
3. **Deploy to production** when ready
4. **Add more functions** as needed

### Commands to Remember:
```bash
# Start emulators
npm run emulators:debug

# Install dependencies
cd functions && npm install

# Deploy to production
firebase deploy --only functions
```

---

**Happy coding with your local Firebase Functions!** 🚀
