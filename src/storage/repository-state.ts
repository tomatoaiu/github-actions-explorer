import * as v from "valibot"
import { storage } from "wxt/utils/storage"

import { githubPathSchema } from "../domain/workflow"
import type { Workflow } from "../domain/workflow"
import type { Repository } from "../github/route"

export const MAX_HISTORY_ITEMS = 10

const timestampSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0))

const recentQuerySchema = v.strictObject({
  query: v.pipe(v.string(), v.nonEmpty()),
  usedAt: timestampSchema,
})

const recentWorkflowSchema = v.strictObject({
  id: v.pipe(v.string(), v.nonEmpty()),
  name: v.pipe(v.string(), v.nonEmpty()),
  url: githubPathSchema,
  openedAt: timestampSchema,
})

export const repositoryStateSchema = v.strictObject({
  recentQueries: v.pipe(
    v.array(recentQuerySchema),
    v.maxLength(MAX_HISTORY_ITEMS),
  ),
  recentWorkflows: v.pipe(
    v.array(recentWorkflowSchema),
    v.maxLength(MAX_HISTORY_ITEMS),
  ),
  collapsedPrefixes: v.array(v.pipe(v.string(), v.nonEmpty())),
})

export type RepositoryStateV1 = v.InferOutput<typeof repositoryStateSchema>

export function createEmptyRepositoryState(): RepositoryStateV1 {
  return {
    recentQueries: [],
    recentWorkflows: [],
    collapsedPrefixes: [],
  }
}

export function repositoryStateStorageKey(
  repository: Repository,
): `local:${string}` {
  return `local:github-actions-explorer:repository-state:${encodeURIComponent(repository.key)}`
}

function repositoryStateItem(repository: Repository) {
  return storage.defineItem<unknown>(repositoryStateStorageKey(repository), {
    fallback: createEmptyRepositoryState(),
    migrations: {},
    version: 1,
  })
}

function normalizedIdentity(value: string): string {
  return value.trim().toLocaleLowerCase("en-US")
}

export function recordRecentQuery(
  state: RepositoryStateV1,
  rawQuery: string,
  usedAt: number,
): RepositoryStateV1 {
  const query = rawQuery.trim()
  if (query.length === 0) {
    return state
  }

  const identity = normalizedIdentity(query)
  return {
    ...state,
    recentQueries: [
      { query, usedAt },
      ...state.recentQueries.filter(
        (recent) => normalizedIdentity(recent.query) !== identity,
      ),
    ].slice(0, MAX_HISTORY_ITEMS),
  }
}

export function removeRecentQuery(
  state: RepositoryStateV1,
  rawQuery: string,
): RepositoryStateV1 {
  const identity = normalizedIdentity(rawQuery)
  if (identity.length === 0) {
    return state
  }

  const recentQueries = state.recentQueries.filter(
    (recent) => normalizedIdentity(recent.query) !== identity,
  )
  return recentQueries.length === state.recentQueries.length
    ? state
    : { ...state, recentQueries }
}

export function recordRecentWorkflow(
  state: RepositoryStateV1,
  workflow: Pick<Workflow, "id" | "name" | "url">,
  openedAt: number,
): RepositoryStateV1 {
  return {
    ...state,
    recentWorkflows: [
      {
        id: workflow.id,
        name: workflow.name,
        url: workflow.url,
        openedAt,
      },
      ...state.recentWorkflows.filter((recent) => recent.id !== workflow.id),
    ].slice(0, MAX_HISTORY_ITEMS),
  }
}

export function removeRecentWorkflow(
  state: RepositoryStateV1,
  workflowId: string,
): RepositoryStateV1 {
  const recentWorkflows = state.recentWorkflows.filter(
    (recent) => recent.id !== workflowId,
  )
  return recentWorkflows.length === state.recentWorkflows.length
    ? state
    : { ...state, recentWorkflows }
}

export function toggleCollapsedPrefix(
  state: RepositoryStateV1,
  prefix: string,
): RepositoryStateV1 {
  const normalizedPrefix = normalizedIdentity(prefix)
  if (normalizedPrefix.length === 0) {
    return state
  }

  const isCollapsed = state.collapsedPrefixes.includes(normalizedPrefix)
  return {
    ...state,
    collapsedPrefixes: isCollapsed
      ? state.collapsedPrefixes.filter(
          (candidate) => candidate !== normalizedPrefix,
        )
      : [...state.collapsedPrefixes, normalizedPrefix],
  }
}

export function clearRepositoryHistory(
  state: RepositoryStateV1,
): RepositoryStateV1 {
  return {
    ...state,
    recentQueries: [],
    recentWorkflows: [],
  }
}

export async function readRepositoryState(
  repository: Repository,
): Promise<RepositoryStateV1> {
  const item = repositoryStateItem(repository)
  const result = v.safeParse(repositoryStateSchema, await item.getValue())
  if (result.success) {
    return result.output
  }

  const emptyState = createEmptyRepositoryState()
  await item.setValue(emptyState)
  return emptyState
}

export async function writeRepositoryState(
  repository: Repository,
  state: RepositoryStateV1,
): Promise<void> {
  const result = v.safeParse(repositoryStateSchema, state)
  if (!result.success) {
    throw new TypeError("Refusing to save invalid repository state")
  }

  await repositoryStateItem(repository).setValue(result.output)
}
