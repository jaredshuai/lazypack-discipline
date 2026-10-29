import { BarChart3, ClipboardList, FolderKanban, Home, Settings, Users } from 'lucide-react'

export const appShell1Nav = [
  { label: 'Overview', href: '#overview', icon: Home },
  { label: 'Tasks', href: '#tasks', icon: ClipboardList, active: true },
  { label: 'Projects', href: '#projects', icon: FolderKanban },
  { label: 'Team', href: '#team', icon: Users },
  { label: 'Reports', href: '#reports', icon: BarChart3 },
  { label: 'Settings', href: '#settings', icon: Settings },
]

export const appShell1User = { name: 'Jordan Lee', email: 'jordan@acme.test', initials: 'JL' }
