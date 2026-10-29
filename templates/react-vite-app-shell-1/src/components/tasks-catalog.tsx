import { useMemo, useState } from "react"
import { Plus, Search } from "lucide-react"

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

import { AppShell1Sidebar } from "@/components/app-shell-1-sidebar"
import { filterTasks, taskFilters, type TaskFilter } from "@/components/data/filter-tasks"
import { tasks, type TaskStatus } from "@/components/data/tasks"

const statusLabel: Record<TaskStatus, string> = {
  open: "Open",
  in_review: "In review",
  done: "Done",
}

const statusClass: Record<TaskStatus, string> = {
  open: "bg-secondary text-secondary-foreground",
  in_review: "bg-primary text-primary-foreground",
  done: "bg-muted text-muted-foreground",
}

const filterLabel: Record<TaskFilter, string> = {
  all: "All",
  open: "Open",
  in_review: "In review",
  done: "Done",
}

function CatalogHeader({
  query,
  onQueryChange,
}: {
  query: string
  onQueryChange: (value: string) => void
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-6">
      <SidebarTrigger aria-label="Toggle navigation" className="min-h-11 min-w-11" />
      <Separator orientation="vertical" className="data-vertical:h-5 data-vertical:self-center" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem className="hidden sm:flex">Workspace</BreadcrumbItem>
          <BreadcrumbSeparator className="hidden sm:flex" />
          <BreadcrumbItem>
            <BreadcrumbPage>Task catalog</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto hidden w-56 md:block">
        <Input
          aria-label="Search workspace"
          placeholder="Search…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          autoComplete="off"
        />
      </div>
    </header>
  )
}

function TaskCard({ task }: { task: (typeof tasks)[number] }) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>{task.title}</CardTitle>
        <CardDescription>{task.description}</CardDescription>
        <CardAction>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusClass[task.status]}`}
            data-status={task.status}
          >
            {statusLabel[task.status]}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex-1">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Task</dt>
            <dd className="font-medium">{task.id}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Assignee</dt>
            <dd className="font-medium">{task.assignee}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Priority</dt>
            <dd className="font-medium capitalize">{task.priority}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Updated</dt>
            <dd className="font-medium">{task.updated}</dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter className="justify-between gap-3 border-t pt-4">
        <span className="text-xs text-muted-foreground">{statusLabel[task.status]}</span>
        <Button variant="outline" size="sm">
          Open task
        </Button>
      </CardFooter>
    </Card>
  )
}

export function TasksCatalog({
  query,
  onQueryChange,
}: {
  query: string
  onQueryChange: (value: string) => void
}) {
  const [filter, setFilter] = useState<TaskFilter>("all")

  const visible = useMemo(() => filterTasks(tasks, query, filter), [query, filter])

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Task catalog</h1>
          <p className="text-sm text-muted-foreground">
            {visible.length} of {tasks.length} tasks
          </p>
        </div>
        <Button>
          <Plus data-icon="inline-start" />
          New task
        </Button>
      </div>

      <FieldGroup>
        <Field className="max-w-xl">
          <FieldLabel htmlFor="task-search">Filter tasks</FieldLabel>
          <Input
            id="task-search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search by title, description or id"
            autoComplete="off"
          />
          <FieldDescription>Type to narrow the catalog by title, description or task id.</FieldDescription>
        </Field>
      </FieldGroup>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {taskFilters.map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={value === filter ? "secondary" : "ghost"}
            aria-pressed={value === filter}
            onClick={() => setFilter(value)}
          >
            {filterLabel[value]}
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>No tasks match this filter</EmptyTitle>
            <EmptyDescription>Clear the search text or pick another status to see the rest of the catalog.</EmptyDescription>
          </EmptyHeader>
          <Button
            variant="outline"
            onClick={() => {
              onQueryChange("")
              setFilter("all")
            }}
          >
            Reset filters
          </Button>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      )}

    </div>
  )
}

export function TasksApp() {
  const [query, setQuery] = useState("")

  return (
    <SidebarProvider>
      <AppShell1Sidebar />
      <SidebarInset>
        <CatalogHeader query={query} onQueryChange={setQuery} />
        <TasksCatalog query={query} onQueryChange={setQuery} />
      </SidebarInset>
    </SidebarProvider>
  )
}

export default TasksApp
