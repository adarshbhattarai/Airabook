# 🔐 Authentication with Firebase Emulators

This guide explains how authentication works with Firebase emulators and how to handle it in your app.

---

## 🎯 How Authentication Works in Emulators

### **Key Differences from Production:**

| Feature | Production | Emulator |
|---------|------------|----------|
| **User Creation** | Real users | Fake test users |
| **Email Verification** | Sends real emails | No emails sent |
| **Password Reset** | Sends real emails | No emails sent |
| **Google Sign-In** | Real Google OAuth | Mocked OAuth |
| **User Persistence** | Permanent | Persists between restarts |
| **Email Verification** | Required | Automatically verified |

---

## 🚀 Authentication Setup

### **Your Current Setup (Already Good!):**

Your `AuthContext.jsx` already handles emulator authentication correctly:

```javascript
// ✅ This works with both emulators and production
const unsubscribe = onAuthStateChanged(auth, async (user) => {
  setUser(user);
  
  if (user) {
    // Create user document in Firestore
    const userRef = doc(firestore, 'users', user.uid);
    const docSnap = await getDoc(userRef);
    
    if (!docSnap.exists()) {
      // Create new user document
      await setDoc(userRef, {
        displayName: user.displayName,
        email: user.email,
        accessibleBookIds: [],
      });
    }
  }
});
```

---

## 🎮 Testing Authentication

### **1. Create Test Users**

#### **Email/Password Users:**
```javascript
// In your app, create test users
const testUsers = [
  { email: "test@example.com", password: "password123" },
  { email: "parent@example.com", password: "password123" },
  { email: "grandma@example.com", password: "password123" }
];
```

#### **Google Sign-In Users:**
```javascript
// Google sign-in works in emulator (mocked)
const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  // User is automatically created
};
```

### **2. View Users in Emulator UI**

**Open:** `http://localhost:4000/auth`

**You can:**
- ✅ See all authenticated users
- ✅ View user details (email, UID, etc.)
- ✅ Manually create users
- ✅ Delete users
- ✅ View authentication logs

---

## 🔧 Authentication Functions

### **Your Functions Already Handle Auth:**

```javascript
// In your functions/index.js
exports.createBook = onCall(async (request) => {
  // ✅ This works with emulator auth
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = request.auth.uid; // Gets the user ID
  // ... rest of function
});
```

### **Auth Context in Functions:**

When you call functions from your React app:

```javascript
// ✅ Auth context is automatically passed
const createBookFunction = httpsCallable(functions, 'createBook');
const result = await createBookFunction({
  title: "My Book",
  creationType: "auto-generate"
});
// request.auth.uid is automatically available in the function
```

---

## 🎯 Authentication Scenarios

### **Scenario 1: New User Registration**

```javascript
// User signs up in your app
const signup = async (name, email, password) => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(userCredential.user, { displayName: name });
  
  // ✅ User is created in emulator
  // ✅ User document is created in Firestore
  // ✅ User can immediately use the app
};
```

### **Scenario 2: Existing User Login**

```javascript
// User logs in
const login = async (email, password) => {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  
  // ✅ User is authenticated
  // ✅ User data is loaded from Firestore
  // ✅ User can access their books
};
```

### **Scenario 3: Google Sign-In**

```javascript
// Google sign-in
const signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  
  // ✅ User is authenticated
  // ✅ User document is created/updated
  // ✅ User can access the app
};
```

---

## 🧪 Testing Authentication

### **1. Test User Creation**

```javascript
// Test in your app
const testSignup = async () => {
  try {
    await signup("Test Parent", "test@example.com", "password123");
    console.log("✅ User created successfully");
  } catch (error) {
    console.error("❌ Signup failed:", error.message);
  }
};
```

### **2. Test User Login**

```javascript
// Test login
const testLogin = async () => {
  try {
    await login("test@example.com", "password123");
    console.log("✅ Login successful");
  } catch (error) {
    console.error("❌ Login failed:", error.message);
  }
};
```

### **3. Test Function Authentication**

```javascript
// Test function with auth
const testCreateBook = async () => {
  try {
    const createBookFunction = httpsCallable(functions, 'createBook');
    const result = await createBookFunction({
      title: "Test Book",
      creationType: "auto-generate"
    });
    console.log("✅ Book created:", result.data);
  } catch (error) {
    console.error("❌ Function failed:", error.message);
  }
};
```

