import type { Task } from "./tasks"

export const taskFilters = ["all", "open", "in_review", "done"] as const

export type TaskFilter = (typeof taskFilters)[number]

export function filterTasks(tasks: Task[], query: string, filter: TaskFilter): Task[] {
  const needle = query.trim().toLowerCase()

  return tasks.filter((task) => {
    const matchesFilter = filter === "all" || task.status === filter
    const matchesQuery =
      needle.length === 0 ||
      task.title.toLowerCase().includes(needle) ||
      task.description.toLowerCase().includes(needle) ||
      task.id.toLowerCase().includes(needle)

    return matchesFilter && matchesQuery
  })
}
