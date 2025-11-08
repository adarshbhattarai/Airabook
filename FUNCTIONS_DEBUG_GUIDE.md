# 🔥 Firebase Functions Debugging Guide

This guide will help you debug Firebase Functions in your Airabook project.

---

## 🚀 Quick Start

### 1. Start Emulators
```bash
firebase emulators:start
```

The Functions emulator will be available at: `http://localhost:5001`

### 2. Start Your React App
```bash
npm run dev
```

Your app will automatically connect to the Functions emulator in development mode.

---

## 🛠️ Debugging Methods

### Method 1: Console Logs (Easiest)

**In your function code** (`functions/index.js`):
```javascript
exports.createBook = onCall(async (request) => {
  console.log('🎯 Function called!', request.data);
  console.log('👤 User ID:', request.auth?.uid);
  
  // Your logic here
  const result = doSomething();
  console.log('✅ Result:', result);
  
  return result;
});
```

**View logs in terminal** where you ran `firebase emulators:start`:
- All `console.log` statements appear in real-time
- Color-coded and timestamped automatically

---

### Method 2: Firebase Emulator UI

1. Open: `http://localhost:4000`
2. Click on **"Logs"** tab in the left sidebar
3. See all function invocations, errors, and logs
4. Filter by function name or severity

**Features:**
- ✅ Request/response inspection
- ✅ Execution time tracking
- ✅ Error stack traces
- ✅ Filter and search logs

---

### Method 3: VSCode Debugger (Advanced)

#### Step 1: Create Debug Configuration

Create `.vscode/launch.json`:
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to Functions Emulator",
      "port": 9229,
      "restart": true,
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/functions/**/*.js"]
    }
  ]
}
```

#### Step 2: Start Emulators with Inspect Flag
```bash
firebase emulators:start --inspect-functions
```

#### Step 3: Attach Debugger
1. Open VSCode
2. Go to Run & Debug (Ctrl+Shift+D)
3. Select "Attach to Functions Emulator"
4. Click green play button

#### Step 4: Set Breakpoints
- Click to the left of line numbers in `functions/index.js`
- Red dots appear = breakpoints set
- When function is called, execution pauses at breakpoints

---

### Method 4: Testing Functions Directly

#### Test via curl (Command Line)

**For callable functions:**
```bash
curl -X POST http://localhost:5001/demo-project/us-central1/createBook \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "title": "Test Book",
      "creationType": "blank"
    }
  }'
```

**Note:** This bypasses authentication. For testing with auth, use the Firebase SDK.

---

### Method 5: Chrome DevTools

1. Start emulators with inspect: `firebase emulators:start --inspect-functions`
2. Open Chrome and go to: `chrome://inspect`
3. Click "inspect" under your functions process
4. Use Chrome DevTools to debug (similar to frontend debugging)

---

## 🐛 Common Issues & Solutions

### Issue 1: Function Not Found
**Error:** `Function not found: createBook`

**Solutions:**
- ✅ Check `functions/index.js` has `exports.createBook`
- ✅ Restart emulators after code changes
- ✅ Check Firebase console for typos in function name

### Issue 2: Authentication Error
**Error:** `User must be authenticated`

**Debug:**
```javascript
exports.createBook = onCall(async (request) => {
  console.log('Auth:', request.auth);  // Should show uid, token
  console.log('User ID:', request.auth?.uid);
  
  if (!request.auth) {
    console.error('❌ No auth context!');
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }
  // ...
});
```

**Check:**
- User is logged in before calling function
- Emulator connection is working (see console)

### Issue 3: Data Not Received
**Error:** `undefined` when accessing `request.data`

**Debug:**
```javascript
exports.createBook = onCall(async (request) => {
  console.log('📦 Raw request:', JSON.stringify(request, null, 2));
  console.log('📦 Data received:', request.data);
  console.log('📦 Title:', request.data?.title);
  // ...
});
```

### Issue 4: Firestore Connection Issues
**Error:** `Failed to update Firestore`