---

## 🔍 Debugging Authentication

### **1. Check Auth State**

```javascript
// In your React component
const { user, appUser } = useAuth();

console.log("Firebase User:", user);
console.log("App User:", appUser);
```

### **2. View Users in Emulator UI**

**Open:** `http://localhost:4000/auth`

**You'll see:**
- All authenticated users
- User details (email, UID, display name)
- Authentication events
- Sign-in/sign-out logs

### **3. Check Function Auth Context**

```javascript
// In your functions
exports.createBook = onCall(async (request) => {
  console.log("Auth context:", request.auth);
  console.log("User ID:", request.auth?.uid);
  console.log("User email:", request.auth?.token?.email);
  
  // ... rest of function
});
```

---

## 🎯 Authentication Best Practices

### **1. Handle Auth State Properly**

```javascript
// ✅ Good: Check auth state before rendering
if (loading) {
  return <div>Loading...</div>;
}

if (!user) {
  return <LoginPage />;
}

return <Dashboard />;
```

### **2. Handle Auth Errors**

```javascript
// ✅ Good: Handle auth errors gracefully
const signup = async (name, email, password) => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    // Success
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      toast({ title: "Email already in use" });
    } else if (error.code === 'auth/weak-password') {
      toast({ title: "Password too weak" });
    } else {
      toast({ title: "Signup failed", description: error.message });
    }
  }
};
```

### **3. Protect Routes**

```javascript
// ✅ Good: Protect routes that require auth
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  
  return children;
};
```

---

## 🚨 Common Issues & Solutions

### **Issue 1: "User not authenticated" in functions**

**Problem:** Functions receive `request.auth` as `null`

**Solutions:**
- ✅ Ensure user is logged in before calling functions
- ✅ Check auth state in React app
- ✅ Verify emulator connection

### **Issue 2: "Email already in use"**

**Problem:** Trying to create user that already exists

**Solutions:**
- ✅ Check if user exists first
- ✅ Use sign-in instead of sign-up
- ✅ Clear emulator data if needed

### **Issue 3: "Invalid email"**

**Problem:** Email format validation

**Solutions:**
- ✅ Use valid email format
- ✅ Check email validation in your app
- ✅ Handle validation errors gracefully

---

## 🎮 Authentication Testing Commands

### **Create Test Users:**

```bash
# Start emulators
npm run emulators:debug

# Open emulator UI
# Go to http://localhost:4000/auth
# Click "Add user" to create test users
```

### **Test Authentication Flow:**

```javascript
// Test complete auth flow
const testAuthFlow = async () => {
  // 1. Sign up
  await signup("Test User", "test@example.com", "password123");
  
  // 2. Sign out
  await logout();
  
  // 3. Sign in
  await login("test@example.com", "password123");
  
  // 4. Create book (should work with auth)
  const createBookFunction = httpsCallable(functions, 'createBook');
  await createBookFunction({ title: "Test Book", creationType: "blank" });
};
```

---

## 📊 Authentication Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User Signs Up/In                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Firebase Auth (Emulator)                      │
│  - Creates user record                                     │
│  - Generates UID                                           │
│  - Returns user object                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              AuthContext (React)                           │
│  - Listens to auth state changes                          │
│  - Creates user document in Firestore                     │
│  - Sets app user state                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Function Calls                                │
│  - Auth context automatically passed                       │
│  - request.auth.uid available                              │
│  - User can create books, upload media, etc.               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎉 Summary

**Your authentication setup is already perfect for emulators!**

### ✅ **What Works:**
- User registration and login
- Google sign-in (mocked)
- Auth state management
- Function authentication
- User document creation

### ✅ **What You Can Do:**
- Create test users in emulator UI
- Test authentication flows
- Debug auth issues
- View authentication logs

### ✅ **Next Steps:**
1. **Test your auth flow** in the app
2. **Create test users** in emulator UI
3. **Test function calls** with authentication
4. **Debug any auth issues** using the emulator UI

**Authentication works seamlessly with your emulator setup!** 🔐✨

---

## 📚 Related Guides

- `MIGRATION_GUIDE.md` - Function migration details
- `FIRESTORE_DATA_PERSISTENCE_GUIDE.md` - Data persistence
- `FUNCTIONS_BREAKPOINT_DEBUG.md` - Debugging functions

---

**Happy authenticating with Firebase emulators!** 🚀
