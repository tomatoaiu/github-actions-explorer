import { describe, expect, it } from "vitest"

import {
  clearRepositoryHistory,
  createEmptyRepositoryState,
  MAX_HISTORY_ITEMS,
  recordRecentQuery,
  recordRecentWorkflow,
  removeRecentQuery,
  removeRecentWorkflow,
  repositoryStateStorageKey,
  toggleCollapsedPrefix,
} from "../src/storage/repository-state"
import type { Repository } from "../src/github/route"
import { workflow } from "./helpers"

const repository: Repository = {
  owner: "Octo",
  repo: "Repo",
  key: "octo/repo",
}

describe("repository state", () => {
  it("stores case-insensitive query history with the newest value first", () => {
    let state = createEmptyRepositoryState()
    state = recordRecentQuery(state, " Deploy ", 1)
    state = recordRecentQuery(state, "deploy", 2)

    expect(state.recentQueries).toEqual([{ query: "deploy", usedAt: 2 }])
  })

  it("limits both histories to ten entries", () => {
    let state = createEmptyRepositoryState()
    for (let index = 0; index < 12; index += 1) {
      state = recordRecentQuery(state, `query-${index}`, index)
      state = recordRecentWorkflow(
        state,
        workflow(`workflow-${index}`, index),
        index,
      )
    }

    expect(state.recentQueries).toHaveLength(MAX_HISTORY_ITEMS)
    expect(state.recentWorkflows).toHaveLength(MAX_HISTORY_ITEMS)
    expect(state.recentQueries[0]?.query).toBe("query-11")
  })

  it("deduplicates recently opened workflows by id", () => {
    const item = workflow("deploy", 0)
    let state = recordRecentWorkflow(createEmptyRepositoryState(), item, 1)
    state = recordRecentWorkflow(state, { ...item, name: "Deploy" }, 2)

    expect(state.recentWorkflows).toEqual([
      { id: item.id, name: "Deploy", url: item.url, openedAt: 2 },
    ])
  })

  it("removes individual recent queries and workflows", () => {
    let state = createEmptyRepositoryState()
    state = recordRecentQuery(state, "deploy", 1)
    state = recordRecentQuery(state, "test", 2)
    state = recordRecentWorkflow(state, workflow("deploy-api", 0), 1)
    state = recordRecentWorkflow(state, workflow("test-unit", 1), 2)

    state = removeRecentQuery(state, " DEPLOY ")
    state = removeRecentWorkflow(state, "2")

    expect(state.recentQueries.map((recent) => recent.query)).toEqual(["test"])
    expect(state.recentWorkflows.map((recent) => recent.id)).toEqual(["1"])
  })

  it("persists normalized collapsed prefixes", () => {
    let state = toggleCollapsedPrefix(
      createEmptyRepositoryState(),
      "Deploy/API",
    )
    expect(state.collapsedPrefixes).toEqual(["deploy/api"])

    state = toggleCollapsedPrefix(state, "DEPLOY/API")
    expect(state.collapsedPrefixes).toEqual([])
  })

  it("clears histories without changing collapsed groups", () => {
    let state = toggleCollapsedPrefix(createEmptyRepositoryState(), "deploy")
    state = recordRecentQuery(state, "deploy", 1)
    state = recordRecentWorkflow(state, workflow("deploy-api", 0), 1)

    expect(clearRepositoryHistory(state)).toEqual({
      recentQueries: [],
      recentWorkflows: [],
      collapsedPrefixes: ["deploy"],
    })
  })

  it("uses a repository-specific local storage key", () => {
    expect(repositoryStateStorageKey(repository)).toBe(
      "local:github-actions-explorer:repository-state:octo%2Frepo",
    )
  })
})
