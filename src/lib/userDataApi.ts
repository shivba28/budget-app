import axios from 'axios'
import { getSyncApiBase } from '@/lib/syncApi'

export const userDataApi = axios.create({
  baseURL: `${getSyncApiBase()}/api/user`,
  timeout: 60_000,
  withCredentials: true,
})

// Auth is via httpOnly cookie session (withCredentials).
