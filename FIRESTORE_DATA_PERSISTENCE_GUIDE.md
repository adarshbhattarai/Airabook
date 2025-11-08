# 💾 Firestore Data Persistence Guide

This guide explains how to handle Firestore data persistence in local emulators.

---

## 🔄 Default Behavior

**Every restart = Empty database:**
- ✅ Clean slate for testing
- ❌ Need to recreate test data each time
- ❌ Lose all your test books, users, etc.

---

## 💡 Solutions for Persistent Data

### Option 1: Export/Import Data (Recommended)

#### Manual Export/Import:
```bash
# 1. Start emulators and create your test data
npm run emulators:debug

# 2. Create books, users, etc. in your app
# 3. Export data before stopping
npm run emulators:export

# 4. Start with imported data next time
npm run emulators:import
```

#### Automated Workflow:
```bash
# Export current data
firebase emulators:export ./emulator-data

# Start with saved data
firebase emulators:start --import=./emulator-data
```

---

### Option 2: Seed Data Script

#### Create Test Data Automatically:
```bash
# After starting emulators, run:
npm run seed:data
```

**What it creates:**
- ✅ 2 test users
- ✅ 2 test books (one auto-generated, one blank)
- ✅ 1 test media item
- ✅ Proper relationships between data

#### Customize Seed Data:
Edit `functions/seedData.js` to add your own test data:

```javascript
// Add more test users
const testUsers = [
  {
    id: "your-test-user",
    data: {
      displayName: "Your Name",
      email: "your@email.com",
      accessibleBookIds: ["your-book-id"]
    }
  }
];

// Add more test books
const testBooks = [
  {
    id: "your-book",
    data: {
      title: "Your Baby Book",
      creationType: "auto-generate",
      ownerId: "your-test-user",
      // ... more fields
    }
  }
];
```

---

### Option 3: Auto-Seed on Startup

#### Start with Pre-populated Data:
```bash
npm run emulators:with-data
```

**What happens:**
1. ✅ Starts emulators
2. ✅ Waits for emulators to be ready
3. ✅ Automatically seeds test data
4. ✅ Ready to use with test data

---

### Option 4: Persistent Storage (Advanced)

#### Configure Persistent Storage:
Create `firebase.json` with persistent storage:

```json
{
  "emulators": {
    "firestore": {
      "port": 8080,
      "host": "localhost"
    },
    "ui": {
      "enabled": true,
      "port": 4000
    }
  }
}
```

**Note:** This is experimental and may not work reliably.

---

## 🎯 Recommended Workflow

### For Daily Development:

#### 1. **First Time Setup:**
```bash
# Start emulators
npm run emulators:debug

# Seed with test data
npm run seed:data

# Create your test data in the app
# Export when you have good test data
npm run emulators:export
```

#### 2. **Daily Development:**
```bash
# Start with your saved data
npm run emulators:import

# Or start fresh with seeded data
npm run emulators:with-data
```

#### 3. **When You Need Fresh Data:**
```bash
# Start clean
npm run emulators:debug

# Add new test data
npm run seed:data
```

---

## 📊 Data Management Commands

| Command | Purpose |
|---------|---------|
| `npm run emulators:export` | Save current emulator data |
| `npm run emulators:import` | Start with saved data |
| `npm run emulators:with-data` | Start with auto-seeded data |
| `npm run seed:data` | Add test data to running emulators |

---

## 🔧 Customizing Test Data

### Edit `functions/seedData.js`:

```javascript
// Add your own test users
const testUsers = [
  {
    id: "your-user-id",
    data: {
      displayName: "Your Name",
      email: "your@email.com",
      accessibleBookIds: ["book-1", "book-2"]
    }
  }
];

// Add your own test books
const testBooks = [
  {
    id: "your-book-id",
    data: {
      title: "Your Baby's Book",
      creationType: "auto-generate",
      ownerId: "your-user-id",
      collaborators: ["your-user-id"],
      chapters: [
        {id: 'welcome', title: 'Welcome', order: 1, notes: []},
        {id: 'milestones', title: 'Milestones', order: 2, notes: []}
      ],
      coverImageUrl: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }
  }
];
```

---

## 🎮 Testing Scenarios

### Scenario 1: Fresh Development
```bash
# Start clean
npm run emulators:debug

# Add test data
npm run seed:data

# Test your app with known data
```

### Scenario 2: Continue Previous Session
```bash
# Start with saved data
npm run emulators:import

# Continue where you left off
```

### Scenario 3: Test Edge Cases
```bash
# Start clean
npm run emulators:debug

# Create specific test scenarios
# Export when you have good test cases
npm run emulators:export
```

---

## 🚨 Common Issues

### Issue 1: "No data after restart"
**Problem:** Emulator data disappears

**Solutions:**
- ✅ Use `npm run emulators:export` before stopping
- ✅ Use `npm run emulators:import` to restore
- ✅ Use `npm run seed:data` for fresh test data

### Issue 2: "Seed data not working"
**Problem:** `npm run seed:data` fails

**Solutions:**
- ✅ Ensure emulators are running first
- ✅ Check Firebase Admin is initialized
- ✅ Verify service account key exists

### Issue 3: "Import/Export not working"
**Problem:** Data not saving/loading

**Solutions:**
- ✅ Check `./emulator-data` folder exists
- ✅ Ensure emulators are stopped before export
- ✅ Verify import path is correct

---

## 📁 File Structure

```
your-project/
├── emulator-data/           # Exported emulator data
│   ├── firestore_export/
│   └── ...
├── functions/
│   ├── seedData.js         # Test data seeding script
│   └── ...
├── scripts/
│   └── start-with-data.js  # Auto-seed startup script
└── package.json            # Updated with data commands
```

---

## 🎯 Best Practices

### 1. **Use Export/Import for Development:**
- Export data when you have good test scenarios
- Import data to continue development
- Keep multiple export files for different scenarios

### 2. **Use Seed Data for Testing:**
- Consistent test data every time
- Easy to customize for different test cases
- Good for CI/CD testing

### 3. **Combine Both Approaches:**
- Start with seed data
- Develop and test
- Export when you have good data
- Use import for daily development

### 4. **Version Control:**
- Don't commit `emulator-data/` folder
- Do commit `functions/seedData.js`
- Document your test data scenarios

---

## 🎉 Summary

**You now have multiple options for persistent Firestore data:**

### ✅ **Quick Start:**
```bash
# Start with test data
npm run emulators:with-data
```

### ✅ **Save Your Work:**
```bash
# Export current data
npm run emulators:export
```

### ✅ **Continue Development:**
```bash
# Start with saved data
npm run emulators:import
```

### ✅ **Fresh Test Data:**
```bash
# Add test data to running emulators
npm run seed:data
```

**No more losing your test data on every restart!** 🎉

---

## 📚 Related Guides

- `MIGRATION_GUIDE.md` - Function migration details
- `FUNCTIONS_BREAKPOINT_DEBUG.md` - Debugging functions
- `ENVIRONMENT_SETUP_GUIDE.md` - Multi-environment setup

---

**Happy developing with persistent test data!** 🚀
