# 🐛 Firebase Functions Breakpoint Debugging Guide

This guide shows you how to debug Firebase Functions with breakpoints, step through code, inspect variables, and use VSCode debugger just like regular code.

---

## 🚀 Quick Start

### Step 1: Start Emulators with Inspect Flag

```bash
firebase emulators:start --inspect-functions
```

**What this does:**
- Starts Firebase emulators
- Enables Node.js debugging on port `9229`
- Functions run in debug mode

**You'll see output like:**
```
Debugger listening on ws://127.0.0.1:9229/...
```

### Step 2: Attach VSCode Debugger

1. Open VSCode
2. Click on the **Run and Debug** icon in the sidebar (or press `Ctrl+Shift+D`)
3. Select **"Attach to Functions Emulator"** from the dropdown
4. Click the green **▶ Play** button

**You should see:**
- Orange bar at the bottom (Debug mode active)
- Debug toolbar appears at the top

### Step 3: Set Breakpoints

1. Open `functions/index.js`
2. Click in the **gutter** (left of line numbers) where you want to pause
3. A **red dot** appears = breakpoint set

### Step 4: Trigger Your Function

From your React app, call the function (e.g., create a book).

**The debugger will:**
- ✅ Pause execution at your breakpoint
- ✅ Show all variables and their values
- ✅ Allow you to step through code line by line

---

## 🎯 Complete Setup

### 1. VSCode Launch Configuration

The file `.vscode/launch.json` has been created with this configuration:

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
      "outFiles": [
        "${workspaceFolder}/functions/**/*.js"
      ],
      "skipFiles": [
        "<node_internals>/**"
      ],
      "console": "integratedTerminal"
    }
  ]
}
```

**Key settings:**
- `port: 9229` - Node.js debug port
- `restart: true` - Auto-reconnect when functions reload
- `skipFiles` - Skip Node.js internals (focus on your code)

---

## 🎮 Debugging Controls

Once paused at a breakpoint, you have these controls in the debug toolbar:

| Button | Shortcut | Action |
|--------|----------|--------|
| **Continue** ▶️ | `F5` | Resume until next breakpoint |
| **Step Over** ⤵️ | `F10` | Execute current line, don't go into functions |
| **Step Into** ⬇️ | `F11` | Go into function calls |
| **Step Out** ⬆️ | `Shift+F11` | Exit current function |
| **Restart** 🔄 | `Ctrl+Shift+F5` | Restart debugging session |
| **Stop** ⏹️ | `Shift+F5` | Stop debugging |

---

## 📍 Setting Breakpoints

### Regular Breakpoint
Click in the gutter (left of line number):

```javascript
exports.createBook = onCall(async (request) => {
  // 🔴 Click here to set breakpoint
  const {title, creationType} = request.data;
  
  // Execution will pause here, you can inspect request.data
  console.log(title); // 🔴 Or here
  
  const result = await createBookInDatabase();
  // 🔴 Or here to check result
  
  return result;
});
```

### Conditional Breakpoint
Right-click in the gutter → **Add Conditional Breakpoint**:

```javascript
// Only pause when title is "Test"
title === "Test"

// Only pause when user is specific ID
request.auth.uid === "abc123"

// Only pause on errors
error !== null
```

### Logpoint (Non-breaking)
Right-click in gutter → **Add Logpoint**:

```javascript
// Logs to Debug Console without pausing
{title} - {creationType}
```

---

## 🔍 Inspection Features

When paused at a breakpoint, you can inspect:

### 1. Variables Panel (Left Sidebar)

**Local Variables:**
```javascript
request: {
  auth: { uid: "abc123", token: {...} },
  data: { title: "Baby's First Book", creationType: "auto-generate" }
}
title: "Baby's First Book"
creationType: "auto-generate"
```

**Hover over any variable** in the code to see its value!

### 2. Watch Expressions

Add expressions to watch in the **WATCH** panel:

```javascript
request.auth.uid
title.length
request.data
JSON.stringify(bookData)
```

### 3. Call Stack

See the entire call stack to understand how you got to this point:

```
createBook (index.js:17)
onCall (node_modules/firebase-functions/...)
...
```

### 4. Debug Console

Execute code in the current context:

```javascript
// Type in Debug Console:
> title
"Baby's First Book"

> title.toUpperCase()
"BABY'S FIRST BOOK"

