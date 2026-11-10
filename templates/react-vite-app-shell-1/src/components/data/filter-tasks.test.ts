import { describe, expect, it } from "vitest"

import { filterTasks, type TaskFilter } from "./filter-tasks"
import { tasks } from "./tasks"

const ids = (query: string, filter: TaskFilter) =>
  filterTasks(tasks, query, filter).map((task) => task.id)

describe("filterTasks", () => {
  it("returns every task when no query or status is selected", () => {
    expect(filterTasks(tasks, "", "all")).toEqual(tasks)
    expect(ids("", "all")).toEqual(tasks.map((task) => task.id))
  })

  it("narrows the catalog to one task by id", () => {
    expect(ids("TASK-121", "all")).toEqual(["TASK-121"])
  })

  it("intersects the search query with the status filter", () => {
    expect(ids("TASK-121", "open")).toEqual([])
  })

  it("matches title or description case-insensitively and trims the query", () => {
    expect(ids("  REGISTRY  ", "all")).toEqual(["TASK-121", "TASK-118"])
    expect(ids("headless", "all")).toEqual(["TASK-103"])
  })

  it("filters by status alone", () => {
    expect(ids("", "open")).toEqual(["TASK-118", "TASK-114"])
    expect(ids("", "done")).toEqual(["TASK-109", "TASK-103"])
    expect(ids("", "in_review")).toEqual(["TASK-121", "TASK-097"])
  })
})
