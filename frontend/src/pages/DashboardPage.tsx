import { useAuth } from '../contexts/AuthContext'

function DashboardPage() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <button
            onClick={() => logout()}
            className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-md hover:opacity-90 transition-opacity"
          >
            Sign Out
          </button>
        </div>
        <p className="text-muted-foreground">
          Welcome, <span className="text-foreground font-medium">{user?.email}</span>
        </p>
      </div>
    </div>
  )
}

export default DashboardPage