> Object.keys(request.data)
["title", "creationType"]
```

---

## 💡 Practical Debugging Examples

### Example 1: Debug Book Creation

```javascript
exports.createBook = onCall(async (request) => {
  // 🔴 Breakpoint 1: Check authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }

  const {title, creationType} = request.data;
  
  // 🔴 Breakpoint 2: Inspect input data
  // When paused here:
  // - Check: request.data
  // - Verify: title is not empty
  // - Verify: creationType is valid
  
  const bookData = {
    title: title.trim(),
    creationType,
    ownerId: request.auth.uid,
    // ...
  };
  
  // 🔴 Breakpoint 3: Before database write
  // Inspect bookData before saving
  const bookRef = await db.collection('books').add(bookData);
  
  // 🔴 Breakpoint 4: After successful creation
  // Check: bookRef.id exists
  console.log(`Book created with ID: ${bookRef.id}`);
  
  return {
    success: true,
    bookId: bookRef.id,
  };
});
```

### Example 2: Debug Error Handling

```javascript
try {
  const bookRef = await db.collection('books').add(bookData);
  // ✅ Success path
} catch (error) {
  // 🔴 Breakpoint here to inspect errors
  // When paused:
  // - Check: error.message
  // - Check: error.code
  // - Check: error.stack
  
  console.error('Error creating book:', error);
  throw new HttpsError('internal', 'Failed to create book');
}
```

### Example 3: Debug Conditional Logic

```javascript
// 🔴 Conditional breakpoint: creationType === 'auto-generate'
if (creationType === 'auto-generate') {
  // This will only pause when auto-generating
  const chapters = generateDefaultChapters();
  
  // 🔴 Breakpoint: Check generated chapters
  console.log('Generated chapters:', chapters.length);
}
```

---

## 🎬 Step-by-Step Walkthrough

### Scenario: Debug the `createBook` function

#### 1. Start Debug Mode
```bash
# Terminal 1: Start emulators with debug
firebase emulators:start --inspect-functions
```

#### 2. Attach Debugger
- VSCode: Run & Debug → "Attach to Functions Emulator" → Play ▶️
- You'll see orange bar at bottom

#### 3. Set Breakpoints
Open `functions/index.js`:
```javascript
exports.createBook = onCall(async (request) => {
  const {title, creationType} = request.data; // 🔴 Set breakpoint here
  // ...
});
```

#### 4. Trigger Function
- Go to your React app (`http://localhost:5173`)
- Try to create a book
- Submit the form

#### 5. Debug Session Starts
**VSCode will:**
- Pause execution at your breakpoint
- Highlight the current line in yellow
- Show all variables in the left panel

#### 6. Inspect Variables
**Variables Panel shows:**
```
▼ Local
  ▼ request
    ▼ auth
      uid: "user123"
      token: {...}
    ▼ data
      title: "My Baby Book"
      creationType: "auto-generate"
  title: "My Baby Book"
  creationType: "auto-generate"
```

#### 7. Step Through Code
- Press `F10` (Step Over) to go line by line
- Hover over variables to see their values
- Watch the CALL STACK to see execution flow

#### 8. Continue or Stop
- Press `F5` to continue to next breakpoint
- Or click ⏹️ to stop debugging

---

## 🔧 Advanced Debugging Techniques

### 1. Debug Firestore Queries

```javascript
exports.getBooks = onCall(async (request) => {
  const userId = request.auth.uid;
  
  // 🔴 Breakpoint before query
  const booksSnapshot = await db
    .collection('books')
    .where('collaborators', 'array-contains', userId)
    .get();
  
  // 🔴 Breakpoint after query
  // Check: booksSnapshot.size
  // Check: booksSnapshot.empty
  
  const books = [];
  booksSnapshot.forEach(doc => {
    // 🔴 Breakpoint inside loop
    // Check: doc.id
    // Check: doc.data()
    books.push({
      id: doc.id,
      ...doc.data()
    });
  });
  
  return books;
});
```

### 2. Debug Async Operations

```javascript
exports.processBook = onCall(async (request) => {
  // 🔴 Breakpoint
  const step1 = await doFirstThing();
  // Check step1 result
  
  // 🔴 Breakpoint
  const step2 = await doSecondThing(step1);
  // Check step2 result
  
  // 🔴 Breakpoint
  const step3 = await doThirdThing(step2);
  // Check final result
  
  return step3;
});
```

### 3. Debug with Watch Expressions

Add these to WATCH panel:
```javascript
request.auth?.uid
title?.length
typeof creationType
bookData.chapters?.length
error?.message
```

---

## 🎨 VSCode Debug UI Overview

