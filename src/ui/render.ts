import { groupWorkflows } from "../domain/grouping"
import type { GroupedWorkflowItem } from "../domain/grouping"
import { normalizeQuery, searchWorkflowResults } from "../domain/search"
import type { TextMatchRange, WorkflowFieldMatches } from "../domain/search"
import type { Workflow } from "../domain/workflow"
import type { RepositoryStateV1 } from "../storage/repository-state"

export type ExplorerStatus = "loading" | "ready" | "error"
export type ExplorerCacheStatus = "fresh" | "stale" | null
export type ExplorerDisplayMode = "explorer" | "original"

export type ExplorerRenderState = {
  repositoryLabel: string
  currentPath: string
  query: string
  status: ExplorerStatus
  cacheStatus: ExplorerCacheStatus
  displayMode: ExplorerDisplayMode
  isRefreshing: boolean
  workflows: Workflow[]
  repositoryState: RepositoryStateV1
}

export type ExplorerViewHandlers = {
  onQueryChange: (query: string) => void
  onQuerySubmit: (query: string) => void
  onUseRecentQuery: (query: string) => void
  onOpenWorkflow: (workflowId: string) => void
  onRemoveRecentQuery: (query: string) => void
  onRemoveRecentWorkflow: (workflowId: string) => void
  onToggleDisplayMode: () => void
  onTogglePrefix: (prefix: string) => void
  onClearHistory: () => void
  onRetry: () => void
}

export type ExplorerView = {
  render: (state: ExplorerRenderState) => void
  dispose: () => void
}

function element<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(tagName)
  if (className !== undefined) {
    result.className = className
  }
  if (text !== undefined) {
    result.textContent = text
  }
  return result
}

function isCurrentWorkflow(url: string, currentPath: string): boolean {
  try {
    return new URL(url, "https://github.com").pathname === currentPath
  } catch {
    return false
  }
}

function normalizedMatchRanges(
  text: string,
  ranges: readonly TextMatchRange[],
): TextMatchRange[] {
  const validRanges = ranges
    .map(
      ([start, end]) =>
        [Math.max(0, start), Math.min(text.length - 1, end)] as const,
    )
    .filter(([start, end]) => start <= end)
    .toSorted(([leftStart], [rightStart]) => leftStart - rightStart)
  const mergedRanges: TextMatchRange[] = []

  for (const range of validRanges) {
    const previous = mergedRanges.at(-1)
    if (previous === undefined || range[0] > previous[1] + 1) {
      mergedRanges.push(range)
      continue
    }
    mergedRanges[mergedRanges.length - 1] = [
      previous[0],
      Math.max(previous[1], range[1]),
    ]
  }

  return mergedRanges
}

function appendHighlightedText(
  parent: HTMLElement,
  text: string,
  ranges: readonly TextMatchRange[],
): void {
  let cursor = 0
  for (const [start, end] of normalizedMatchRanges(text, ranges)) {
    if (start > cursor) {
      parent.append(document.createTextNode(text.slice(cursor, start)))
    }
    parent.append(element("strong", "search-match", text.slice(start, end + 1)))
    cursor = end + 1
  }
  if (cursor < text.length) {
    parent.append(document.createTextNode(text.slice(cursor)))
  }
}

function workflowLink(
  workflow: Pick<Workflow, "id" | "name" | "url"> &
    Partial<Pick<Workflow, "disabled" | "fileName">>,
  currentPath: string,
  options: {
    compact?: boolean
    displayName?: string
    matches?: WorkflowFieldMatches
  } = {},
): HTMLAnchorElement {
  const compact = options.compact ?? false
  const displayName = options.displayName ?? workflow.name
  const link = element("a", compact ? "workflow-link compact" : "workflow-link")
  link.href = workflow.url
  link.dataset.workflowId = workflow.id
  if (displayName !== workflow.name) {
    link.title = workflow.name
  }
  if (isCurrentWorkflow(workflow.url, currentPath)) {
    link.classList.add("current")
    link.setAttribute("aria-current", "page")
  }

  const labels = element("span", "workflow-labels")
  const name = element("span", "workflow-name")
  appendHighlightedText(name, displayName, options.matches?.name ?? [])
  labels.append(name)
  if (!compact && workflow.fileName !== undefined) {
    const fileName = element("span", "workflow-file")
    appendHighlightedText(
      fileName,
      workflow.fileName,
      options.matches?.fileName ?? [],
    )
    labels.append(fileName)
  }
  link.append(labels)

  if (workflow.disabled === true) {
    link.classList.add("disabled")
    link.append(element("span", "disabled-badge", "Disabled"))
  }

  return link
}

