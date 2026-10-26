import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { UserProvider, setBootUser } from './hooks/useUser'
import { api, MODE } from './lib/api'
import App from './App'

// Screens stay in step: every save invalidates all queries, a tab coming back to the front refetches, and with the real
// backend the open screen also refetches every 30 seconds (only while it is visible), so other officers' changes appear.
const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: false, refetchOnWindowFocus: true, refetchInterval: MODE === 'http' ? 30_000 : false, refetchIntervalInBackground: false } } })

async function start() {
  // With the real backend: fetch the working date and the signed-in user (if the cookie is valid) before the first screen.
  try { setBootUser(await api.bootstrap()) } catch { /* the sign-in screen shows the error when the server is unreachable */ }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={qc}>
        <UserProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </UserProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  )
}
void start()
