// Session. In http mode the backend's httpOnly cookie is the real session; here we only hold the signed-in user for the screens.
// In the offline mock the user is kept in localStorage so a refresh does not sign you out.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { DEMO_USERS, MODE, api } from '../lib/api'

const read = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* storage unavailable */ } }

export type TextSize = 'small' | 'normal' | 'large'
// Root font size: every text size is in rem, so this scales the whole interface (and keeps chart tooltips aligned, unlike CSS zoom).
const ROOT_SIZE: Record<TextSize, string> = { small: '92%', normal: '100%', large: '115%' }

export type AppUser = (typeof DEMO_USERS)[number]
interface Ctx {
  user: AppUser | null
  signIn: (u: AppUser) => void
  signOut: () => void
  textSize: TextSize
  setTextSize: (t: TextSize) => void
}
const UserCtx = createContext<Ctx | null>(null)

/** The user the server already knows (from its cookie), loaded once before the app renders. */
let bootUser: AppUser | null = null
export const setBootUser = (u: AppUser | null) => { bootUser = u }

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => {
    if (MODE === 'http') return bootUser
    // Offline demo convenience: ?as=u3 opens the app as that demo user (handy for demos and screenshots).
    const as = new URLSearchParams(window.location.search).get('as')
    if (as && DEMO_USERS.some((u) => u.id === as)) { write('ekatra.user', as); return DEMO_USERS.find((u) => u.id === as)! }
    return DEMO_USERS.find((u) => u.id === read('ekatra.user')) ?? null
  })
  const [textSize, setSize] = useState<TextSize>(() => (read('ekatra.text') as TextSize) || 'normal')
  // Whole-interface text size, like the A- A A+ control on government sites.
  useEffect(() => { document.documentElement.style.fontSize = ROOT_SIZE[textSize] }, [textSize])

  const value: Ctx = {
    user,
    signIn: (u) => { setUser(u); if (MODE === 'mock') write('ekatra.user', u.id) },
    signOut: () => { setUser(null); write('ekatra.user', null); void api.signOut() },
    textSize,
    setTextSize: (t) => { setSize(t); write('ekatra.text', t) },
  }
  return <UserCtx.Provider value={value}>{children}</UserCtx.Provider>
}

export function useSession() {
  const c = useContext(UserCtx)
  if (!c) throw new Error('useSession must be used inside UserProvider')
  return c
}

/** For pages behind the sign-in guard: the user is always present. */
export function useUser() {
  const { user } = useSession()
  if (!user) throw new Error('Not signed in')
  return { user }
}