function sectionHeading(text: string): HTMLDivElement {
  return element("div", "section-heading", text)
}

function historyItemClearButton(label: string): HTMLButtonElement {
  const button = element("button", "history-item-clear", "×")
  button.type = "button"
  button.title = label
  button.setAttribute("aria-label", label)
  return button
}

function renderRecentQueries(
  parent: DocumentFragment,
  state: ExplorerRenderState,
): void {
  if (state.repositoryState.recentQueries.length === 0) {
    return
  }

  const section = element("section", "history-section")
  section.append(sectionHeading("Recent searches"))
  const chips = element("div", "query-chips")
  for (const recent of state.repositoryState.recentQueries) {
    const item = element("div", "query-history-item")
    const button = element("button", "query-chip", recent.query)
    button.type = "button"
    button.dataset.recentQuery = recent.query
    button.title = `Search for ${recent.query}`
    const clearButton = historyItemClearButton(
      `Remove ${recent.query} from recent searches`,
    )
    clearButton.dataset.removeRecentQuery = recent.query
    item.append(button, clearButton)
    chips.append(item)
  }
  section.append(chips)
  parent.append(section)
}

function renderRecentWorkflows(
  parent: DocumentFragment,
  state: ExplorerRenderState,
): void {
  if (state.repositoryState.recentWorkflows.length === 0) {
    return
  }

  const workflowsById = new Map(
    state.workflows.map((workflow) => [workflow.id, workflow]),
  )
  const section = element("section", "history-section")
  section.append(sectionHeading("Recently opened"))
  const list = element("div", "workflow-list recent-list")

  for (const recent of state.repositoryState.recentWorkflows) {
    const item = element("div", "recent-workflow-item")
    item.append(
      workflowLink(workflowsById.get(recent.id) ?? recent, state.currentPath, {
        compact: true,
      }),
    )
    const clearButton = historyItemClearButton(
      `Remove ${recent.name} from recently opened`,
    )
    clearButton.dataset.removeRecentWorkflow = recent.id
    item.append(clearButton)
    list.append(item)
  }

  section.append(list)
  parent.append(section)
}

function renderGroupedWorkflows(
  parent: DocumentFragment,
  state: ExplorerRenderState,
): void {
  const section = element("section", "workflows-section")
  section.append(sectionHeading("Workflows"))
  const list = element("div", "workflow-list")
  const collapsed = new Set(state.repositoryState.collapsedPrefixes)

  renderGroupedWorkflowItems(
    list,
    groupWorkflows(state.workflows),
    state,
    collapsed,
  )

  if (state.workflows.length === 0) {
    list.append(element("div", "empty-message", "No workflows found."))
  }

  section.append(list)
  parent.append(section)
}

function renderGroupedWorkflowItems(
  parent: HTMLElement,
  items: GroupedWorkflowItem[],
  state: ExplorerRenderState,
  collapsed: Set<string>,
): void {
  for (const item of items) {
    if (item.kind === "workflow") {
      parent.append(
        workflowLink(item.workflow, state.currentPath, {
          displayName: item.displayName,
        }),
      )
      continue
    }

    const isCollapsed = collapsed.has(item.key)
    const group = element("div", "workflow-group")
    const toggle = element("button", "group-toggle")
    toggle.type = "button"
    toggle.dataset.prefix = item.key
    toggle.setAttribute("aria-expanded", String(!isCollapsed))
    toggle.setAttribute("aria-label", `Toggle ${item.label} workflow group`)
    toggle.append(
      element("span", "chevron", isCollapsed ? "▸" : "▾"),
      element("span", "group-name", item.label),
      element("span", "group-count", String(item.workflows.length)),
    )
    group.append(toggle)

    if (!isCollapsed) {
      const children = element("div", "group-children")
      renderGroupedWorkflowItems(children, item.children, state, collapsed)
      group.append(children)
    }
    parent.append(group)
  }
}

