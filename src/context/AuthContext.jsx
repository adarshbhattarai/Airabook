import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('babyAiraUser');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, []);

  const login = (email, password) => {
    const users = JSON.parse(localStorage.getItem('babyAiraUsers') || '[]');
    const foundUser = users.find(u => u.email === email && u.password === password);
    if (foundUser) {
      const userData = { email: foundUser.email, name: foundUser.name };
      setUser(userData);
      localStorage.setItem('babyAiraUser', JSON.stringify(userData));
      return true;
    }
    return false;
  };

  const signup = (name, email, password) => {
    const users = JSON.parse(localStorage.getItem('babyAiraUsers') || '[]');
    const userExists = users.some(u => u.email === email);
    if (userExists) {
      return false; // User already exists
    }
    const newUser = { name, email, password };
    users.push(newUser);
    localStorage.setItem('babyAiraUsers', JSON.stringify(users));
    return true;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('babyAiraUser');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, signup }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};