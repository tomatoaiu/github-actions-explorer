import Fuse from "fuse.js"
import type { FuseResultMatch, IFuseOptions } from "fuse.js"

import type { Workflow } from "./workflow"

const FUSE_OPTIONS: IFuseOptions<Workflow> = {
  keys: [
    { name: "name", weight: 0.75 },
    { name: "fileName", weight: 0.25 },
  ],
  includeMatches: true,
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.4,
}

export type TextMatchRange = readonly [start: number, end: number]

export type WorkflowFieldMatches = {
  name: TextMatchRange[]
  fileName: TextMatchRange[]
}

export type WorkflowSearchResult = {
  workflow: Workflow
  matches: WorkflowFieldMatches
}

export function normalizeQuery(query: string): string {
  return query.trim()
}

export function searchWorkflows(
  workflows: Workflow[],
  rawQuery: string,
): Workflow[] {
  return searchWorkflowResults(workflows, rawQuery).map(
    (result) => result.workflow,
  )
}

function fieldMatches(
  matches: ReadonlyArray<FuseResultMatch> | undefined,
): WorkflowFieldMatches {
  const result: WorkflowFieldMatches = { name: [], fileName: [] }
  for (const match of matches ?? []) {
    if (match.key !== "name" && match.key !== "fileName") {
      continue
    }
    result[match.key].push(
      ...match.indices.map(([start, end]) => [start, end] as const),
    )
  }
  return result
}

export function searchWorkflowResults(
  workflows: Workflow[],
  rawQuery: string,
): WorkflowSearchResult[] {
  const query = normalizeQuery(rawQuery)
  if (query.length === 0) {
    return workflows.map((workflow) => ({
      workflow,
      matches: { name: [], fileName: [] },
    }))
  }

  const fuse = new Fuse(workflows, FUSE_OPTIONS)
  return fuse
    .search(query)
    .toSorted((left, right) => {
      const scoreDifference =
        (left.score ?? Number.POSITIVE_INFINITY) -
        (right.score ?? Number.POSITIVE_INFINITY)

      return scoreDifference || left.item.sourceOrder - right.item.sourceOrder
    })
    .map((result) => ({
      workflow: result.item,
      matches: fieldMatches(result.matches),
    }))
}
