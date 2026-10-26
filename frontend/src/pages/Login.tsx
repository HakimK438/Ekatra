import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ChevronRight, ShieldCheck } from 'lucide-react'
import { api } from '../lib/api'
import { useSession } from '../hooks/useUser'
import { ROLE_LABEL } from '../lib/labels'
import { Button, ErrorBox } from '../components/ui'
import Avatar from '../components/Avatar'

export default function Login() {
  const { user, signIn } = useSession()
  const nav = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const m = useMutation({
    mutationFn: (v: { u: string; p: string }) => api.signIn(v.u, v.p),
    onSuccess: (u) => { signIn(u); nav('/') },
  })
  const demo = useQuery({ queryKey: ['demo-users'], queryFn: api.demoUsers })
  if (user) return <Navigate to="/" replace />

  const input = 'mt-1 block w-full rounded-2xl border border-line bg-surface px-4 py-2.5 text-15 focus:border-ink-500 focus:outline-none focus:ring-4 focus:ring-ink-100'
  return (
    <div className="relative min-h-screen overflow-hidden lg:h-screen">
      {/* AICTE head office, Delhi: photo by Timothy A. Gonsalves, CC BY-SA 4.0 (Wikimedia Commons) */}
      <img src="/img/aicte-hq.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-[30%_40%]" />
      <div className="absolute inset-0 bg-gradient-to-br from-ink-900/90 via-ink-700/70 to-ink-500/40" aria-hidden />

      <p className="absolute left-4 top-3 z-10 rounded-full bg-turmeric-soft px-3 py-1 text-12 font-semibold text-turmeric shadow">DEMO · prototype with synthetic data</p>
      <div className="relative mx-auto grid min-h-screen max-w-[1280px] items-center gap-8 px-6 py-8 lg:h-screen lg:min-h-0 lg:grid-cols-[1fr_1.1fr] lg:px-10 lg:py-6">
        <section className="text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-lg"><img src="/img/aicte-logo.png" alt="AICTE" className="h-11 w-11" /></span>
            <span className="font-display text-26 font-semibold">Ekatra</span>
          </div>
          <p className="mt-8 font-deva text-88 font-semibold leading-none md:text-120" lang="hi" aria-hidden>एकत्र</p>
          <h1 className="mt-5 max-w-[16ch] font-display text-34 font-semibold leading-[1.1] md:text-48">Every case about an institution, in one place.</h1>
        </section>

        <section className="rounded-[28px] bg-surface/95 p-6 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.45)] backdrop-blur md:p-7 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <h2 className="font-display text-26 font-semibold text-ink-950">Sign in</h2>
          <p className="mt-1 text-14 text-muted">For authorised AICTE officials.</p>
          <p className="mt-2 rounded-xl bg-turmeric-soft px-3 py-2 text-12 text-turmeric">This is a demo. The accounts, people, institutions and cases below are made up, so there is no real login.</p>
          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate({ u: username, p: password }) }}>
            <label className="block text-13 font-medium text-text">Username
              <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required className={input} />
            </label>
            <label className="block text-13 font-medium text-text">Password
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className={input} />
            </label>
            {m.isError && <ErrorBox error={m.error} />}
            <Button type="submit" className="w-full py-2.5" disabled={m.isPending}>{m.isPending ? 'Signing in…' : 'Sign in'}</Button>
          </form>

          <div className="mt-5 border-t border-line pt-4">
            <h3 className="text-15 font-semibold text-ink-950">Try a demo account <span className="text-13 font-normal text-muted">· demo only, no password needed</span></h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {(demo.data ?? []).map((u) => (
                <li key={u.id}>
                  <button title={u.title} onClick={() => m.mutate({ u: u.username, p: 'demo' })} className="group flex w-full items-center gap-2.5 rounded-2xl border border-line px-2.5 py-2 text-left transition hover:border-ink-500 hover:bg-ink-50">
                    <Avatar name={u.name} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-14 font-semibold text-ink-950">{u.name}</span>
                      <span className="block truncate text-12 text-muted">{ROLE_LABEL[u.role]}{u.unit ? `, ${u.unit}` : ''}</span>
                    </span>
                                        <ChevronRight size={16} className="text-muted transition group-hover:translate-x-0.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-4 flex items-start gap-2 text-12 text-muted"><ShieldCheck size={14} className="mt-0.5 shrink-0" aria-hidden />Demo prototype with synthetic data. Not an official AICTE system.</p>
        </section>
      </div>
      <p className="absolute bottom-2 right-4 text-11 text-white/70">Photo: AICTE head office, Delhi, by Timothy A. Gonsalves, CC BY-SA 4.0, Wikimedia Commons</p>
    </div>
  )
}
