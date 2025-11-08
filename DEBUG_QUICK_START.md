# 🚀 Debug Functions - Quick Start

## 3-Step Setup

### 1️⃣ Start Emulators with Debug Mode
```bash
npm run emulators:debug
```

**Look for this line in output:**
```
Debugger listening on ws://127.0.0.1:9229/...
```

### 2️⃣ Attach VSCode Debugger
1. Press `Ctrl+Shift+D` (or click Run & Debug icon)
2. Select **"Attach to Functions Emulator"** from dropdown
3. Click green **▶️ Play** button

**You should see:**
- Orange bar at bottom = Debug active ✅
- Debug toolbar at top

### 3️⃣ Set Breakpoints
1. Open `functions/index.js`
2. Click left of line number (red dot appears)
3. Call your function from the app
4. **Execution pauses** at your breakpoint! 🎯

---

## Debug Controls

| Button | Key | Action |
|--------|-----|--------|
| ▶️ Continue | `F5` | Resume |
| ⤵️ Step Over | `F10` | Next line |
| ⬇️ Step Into | `F11` | Enter function |
| ⬆️ Step Out | `Shift+F11` | Exit function |
| 🔴 Breakpoint | `F9` | Toggle breakpoint |

---

## Example Debug Session

### Set Breakpoint Here:
```javascript
exports.createBook = onCall(async (request) => {
  const {title, creationType} = request.data; // 🔴 Click here
  
  // When paused, inspect:
  // - request.auth.uid
  // - request.data
  // - All variables in left panel
  
  const bookData = {
    title: title.trim(), // 🔴 Or here
    creationType,
    ownerId: request.auth.uid,
  };
  
  const bookRef = await db.collection('books').add(bookData);
  // 🔴 Or here to see result
  
  return { bookId: bookRef.id };
});
```

### What You Can Do:
- ✅ Hover over variables to see values
- ✅ Type in Debug Console: `request.data`
- ✅ Check Variables panel on left
- ✅ Step through line by line with `F10`

---

## Visual Guide

```
┌─────────────────────────────────────────────────────────┐
│ 1. Run Emulators                                        │
│    npm run emulators:debug                              │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 2. VSCode: Attach Debugger                              │
│    [Ctrl+Shift+D] → Attach to Functions Emulator → ▶️   │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Set Breakpoints                                      │
│    Click in gutter → Red dot appears                    │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 4. Call Function from App                               │
│    Create a book, etc.                                  │
└─────────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────────┐
│ 5. Debugger Pauses! 🎉                                  │
│    - Line highlighted in yellow                         │
│    - Variables shown on left                            │
│    - Step through with F10                              │
└─────────────────────────────────────────────────────────┘
```

---

## Common Tasks

### Check Function Input
```javascript
// Set breakpoint here:
const {title, creationType} = request.data;

// When paused, type in Debug Console:
> request.data
{ title: "My Book", creationType: "auto-generate" }
```

### Debug Errors
```javascript
try {
  const result = await doSomething();
} catch (error) {
  // 🔴 Set breakpoint here
  console.error(error); // Inspect error details
}
```

### Conditional Breakpoint
Right-click in gutter → **Add Conditional Breakpoint**:
```javascript
// Only pause when title is "Test"
title === "Test"
```

---

## Troubleshooting

### Debugger Not Connecting?
1. ✅ Check emulators started with `--inspect-functions`
2. ✅ Look for "Debugger listening on..." message
3. ✅ Restart VSCode if needed

### Breakpoints Not Working?
1. ✅ Save file (`Ctrl+S`)
2. ✅ Restart emulators
3. ✅ Check function is actually being called

---

## Full Guide

See `FUNCTIONS_BREAKPOINT_DEBUG.md` for complete details.

---

**Happy Debugging!** 🐛✨

