import { Bell, Plus, Search } from 'lucide-react'

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'

import { AppShell1Sidebar } from './app-shell-1-sidebar'

const stats = [
  ['Active projects', '12'],
  ['Open tasks', '48'],
  ['Team members', '16'],
]

export function AppHeader() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
      <SidebarTrigger aria-label="Toggle navigation" className="min-h-11 min-w-11" />
      <Separator orientation="vertical" className="data-vertical:h-5 data-vertical:self-center" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden sm:flex">Projects</BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:flex" />
          <BreadcrumbItem>
            <BreadcrumbPage>Overview</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto hidden w-56 md:block">
        <Input aria-label="Search workspace" placeholder="Search…" />
      </div>
      <Button variant="ghost" size="icon" aria-label="Notifications, 3 unread">
        <Bell />
        <span className="sr-only">3 unread</span>
      </Button>
    </header>
  )
}

export function AppContent() {
  return (
    <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground">A clear view of your workspace.</p>
        </div>
        <Button>
          <Plus data-icon="inline-start" />
          New project
        </Button>
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-3xl">{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card className="min-h-72">
        <CardHeader>
          <CardTitle>Project activity</CardTitle>
          <CardDescription>Your product content goes inside this shell.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1">
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
            <Search className="mr-2 size-4" />
            Replace with your screen
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

export function AppShell1() {
  return (
    <SidebarProvider>
      <AppShell1Sidebar />
      <SidebarInset>
        <AppHeader />
        <AppContent />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default AppShell1
