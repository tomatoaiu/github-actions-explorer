import { describe, expect, it } from "vitest"

import {
  normalizeQuery,
  searchWorkflowResults,
  searchWorkflows,
} from "../src/domain/search"
import { workflow } from "./helpers"

describe("searchWorkflows", () => {
  const workflows = [
    workflow("test-unit", 0, "unit.yml"),
    workflow("deploy-api", 1, "production-api.yml"),
    workflow("deploy-frontend", 2, "production-web.yml"),
  ]

  it("returns fuzzy matches in score order", () => {
    const result = searchWorkflows(workflows, "dply api")

    expect(result[0]?.name).toBe("deploy-api")
  })

  it("searches file names", () => {
    const result = searchWorkflows(workflows, "production web")

    expect(result[0]?.name).toBe("deploy-frontend")
  })

  it("preserves source order for an empty query", () => {
    expect(searchWorkflows(workflows, "   ")).toEqual(workflows)
  })

  it("returns match ranges for each searchable field", () => {
    const [result] = searchWorkflowResults(workflows, "api")

    expect(result?.workflow.name).toBe("deploy-api")
    expect(result?.matches.name).toContainEqual([7, 9])
    expect(result?.matches.fileName).toContainEqual([11, 13])
  })
})

describe("normalizeQuery", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeQuery("  deploy  ")).toBe("deploy")
  })
})
