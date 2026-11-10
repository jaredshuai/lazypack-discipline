export type TaskStatus = "open" | "in_review" | "done"
export type TaskPriority = "low" | "medium" | "high"

export type Task = {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assignee: string
  updated: string
}

export const tasks: Task[] = [
  {
    id: "TASK-121",
    title: "Reproduce shadcn Base Nova prefab locally",
    description: "Pin React, Vite, Tailwind and shadcn CLI versions, then add App Shell 1 from the ShadcnStore registry.",
    status: "in_review",
    priority: "high",
    assignee: "JL",
    updated: "2026-10-27",
  },
  {
    id: "TASK-118",
    title: "Verify registry payload is byte-stable",
    description: "Compare the fetched registry item against the generated files so the prefab hash can be recorded.",
    status: "open",
    priority: "medium",
    assignee: "JL",
    updated: "2026-10-26",
  },
  {
    id: "TASK-114",
    title: "Document the shell composition contract",
    description: "Note that AppShell1 takes no children, so page content has to be composed from the primitives.",
    status: "open",
    priority: "high",
    assignee: "MS",
    updated: "2026-10-24",
  },
  {
    id: "TASK-109",
    title: "Add lint and typecheck gates",
    description: "oxlint plus tsc --noEmit run before build; both must be clean on a cold clone.",
    status: "done",
    priority: "medium",
    assignee: "AK",
    updated: "2026-10-21",
  },
  {
    id: "TASK-103",
    title: "Capture headless render evidence",
    description: "Edge or Chrome headless screenshot at 1440x900 to prove the shell paints without console errors.",
    status: "done",
    priority: "low",
    assignee: "AK",
    updated: "2026-10-19",
  },
  {
    id: "TASK-097",
    title: "Replace placeholder stats with a task catalog",
    description: "Swap the demo cards for real data driven cards using the Card and Button primitives.",
    status: "in_review",
    priority: "medium",
    assignee: "MS",
    updated: "2026-10-18",
  },
]
