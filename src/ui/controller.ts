import { normalizeQuery } from "../domain/search"
import type { Workflow } from "../domain/workflow"
import type { GitHubActionsRoute } from "../github/route"
import { fetchWorkflows } from "../github/workflow-source"
import {
  clearRepositoryHistory,
  createEmptyRepositoryState,
  readRepositoryState,
  recordRecentQuery,
  recordRecentWorkflow,
  removeRecentQuery,
  removeRecentWorkflow,
  toggleCollapsedPrefix,
  writeRepositoryState,
} from "../storage/repository-state"
import type { RepositoryStateV1 } from "../storage/repository-state"
import {
  readWorkflowCache,
  writeWorkflowCache,
} from "../storage/workflow-cache"
import { createExplorerView } from "./render"
import type {
  ExplorerCacheStatus,
  ExplorerDisplayMode,
  ExplorerRenderState,
  ExplorerView,
} from "./render"

export type ExplorerControllerOptions = {
  container: HTMLElement
  initialDisplayMode: ExplorerDisplayMode
  onDisplayModeChange: (displayMode: ExplorerDisplayMode) => void
  route: GitHubActionsRoute
  signal: AbortSignal
  setNativeListHidden: (hidden: boolean) => void
  now?: () => number
}

export class ExplorerController {
  readonly #route: GitHubActionsRoute
  readonly #signal: AbortSignal
  readonly #setNativeListHidden: (hidden: boolean) => void
  readonly #now: () => number
  readonly #onDisplayModeChange: (displayMode: ExplorerDisplayMode) => void
  readonly #view: ExplorerView
  #disposed = false
  #loadInProgress = false
  #repositoryWriteQueue: Promise<void> | null = null
  #state: ExplorerRenderState

