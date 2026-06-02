import { configureStore, createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import * as SecureStore from 'expo-secure-store'
import { authAPI } from '../services/api'

interface AuthState {
  user: any | null
  accessToken: string | null
  isAuthenticated: boolean
  loading: boolean
  error: string | null
}

const initialState: AuthState = {
  user: null, accessToken: null, isAuthenticated: false, loading: false, error: null,
}

export const loginUser = createAsyncThunk('auth/login', async ({ phone, password }: { phone: string; password: string }, { rejectWithValue }) => {
  try {
    const res = await authAPI.login(phone, password)
    const { user, accessToken, refreshToken } = res.data.data
    await SecureStore.setItemAsync('accessToken', accessToken)
    await SecureStore.setItemAsync('refreshToken', refreshToken)
    return { user, accessToken }
  } catch (err: any) {
    return rejectWithValue(err.response?.data?.message || 'Login failed')
  }
})

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<{ user: any; accessToken: string }>) => {
      state.user = action.payload.user
      state.accessToken = action.payload.accessToken
      state.isAuthenticated = true
    },
    clearAuth: (state) => {
      state.user = null
      state.accessToken = null
      state.isAuthenticated = false
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => { state.loading = true; state.error = null })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload.user
        state.accessToken = action.payload.accessToken
        state.isAuthenticated = true
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })
  },
})

export const { setUser, clearAuth } = authSlice.actions

export const store = configureStore({ reducer: { auth: authSlice.reducer } })
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
