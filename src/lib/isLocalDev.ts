/** Single flag for Vite localStorage-backed “server” (offline dev). */
export const IS_LOCAL_STORAGE_MODE =
  import.meta.env.VITE_USE_LOCAL_STORAGE === 'true'
