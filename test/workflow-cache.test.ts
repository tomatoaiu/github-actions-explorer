import { describe, expect, it } from "vitest"

import {
  classifyWorkflowCache,
  FRESH_CACHE_DURATION_MS,
  STALE_CACHE_DURATION_MS,
  workflowCacheStorageKey,
} from "../src/storage/workflow-cache"
import type { WorkflowCacheV1 } from "../src/storage/workflow-cache"
import type { Repository } from "../src/github/route"

const cache: WorkflowCacheV1 = { fetchedAt: 1_000, workflows: [] }

describe("workflow cache", () => {
  it("is fresh for five minutes", () => {
    expect(
      classifyWorkflowCache(cache, cache.fetchedAt + FRESH_CACHE_DURATION_MS),
    ).toBe("fresh")
  })

  it("is a stale fallback for up to seven days", () => {
    expect(
      classifyWorkflowCache(
        cache,
        cache.fetchedAt + FRESH_CACHE_DURATION_MS + 1,
      ),
    ).toBe("stale")
    expect(
      classifyWorkflowCache(cache, cache.fetchedAt + STALE_CACHE_DURATION_MS),
    ).toBe("stale")
  })

  it("expires after seven days", () => {
    expect(
      classifyWorkflowCache(
        cache,
        cache.fetchedAt + STALE_CACHE_DURATION_MS + 1,
      ),
    ).toBe("expired")
  })

  it("uses a repository-specific local storage key", () => {
    const repository: Repository = {
      owner: "octo",
      repo: "repo",
      key: "octo/repo",
    }

    expect(workflowCacheStorageKey(repository)).toBe(
      "local:github-actions-explorer:workflow-cache:octo%2Frepo",
    )
  })
})
