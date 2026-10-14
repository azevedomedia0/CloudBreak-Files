/** The desktop the app is running on, read from the webview's user agent (Tauri uses the system webview). */
export const isLinuxLike =
  typeof navigator !== 'undefined' && /Linux/i.test(navigator.userAgent) && !/Android/i.test(navigator.userAgent);