  constructor({
    container,
    initialDisplayMode,
    onDisplayModeChange,
    route,
    signal,
    setNativeListHidden,
    now = Date.now,
  }: ExplorerControllerOptions) {
    this.#route = route
    this.#signal = signal
    this.#setNativeListHidden = setNativeListHidden
    this.#now = now
    this.#onDisplayModeChange = onDisplayModeChange
    this.#state = {
      repositoryLabel: `${route.repository.owner}/${route.repository.repo}`,
      currentPath: route.url.pathname,
      query: "",
      status: "loading",
      cacheStatus: null,
      displayMode: initialDisplayMode,
      isRefreshing: false,
      workflows: [],
      repositoryState: createEmptyRepositoryState(),
    }
    this.#view = createExplorerView(container, {
      onQueryChange: (query) => this.#setQuery(query),
      onQuerySubmit: (query) => this.#submitQuery(query),
      onUseRecentQuery: (query) => this.#setQuery(query),
      onOpenWorkflow: (workflowId) => this.#openWorkflow(workflowId),
      onRemoveRecentQuery: (query) => this.#removeRecentQuery(query),
      onRemoveRecentWorkflow: (workflowId) =>
        this.#removeRecentWorkflow(workflowId),
      onToggleDisplayMode: () => this.#toggleDisplayMode(),
      onTogglePrefix: (prefix) => this.#togglePrefix(prefix),
      onClearHistory: () => this.#clearHistory(),
      onRetry: () => {
        void this.#refreshWorkflows(this.#state.workflows)
      },
    })
  }

  start(): void {
    this.#render()
    void this.#initialize()
  }

  dispose(): void {
    if (this.#disposed) {
      return
    }
    this.#disposed = true
    this.#setNativeListHidden(false)
    this.#view.dispose()
  }

  async #initialize(): Promise<void> {
    const [repositoryState, availableCache] = await Promise.all([
      this.#readRepositoryStateSafely(),
      this.#readWorkflowCacheSafely(),
    ])
    if (this.#shouldStop()) {
      return
    }

    this.#state = { ...this.#state, repositoryState }
    if (availableCache?.state === "fresh") {
      this.#showWorkflows(availableCache.cache.workflows, "fresh")
      return
    }

    const staleWorkflows = availableCache?.cache.workflows ?? []
    if (availableCache?.state === "stale") {
      this.#showWorkflows(staleWorkflows, "stale", true)
    }
    await this.#refreshWorkflows(staleWorkflows)
  }

  async #readRepositoryStateSafely(): Promise<RepositoryStateV1> {
    try {
      return await readRepositoryState(this.#route.repository)
    } catch {
      return createEmptyRepositoryState()
    }
  }

  async #readWorkflowCacheSafely() {
    try {
      return await readWorkflowCache(this.#route.repository, this.#now())
    } catch {
      return null
    }
  }

  async #refreshWorkflows(staleWorkflows: Workflow[]): Promise<void> {
    if (this.#loadInProgress || this.#shouldStop()) {
      return
    }
    this.#loadInProgress = true

    if (staleWorkflows.length > 0 || this.#state.cacheStatus === "stale") {
      this.#showWorkflows(staleWorkflows, "stale", true)
    } else {
      this.#state = {
        ...this.#state,
        status: "loading",
        cacheStatus: null,
        isRefreshing: false,
      }
      this.#setNativeListHidden(false)
      this.#render()
    }

    try {
      const workflows = await fetchWorkflows({
        repository: this.#route.repository,
        signal: this.#signal,
      })
      if (this.#shouldStop()) {
        return
      }

      try {
        await writeWorkflowCache(this.#route.repository, workflows, this.#now())
      } catch {
        // Fresh network data remains usable even when storage is unavailable.
      }
      if (this.#shouldStop()) {
        return
      }
      this.#showWorkflows(workflows, null)
    } catch {
      if (this.#shouldStop()) {
        return
      }

      if (this.#state.cacheStatus === "stale") {
        this.#showWorkflows(staleWorkflows, "stale")
      } else {
        this.#state = {
          ...this.#state,
          status: "error",
          cacheStatus: null,
          isRefreshing: false,
          workflows: [],
        }
        this.#setNativeListHidden(false)
        this.#render()
      }
    } finally {
      this.#loadInProgress = false
    }
  }

  #showWorkflows(
    workflows: Workflow[],
    cacheStatus: ExplorerCacheStatus,
    isRefreshing = false,
  ): void {
    this.#state = {
      ...this.#state,
      status: "ready",
      cacheStatus,
      isRefreshing,
      workflows,
    }
    this.#setNativeListHidden(this.#state.displayMode === "explorer")
    this.#render()
  }

  #setQuery(query: string): void {
    this.#state = { ...this.#state, query }
    this.#render()
  }

  #submitQuery(query: string): void {
    this.#setQuery(query)
    if (normalizeQuery(query).length === 0) {
      return
    }

    this.#replaceRepositoryState(
      recordRecentQuery(this.#state.repositoryState, query, this.#now()),
    )
  }

  #openWorkflow(workflowId: string): void {
    const workflow =
      this.#state.workflows.find((candidate) => candidate.id === workflowId) ??
      this.#state.repositoryState.recentWorkflows.find(
        (candidate) => candidate.id === workflowId,
      )
    if (workflow === undefined) {
      return
    }

    let nextState = recordRecentWorkflow(
      this.#state.repositoryState,
      workflow,
      this.#now(),
    )
    if (normalizeQuery(this.#state.query).length > 0) {
      nextState = recordRecentQuery(nextState, this.#state.query, this.#now())
    }

    this.#state = { ...this.#state, repositoryState: nextState }
    this.#persistRepositoryState(nextState)
  }

  #togglePrefix(prefix: string): void {
    this.#replaceRepositoryState(
      toggleCollapsedPrefix(this.#state.repositoryState, prefix),
    )
  }

  #removeRecentQuery(query: string): void {
    this.#replaceRepositoryState(
      removeRecentQuery(this.#state.repositoryState, query),
    )
  }

  #removeRecentWorkflow(workflowId: string): void {
    this.#replaceRepositoryState(
      removeRecentWorkflow(this.#state.repositoryState, workflowId),
    )
  }

  #toggleDisplayMode(): void {
    const displayMode: ExplorerDisplayMode =
      this.#state.displayMode === "explorer" ? "original" : "explorer"
    this.#state = { ...this.#state, displayMode }
    this.#setNativeListHidden(
      displayMode === "explorer" && this.#state.status === "ready",
    )
    this.#onDisplayModeChange(displayMode)
    this.#render()
  }

  #clearHistory(): void {
    this.#replaceRepositoryState(
      clearRepositoryHistory(this.#state.repositoryState),
    )
  }

  #replaceRepositoryState(repositoryState: RepositoryStateV1): void {
    this.#state = { ...this.#state, repositoryState }
    this.#render()
    this.#persistRepositoryState(repositoryState)
  }

  #persistRepositoryState(repositoryState: RepositoryStateV1): void {
    const write = async (): Promise<void> => {
      try {
        await writeRepositoryState(this.#route.repository, repositoryState)
      } catch {
        // History persistence must never break workflow navigation.
      }
    }
    const queuedWrite =
      this.#repositoryWriteQueue === null
        ? write()
        : this.#repositoryWriteQueue.then(write)
    this.#repositoryWriteQueue = queuedWrite
    void queuedWrite.then(() => {
      if (this.#repositoryWriteQueue === queuedWrite) {
        this.#repositoryWriteQueue = null
      }
      return undefined
    })
  }

  #render(): void {
    if (!this.#disposed) {
      this.#view.render(this.#state)
    }
  }

  #shouldStop(): boolean {
    return this.#disposed || this.#signal.aborted
  }
}
