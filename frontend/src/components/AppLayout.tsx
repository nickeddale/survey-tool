import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, Settings, Menu, X, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      isActive
        ? 'bg-primary text-primary-foreground'
        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
    }`

  const sidebarContent = (
    <nav className="flex flex-col gap-1 p-4">
      <NavLink to="/dashboard" className={navLinkClass} onClick={() => setSidebarOpen(false)}>
        <LayoutDashboard size={18} />
        Dashboard
      </NavLink>
      <NavLink to="/surveys" className={navLinkClass} onClick={() => setSidebarOpen(false)}>
        <ClipboardList size={18} />
        Surveys
      </NavLink>
      <NavLink to="/settings" className={navLinkClass} onClick={() => setSidebarOpen(false)}>
        <Settings size={18} />
        Settings
      </NavLink>
    </nav>
  )

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top navigation bar */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          {/* Hamburger menu — visible on mobile */}
          <button
            className="md:hidden p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label="Toggle sidebar"
          >
            <Menu size={20} />
          </button>
          <span className="text-base font-semibold text-foreground">DevTracker</span>
        </div>

        <div className="flex items-center gap-3">
          {user && (
            <span className="text-sm text-muted-foreground hidden sm:block">{user.email}</span>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-secondary text-secondary-foreground hover:opacity-90 transition-opacity"
            aria-label="Logout"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar — desktop: always visible; mobile: overlay */}
        <>
          {/* Mobile overlay backdrop */}
          {sidebarOpen && (
            <div
              className="fixed inset-0 z-20 bg-black/50 md:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
          )}

          {/* Sidebar panel */}
          <aside
            className={`
              fixed inset-y-14 left-0 z-30 w-56 bg-card border-r border-border flex flex-col
              transition-transform duration-200
              md:static md:translate-x-0 md:z-auto md:inset-y-auto
              ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            `}
            aria-label="Sidebar navigation"
          >
            {/* Close button — mobile only */}
            <div className="md:hidden flex justify-end p-2">
              <button
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
                onClick={() => setSidebarOpen(false)}
                aria-label="Close sidebar"
              >
                <X size={18} />
              </button>
            </div>

            {sidebarContent}
          </aside>
        </>

        {/* Main content area */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppLayout
