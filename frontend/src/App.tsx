// All routes. Pages other than sign-in and Today load on demand, so the first screen appears quickly.
import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'
import Shell from './components/Shell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import { Empty, Skeleton } from './components/ui'

const Inbox = lazy(() => import('./pages/Inbox'))
const Cases = lazy(() => import('./pages/Cases'))
const CaseDetail = lazy(() => import('./pages/CaseDetail'))
const NewCase = lazy(() => import('./pages/NewCase'))
const Institutions = lazy(() => import('./pages/Institutions'))
const Institution = lazy(() => import('./pages/Institution'))
const Overlaps = lazy(() => import('./pages/Overlaps'))
const OverlapReview = lazy(() => import('./pages/OverlapReview'))
const Matching = lazy(() => import('./pages/Matching'))
const Deadlines = lazy(() => import('./pages/Deadlines'))
const Import = lazy(() => import('./pages/Import'))
const ImportReceipt = lazy(() => import('./pages/ImportReceipt'))
const Reports = lazy(() => import('./pages/Reports'))
const DataHealth = lazy(() => import('./pages/DataHealth'))
const Settings = lazy(() => import('./pages/Settings'))
const Audit = lazy(() => import('./pages/Audit'))
const HowItWorks = lazy(() => import('./pages/HowItWorks'))
const Check = lazy(() => import('./pages/Check'))
const Flow = lazy(() => import('./pages/Flow'))
const Management = lazy(() => import('./pages/Management'))
const Calendar = lazy(() => import('./pages/Calendar'))
const Demo = lazy(() => import('./pages/Demo'))
const Reply = lazy(() => import('./pages/Reply'))
const Letter = lazy(() => import('./pages/Letter'))
const Requests = lazy(() => import('./pages/Requests'))
const Policy = lazy(() => import('./pages/Policy'))
const Radar = lazy(() => import('./pages/Radar'))
const MyDay = lazy(() => import('./pages/MyDay'))
const Allocation = lazy(() => import('./pages/Allocation'))
const Team = lazy(() => import('./pages/Team'))

const Loading = () => <div className="space-y-4" aria-busy="true"><Skeleton className="h-12 w-1/2" /><Skeleton className="h-72" /></div>
const page = (el: React.ReactNode) => <Suspense fallback={<Loading />}>{el}</Suspense>

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route path="reply/:token" element={page(<Reply />)} />
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="inbox" element={page(<Inbox />)} />
        <Route path="cases" element={page(<Cases />)} />
        <Route path="cases/new" element={page(<NewCase />)} />
        <Route path="cases/:id" element={page(<CaseDetail />)} />
        <Route path="institutions" element={page(<Institutions />)} />
        <Route path="institutions/:id" element={page(<Institution />)} />
        <Route path="overlaps" element={page(<Overlaps />)} />
        <Route path="overlaps/:id" element={page(<OverlapReview />)} />
        <Route path="matching" element={page(<Matching />)} />
        <Route path="deadlines" element={page(<Deadlines />)} />
        <Route path="import" element={page(<Import />)} />
        <Route path="import/:id" element={page(<ImportReceipt />)} />
        <Route path="reports" element={page(<Reports />)} />
        <Route path="data-health" element={page(<DataHealth />)} />
        <Route path="settings" element={page(<Settings />)} />
        <Route path="settings/statuses" element={page(<Settings />)} />
        <Route path="settings/users" element={page(<Settings />)} />
        <Route path="audit" element={page(<Audit />)} />
        <Route path="check" element={page(<Check />)} />
        <Route path="management" element={page(<Management />)} />
        <Route path="calendar" element={page(<Calendar />)} />
        <Route path="demo" element={page(<Demo />)} />
        <Route path="flow" element={page(<Flow />)} />
        <Route path="letters" element={page(<Letter />)} />
        <Route path="requests" element={page(<Requests />)} />
        <Route path="policy" element={page(<Policy />)} />
        <Route path="radar" element={page(<Radar />)} />
        <Route path="my-day" element={page(<MyDay />)} />
        <Route path="allocation" element={page(<Allocation />)} />
        <Route path="team" element={page(<Team />)} />
        <Route path="how-it-works" element={page(<HowItWorks />)} />
        <Route path="*" element={<Empty title="This page does not exist">Use the menu to find what you need.</Empty>} />
      </Route>
    </Routes>
  )
}