function renderSearchResults(
  parent: DocumentFragment,
  state: ExplorerRenderState,
  query: string,
): number {
  const results = searchWorkflowResults(state.workflows, query)
  const section = element("section", "workflows-section")
  section.append(sectionHeading("Search results"))
  const list = element("div", "workflow-list")

  for (const result of results) {
    list.append(
      workflowLink(result.workflow, state.currentPath, {
        matches: result.matches,
      }),
    )
  }

  if (results.length === 0) {
    list.append(element("div", "empty-message", "No matching workflows."))
  }

  section.append(list)
  parent.append(section)
  return results.length
}

function renderError(parent: HTMLElement): void {
  const error = element("div", "error-message")
  error.append(
    element("strong", undefined, "Explorer unavailable"),
    element(
      "span",
      undefined,
      "GitHub's original workflow list is still available.",
    ),
  )
  const retry = element("button", "retry-button", "Retry")
  retry.type = "button"
  retry.dataset.action = "retry"
  error.append(retry)
  parent.replaceChildren(error)
}

export function createExplorerView(
  container: HTMLElement,
  handlers: ExplorerViewHandlers,
): ExplorerView {
  const root = element("div", "explorer")
  const header = element("div", "explorer-header")
  const titleGroup = element("div", "title-group")
  const title = element("strong", "explorer-title", "Explorer")
  const cacheBadge = element("span", "cache-badge")
  titleGroup.append(title, cacheBadge)
  const headerActions = element("div", "explorer-actions")
  const clearButton = element("button", "clear-button", "Clear history")
  clearButton.type = "button"
  clearButton.dataset.action = "clear-history"
  const displayModeButton = element("button", "display-mode-button")
  displayModeButton.type = "button"
  displayModeButton.dataset.action = "toggle-display-mode"
  headerActions.append(clearButton, displayModeButton)
  header.append(titleGroup, headerActions)

  const form = element("form", "search-form")
  const label = element("label", "visually-hidden", "Search workflows")
  const input = element("input", "search-input")
  input.type = "search"
  input.placeholder = "Search workflows…"
  input.autocomplete = "off"
  input.spellcheck = false
  input.setAttribute("aria-label", "Search workflows")
  form.append(label, input)

  const statusLine = element("div", "status-line")
  statusLine.setAttribute("aria-live", "polite")
  const content = element("div", "explorer-content")
  root.append(header, form, statusLine, content)
  container.replaceChildren(root)

  const onSubmit = (event: SubmitEvent): void => {
    event.preventDefault()
    handlers.onQuerySubmit(input.value)
  }
  const onInput = (): void => handlers.onQueryChange(input.value)
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && input.value.length > 0) {
      input.value = ""
      handlers.onQueryChange("")
    }
  }
  const onClick = (event: MouseEvent): void => {
    if (!(event.target instanceof Element)) {
      return
    }

    const target = event.target.closest<HTMLElement>(
      "[data-action], [data-recent-query], [data-remove-recent-query], [data-remove-recent-workflow], [data-prefix], [data-workflow-id]",
    )
    if (target === null) {
      return
    }

    const recentQueryToRemove = target.dataset.removeRecentQuery
    if (recentQueryToRemove !== undefined) {
      handlers.onRemoveRecentQuery(recentQueryToRemove)
      return
    }

    const recentWorkflowToRemove = target.dataset.removeRecentWorkflow
    if (recentWorkflowToRemove !== undefined) {
      handlers.onRemoveRecentWorkflow(recentWorkflowToRemove)
      return
    }

    const workflowId = target.dataset.workflowId
    if (workflowId !== undefined) {
      handlers.onOpenWorkflow(workflowId)
      return
    }

    const recentQuery = target.dataset.recentQuery
    if (recentQuery !== undefined) {
      handlers.onUseRecentQuery(recentQuery)
      return
    }

    const prefix = target.dataset.prefix
    if (prefix !== undefined) {
      handlers.onTogglePrefix(prefix)
      return
    }

    if (target.dataset.action === "clear-history") {
      handlers.onClearHistory()
    } else if (target.dataset.action === "toggle-display-mode") {
      handlers.onToggleDisplayMode()
    } else if (target.dataset.action === "retry") {
      handlers.onRetry()
    }
  }

  form.addEventListener("submit", onSubmit)
  input.addEventListener("input", onInput)
  input.addEventListener("keydown", onKeyDown)
  root.addEventListener("click", onClick)

  return {
    render(state) {
      const showingOriginal = state.displayMode === "original"
      root.setAttribute(
        "aria-label",
        `Workflow explorer for ${state.repositoryLabel}`,
      )
      root.classList.toggle("original-mode", showingOriginal)
      if (input.value !== state.query) {
        input.value = state.query
      }

      const hasHistory =
        state.repositoryState.recentQueries.length > 0 ||
        state.repositoryState.recentWorkflows.length > 0
      clearButton.hidden = !hasHistory || showingOriginal
      displayModeButton.textContent = showingOriginal ? "Explorer" : "Original"
      displayModeButton.title = showingOriginal
        ? "Show GitHub Actions Explorer"
        : "Show GitHub's original workflow list"
      displayModeButton.setAttribute("aria-label", displayModeButton.title)
      form.hidden = showingOriginal
      statusLine.hidden = showingOriginal
      content.hidden = showingOriginal

      if (showingOriginal) {
        cacheBadge.hidden = true
        return
      }

      input.disabled = state.status === "loading"

      if (state.cacheStatus === null) {
        cacheBadge.hidden = true
      } else {
        cacheBadge.hidden = false
        cacheBadge.textContent =
          state.cacheStatus === "stale" ? "Stale cache" : "Cached"
        cacheBadge.classList.toggle("stale", state.cacheStatus === "stale")
      }

      if (state.status === "loading") {
        statusLine.textContent = "Loading workflows…"
        const loading = element("div", "loading-message")
        loading.append(
          element("span", "spinner"),
          element("span", undefined, "Loading workflows…"),
        )
        content.replaceChildren(loading)
        return
      }

      if (state.status === "error") {
        statusLine.textContent = "Unable to load workflows"
        renderError(content)
        return
      }

      const query = normalizeQuery(state.query)
      const fragment = document.createDocumentFragment()

      if (state.cacheStatus === "stale") {
        const notice = element("div", "stale-notice")
        notice.append(
          element("span", undefined, "Showing cached workflows."),
          element(
            "button",
            "inline-retry",
            state.isRefreshing ? "Refreshing…" : "Refresh",
          ),
        )
        const retryButton = notice.querySelector("button")
        if (retryButton !== null) {
          retryButton.setAttribute("type", "button")
          retryButton.dataset.action = "retry"
          retryButton.toggleAttribute("disabled", state.isRefreshing)
        }
        fragment.append(notice)
      }

      if (query.length === 0) {
        statusLine.textContent = `${state.workflows.length} workflows`
        renderRecentQueries(fragment, state)
        renderRecentWorkflows(fragment, state)
        renderGroupedWorkflows(fragment, state)
      } else {
        const resultCount = renderSearchResults(fragment, state, query)
        statusLine.textContent = `${resultCount} of ${state.workflows.length} workflows`
      }

      content.replaceChildren(fragment)
    },
    dispose() {
      form.removeEventListener("submit", onSubmit)
      input.removeEventListener("input", onInput)
      input.removeEventListener("keydown", onKeyDown)
      root.removeEventListener("click", onClick)
      root.remove()
    },
  }
}
