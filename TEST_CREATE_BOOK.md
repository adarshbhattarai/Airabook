# 🧪 Test CreateBook Function

This guide shows you how to test your `createBook` function with the emulator.

---

## ✅ **Setup Complete!**

Your `createBook` function is now properly configured:

### **✅ Function Location:**
- **File:** `functions/createBook.js`
- **Export:** `exports.createBook`
- **Type:** `functions.https.onCall`

### **✅ Parameters Received:**
- **`title`** - Baby's name (string, 2-50 characters)
- **`creationType`** - "auto-generate" or "blank"

### **✅ Authentication:**
- User must be logged in
- User ID automatically available as `context.auth.uid`

---

## 🚀 **How to Test:**

### **1. Start Emulators:**
```bash
npm run emulators:debug
```

### **2. Start Your React App:**
```bash
npm run dev
```

### **3. Login:**
- Use: `test@example.com` / `password123`

### **4. Create a Book:**
- Go to Create Book page
- Enter baby's name (e.g., "Emma")
- Choose "Auto-generate" or "Start Blank"
- Click "Create Book"

---

## 🔍 **What Happens:**

### **✅ Function Execution:**
1. **Authentication Check** - Verifies user is logged in
2. **Parameter Validation** - Checks title and creationType
3. **User Limit Check** - Ensures user hasn't exceeded 10 books
4. **Book Creation** - Creates book in Firestore
5. **User Update** - Adds book to user's accessible books
6. **Response** - Returns book ID and details

### **✅ Auto-Generate Books:**
- Creates 6 default chapters
- Description: "A beautiful baby book for [name]..."
- Tags: ['auto-generated', 'starter']

### **✅ Blank Books:**
- Creates empty chapters array
- Description: "A blank baby book for [name]..."
- Tags: ['blank', 'custom']

---

## 📊 **Function Response:**

### **Success Response:**
```javascript
{
  success: true,
  bookId: "abc123",
  title: "Emma",
  creationType: "auto-generate",
  description: "A beautiful baby book for Emma...",
  chaptersCount: 6,
  message: "Book 'Emma' created successfully!"
}
```

### **Error Responses:**
```javascript
// Invalid title
{
  code: "invalid-argument",
  message: "Book title must be at least 2 characters long."
}

// Too many books
{
  code: "resource-exhausted",
  message: "You have reached the maximum number of books (10)."
}

// Not authenticated
{
  code: "unauthenticated",
  message: "User must be authenticated to create a book."
}
```

---

## 🔧 **Debugging:**

### **1. Check Function Logs:**
- View emulator UI: `http://localhost:4000/functions`
- See function execution logs
- Check for any errors

### **2. Check Firestore:**
- View emulator UI: `http://localhost:4000/firestore`
- See created books
- Check user documents

### **3. Check Authentication:**
- View emulator UI: `http://localhost:4000/auth`
- See logged-in user

---

## 🎯 **Testing Scenarios:**

### **Scenario 1: Valid Auto-Generate Book**
```javascript
// Input
{
  title: "Emma",
  creationType: "auto-generate"
}

// Expected Result
{
  success: true,
  bookId: "abc123",
  chaptersCount: 6,
  description: "A beautiful baby book for Emma..."
}
```

### **Scenario 2: Valid Blank Book**
```javascript
// Input
{
  title: "Liam",
  creationType: "blank"
}

// Expected Result
{
  success: true,
  bookId: "def456",
  chaptersCount: 0,
  description: "A blank baby book for Liam..."
}
```

### **Scenario 3: Invalid Title**
```javascript
// Input
{
  title: "A",  // Too short
  creationType: "auto-generate"
}

// Expected Error
{
  code: "invalid-argument",
  message: "Book title must be at least 2 characters long."
}
```

---

## 🎉 **You're Ready!**

**Your `createBook` function is now working!**

### **✅ What Works:**
- Parameter validation
- Authentication check
- Book creation in Firestore
- User book tracking
- Enhanced processing based on creation type

### **✅ What You Can Do:**
- Test with different parameters
- Create auto-generate books
- Create blank books
- Debug with function logs
- View created books in Firestore

**Go ahead and test your CreateBook function!** 🚀

---

## 📚 **Quick Commands:**

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start your React app |
| `npm run emulators:debug` | Start with debugging |
| `npm run create:emulator-user` | Create test user |

**Happy testing!** 🎉
