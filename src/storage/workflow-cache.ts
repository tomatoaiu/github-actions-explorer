import * as v from "valibot"
import { storage } from "wxt/utils/storage"

import { workflowSchema } from "../domain/workflow"
import type { Workflow } from "../domain/workflow"
import type { Repository } from "../github/route"

export const FRESH_CACHE_DURATION_MS = 5 * 60 * 1_000
export const STALE_CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1_000

const timestampSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0))

export const workflowCacheSchema = v.strictObject({
  fetchedAt: timestampSchema,
  workflows: v.array(workflowSchema),
})

export type WorkflowCacheV1 = v.InferOutput<typeof workflowCacheSchema>
export type WorkflowCacheState = "fresh" | "stale" | "expired"

export type AvailableWorkflowCache = {
  state: Exclude<WorkflowCacheState, "expired">
  cache: WorkflowCacheV1
}

export function workflowCacheStorageKey(
  repository: Repository,
): `local:${string}` {
  return `local:github-actions-explorer:workflow-cache:${encodeURIComponent(repository.key)}`
}

function workflowCacheItem(repository: Repository) {
  return storage.defineItem<unknown>(workflowCacheStorageKey(repository), {
    fallback: null,
    migrations: {},
    version: 1,
  })
}

export function classifyWorkflowCache(
  cache: WorkflowCacheV1,
  now: number,
): WorkflowCacheState {
  const age = Math.max(0, now - cache.fetchedAt)
  if (age <= FRESH_CACHE_DURATION_MS) {
    return "fresh"
  }
  if (age <= STALE_CACHE_DURATION_MS) {
    return "stale"
  }
  return "expired"
}

export async function readWorkflowCache(
  repository: Repository,
  now = Date.now(),
): Promise<AvailableWorkflowCache | null> {
  const item = workflowCacheItem(repository)
  const value = await item.getValue()
  if (value === null) {
    return null
  }

  const result = v.safeParse(workflowCacheSchema, value)
  if (!result.success) {
    await item.removeValue()
    return null
  }

  const state = classifyWorkflowCache(result.output, now)
  if (state === "expired") {
    await item.removeValue()
    return null
  }

  return { state, cache: result.output }
}

export async function writeWorkflowCache(
  repository: Repository,
  workflows: Workflow[],
  fetchedAt = Date.now(),
): Promise<void> {
  const cache: WorkflowCacheV1 = { fetchedAt, workflows }
  const result = v.safeParse(workflowCacheSchema, cache)
  if (!result.success) {
    throw new TypeError("Refusing to save an invalid workflow cache")
  }

  await workflowCacheItem(repository).setValue(result.output)
}
