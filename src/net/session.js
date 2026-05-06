const TOKEN_KEY = 'tank-online-token-v1'
const USER_KEY = 'tank-online-user-v1'

export function loadSession() {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const userRaw = localStorage.getItem(USER_KEY)
    const user = userRaw ? JSON.parse(userRaw) : null
    if (!token || !user) return { token: '', user: null }
    return { token, user }
  } catch {
    return { token: '', user: null }
  }
}

export function saveSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}