**Debug:**
```javascript
try {
  const bookRef = await db.collection('books').add(bookData);
  console.log('✅ Book created:', bookRef.id);
} catch (error) {
  console.error('❌ Firestore error:', error.code, error.message);
  console.error('Full error:', JSON.stringify(error, null, 2));
  throw error;
}
```

---

## 📊 Monitoring & Performance

### Check Function Execution Time
```javascript
exports.createBook = onCall(async (request) => {
  const startTime = Date.now();
  
  // Your function logic
  const result = await doSomething();
  
  const endTime = Date.now();
  console.log(`⏱️ Execution time: ${endTime - startTime}ms`);
  
  return result;
});
```

### Monitor Memory Usage
```javascript
console.log('💾 Memory:', process.memoryUsage());
```

---

## 🧪 Testing Best Practices

### 1. Add Detailed Logs
```javascript
exports.createBook = onCall(async (request) => {
  console.log('=== CREATE BOOK FUNCTION START ===');
  console.log('Input:', request.data);
  
  try {
    console.log('Step 1: Validating input...');
    validateInput(request.data);
    
    console.log('Step 2: Creating book document...');
    const bookRef = await createBookDocument();
    
    console.log('Step 3: Updating user...');
    await updateUser(request.auth.uid, bookRef.id);
    
    console.log('=== CREATE BOOK FUNCTION SUCCESS ===');
    return { bookId: bookRef.id };
  } catch (error) {
    console.error('=== CREATE BOOK FUNCTION ERROR ===');
    console.error('Error:', error);
    throw error;
  }
});
```

### 2. Use Structured Logging
```javascript
function logInfo(message, data = {}) {
  console.log(JSON.stringify({
    level: 'INFO',
    message,
    data,
    timestamp: new Date().toISOString()
  }));
}

function logError(message, error) {
  console.error(JSON.stringify({
    level: 'ERROR',
    message,
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  }));
}
```

---

## 📝 Frontend Debugging

### In CreateBook.jsx:
```javascript
const handleCreateBook = async (e) => {
  e.preventDefault();
  
  console.log('🚀 Calling createBook function...');
  console.log('Data:', { title: babyName, creationType });
  
  try {
    const createBookFunction = httpsCallable(functions, 'createBook');
    const result = await createBookFunction({
      title: babyName,
      creationType: creationType,
    });
    
    console.log('✅ Function success:', result);
    console.log('📚 Book ID:', result.data.bookId);
  } catch (error) {
    console.error('❌ Function error:', error);
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    console.error('Error details:', error.details);
  }
};
```

---

## 🔍 Quick Debug Checklist

Before debugging, verify:

- [ ] Emulators are running (`firebase emulators:start`)
- [ ] Functions emulator shows in terminal output (port 5001)
- [ ] React app is connected to emulators (check browser console)
- [ ] User is authenticated before calling function
- [ ] Function name matches in both frontend and backend
- [ ] `firebase.json` has functions configuration
- [ ] `functions/package.json` has all dependencies
- [ ] No syntax errors in `functions/index.js`

---

## 📚 Useful Commands

```bash
# Start emulators
firebase emulators:start

# Start with inspect for debugging
firebase emulators:start --inspect-functions

# View function logs only
firebase emulators:start --only functions

# Export emulator data
firebase emulators:export ./emulator-data

# Import emulator data
firebase emulators:start --import=./emulator-data

# Clear emulator data
# Just restart emulators (data is not persisted by default)

# Deploy functions to production
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:createBook
```

---

## 🎯 Pro Tips

1. **Use Emulator UI**: Most powerful debugging tool - `http://localhost:4000`
2. **Console.log Everything**: When in doubt, log it out
3. **Test Incrementally**: Add one feature at a time
4. **Check Network Tab**: Browser DevTools → Network → see function calls
5. **Use Try-Catch**: Always wrap async code in try-catch
6. **Validate Input**: Check data before processing
7. **Return Meaningful Errors**: Help your frontend handle errors gracefully

---

## 📞 Need Help?

- Firebase Docs: https://firebase.google.com/docs/functions
- Emulator Suite: https://firebase.google.com/docs/emulator-suite
- Stack Overflow: Tag with `firebase-cloud-functions`

---

Happy Debugging! 🎉

