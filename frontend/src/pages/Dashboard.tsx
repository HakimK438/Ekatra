// Home: each role lands on the screen built for its own job. Officers get their desk, the coordinator gets the
// coordination desk, leadership gets the management view, and the data steward and administrator get their own.
import { useUser } from '../hooks/useUser'
import CoordinatorDesk from './home/CoordinatorDesk'
import Desk from './home/Desk'
import { AdminDesk, DataDesk } from './home/OtherDesks'
import Management from './Management'

export default function Dashboard() {
  const { user } = useUser()
  switch (user.role) {
    case 'coordinator': return <CoordinatorDesk />
    case 'senior_management': return <Management />
    case 'data_steward': return <DataDesk />
    case 'admin': return <AdminDesk />
    default: return <Desk />
  }
}