```
┌──────────────────────────────────────────────────────────┐
│  Debug Toolbar (Top)                                     │
│  ▶️ Continue | ⤵️ Step Over | ⬇️ Step Into | ⬆️ Step Out │
└──────────────────────────────────────────────────────────┘

┌─────────────────┬────────────────────────────────────────┐
│ VARIABLES       │  Code Editor                           │
│ ▼ Local         │  exports.createBook = onCall(async ... │
│   request       │  → const {title} = request.data; ← YOU │
│   title         │    const bookData = {                  │
│   creationType  │      title: title.trim(),              │
│                 │    };                                   │
│ WATCH           │                                         │
│ + Add           │                                         │
│                 │                                         │
│ CALL STACK      │                                         │
│ createBook      │                                         │
│ onCall          │                                         │
│                 │                                         │
│ BREAKPOINTS     │                                         │
│ ☑ index.js:18   │                                         │
│ ☑ index.js:35   │                                         │
└─────────────────┴────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│ DEBUG CONSOLE                                            │
│ > request.data                                           │
│ { title: "My Book", creationType: "auto-generate" }     │
└──────────────────────────────────────────────────────────┘
```

---

## 🚨 Troubleshooting

### Debugger Not Attaching

**Problem:** "Cannot connect to runtime process"

**Solutions:**
1. ✅ Ensure emulators started with `--inspect-functions`
2. ✅ Check port 9229 is not in use: `netstat -ano | findstr :9229`
3. ✅ Restart VSCode
4. ✅ Try disconnecting and reconnecting debugger

### Breakpoints Not Hitting

**Problem:** Breakpoints show as gray/hollow circles

**Solutions:**
1. ✅ Ensure code is saved
2. ✅ Restart emulators after code changes
3. ✅ Check function is actually being called
4. ✅ Verify breakpoint is in executed code path

### Debugger Disconnects

**Problem:** Debugger detaches randomly

**Solutions:**
1. ✅ Check `restart: true` in launch.json (already set)
2. ✅ Don't stop emulators while debugging
3. ✅ Increase timeout if function takes long

### Can't See Variables

**Problem:** Variables show as "undefined" or "not available"

**Solutions:**
1. ✅ Ensure you're paused at a breakpoint
2. ✅ Check variable is in scope
3. ✅ Try typing variable name in Debug Console

---

## 📋 Quick Reference

### Start Debugging
```bash
# Terminal 1: Start emulators with debug
firebase emulators:start --inspect-functions

# VSCode: Attach debugger
# Run & Debug (Ctrl+Shift+D) → Attach to Functions Emulator → Play
```

### Keyboard Shortcuts
| Action | Shortcut |
|--------|----------|
| Continue | `F5` |
| Step Over | `F10` |
| Step Into | `F11` |
| Step Out | `Shift+F11` |
| Toggle Breakpoint | `F9` |
| Start/Stop Debug | `Ctrl+Shift+D` |

### Where to Set Breakpoints
```javascript
✅ Inside function handlers
✅ Before/after async operations
✅ In error handlers (catch blocks)
✅ Before return statements
✅ Inside loops to check iterations
```

---

## 🎓 Best Practices

1. **Start Broad, Narrow Down**
   - Set breakpoint at function entry
   - Step through to find the issue
   - Set more specific breakpoints

2. **Use Conditional Breakpoints**
   - Only pause when specific conditions are met
   - Saves time when debugging loops

3. **Inspect Everything**
   - Hover over variables
   - Check CALL STACK to understand flow
   - Use WATCH for complex expressions

4. **Console vs Breakpoints**
   - Use `console.log` for quick checks
   - Use breakpoints for deep investigation
   - Combine both for best results

5. **Clean Up**
   - Remove breakpoints when done
   - Don't commit temporary debug code
   - Document complex debugging scenarios

---

## 🎉 Summary

You now have full debugging capabilities:

✅ **Breakpoints** - Pause execution at any line
✅ **Step Through** - Execute line by line
✅ **Inspect Variables** - See all values in real-time
✅ **Watch Expressions** - Monitor specific values
✅ **Call Stack** - Understand execution flow
✅ **Debug Console** - Execute code in context
✅ **Conditional Breakpoints** - Smart pausing

**Start Debugging:**
```bash
firebase emulators:start --inspect-functions
```

Then attach VSCode debugger and set breakpoints! 🚀

---

## 📖 More Resources

- VSCode Debugging: https://code.visualstudio.com/docs/editor/debugging
- Node.js Debugging: https://nodejs.org/en/docs/guides/debugging-getting-started
- Firebase Functions Debugging: https://firebase.google.com/docs/functions/local-emulator

