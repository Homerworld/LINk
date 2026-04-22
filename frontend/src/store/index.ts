import { configureStore, createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import * as SecureStore from 'expo-secure-store';
import { authAPI } from '../services/api';

// ── Auth Slice ────────────────────────────────────────────────────
interface AuthState {
  user: any | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

const initialAuthState: AuthState = {
  user: null, accessToken: null,
  isLoading: false, isAuthenticated: false, error: null,
};

export const loginUser = createAsyncThunk('auth/login', async ({ phone, password }: any, { rejectWithValue }) => {
  try {
    const res = await authAPI.login(phone, password);
    const { user, accessToken, refreshToken } = res.data.data;
    await SecureStore.setItemAsync('accessToken', accessToken);
    await SecureStore.setItemAsync('refreshToken', refreshToken);
    return { user, accessToken };
  } catch (err: any) {
    return rejectWithValue(err.response?.data?.message || 'Login failed');
  }
});

export const logoutUser = createAsyncThunk('auth/logout', async () => {
  await SecureStore.deleteItemAsync('accessToken');
  await SecureStore.deleteItemAsync('refreshToken');
});

const authSlice = createSlice({
  name: 'auth',
  initialState: initialAuthState,
  reducers: {
    setUser: (state, action: PayloadAction<any>) => {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.isAuthenticated = true;
    },
    clearAuth: (state) => {
      state.user = null; state.accessToken = null;
      state.isAuthenticated = false; state.error = null;
    },
    clearError: (state) => { state.error = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false; state.isAuthenticated = true;
        state.user = action.payload.user; state.accessToken = action.payload.accessToken;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false; state.error = action.payload as string;
      })
      .addCase(logoutUser.fulfilled, (state) => {
        state.user = null; state.accessToken = null; state.isAuthenticated = false;
      });
  },
});

// ── Notification Slice ────────────────────────────────────────────
const notifSlice = createSlice({
  name: 'notifications',
  initialState: { unread: 0, items: [] as any[] },
  reducers: {
    setUnread: (state, action) => { state.unread = action.payload; },
    setNotifications: (state, action) => { state.items = action.payload; },
    decrementUnread: (state) => { state.unread = Math.max(0, state.unread - 1); },
  },
});

// ── Store ─────────────────────────────────────────────────────────
export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
    notifications: notifSlice.reducer,
  },
});

export const { setUser, clearAuth, clearError } = authSlice.actions;
export const { setUnread, setNotifications, decrementUnread } = notifSlice.actions;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
