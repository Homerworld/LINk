import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { authAPI } from '../services/api';

type User = {
  id: string;
  role: 'customer' | 'vendor' | 'admin';
  fullName: string;
  phone: string;
  email?: string | null;
  kycStatus?: string | null;
};

type AuthCtx = {
  user: User | null;
  booting: boolean;
  signIn: (user: User, accessToken: string, refreshToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as AuthCtx);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('accessToken');
        if (token) {
          const me = await authAPI.me();
          setUser(me);
        }
      } catch {
        await SecureStore.deleteItemAsync('accessToken');
        await SecureStore.deleteItemAsync('refreshToken');
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const signIn = async (u: User, accessToken: string, refreshToken: string) => {
    await SecureStore.setItemAsync('accessToken', accessToken);
    if (refreshToken) await SecureStore.setItemAsync('refreshToken', refreshToken);
    setUser(u);
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    setUser(null);
  };

  const refreshUser = async () => {
    try {
      const me = await authAPI.me();
      setUser(me);
    } catch {}
  };

  return (
    <Ctx.Provider value={{ user, booting, signIn, signOut, refreshUser }}>
      {children}
    </Ctx.Provider>
  );
}
