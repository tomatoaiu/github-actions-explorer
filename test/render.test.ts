import { afterEach, describe, expect, it, vi } from "vitest"

import { createEmptyRepositoryState } from "../src/storage/repository-state"
import { createExplorerView } from "../src/ui/render"
import type {
  ExplorerRenderState,
  ExplorerViewHandlers,
} from "../src/ui/render"
import { workflow } from "./helpers"

function handlers(): ExplorerViewHandlers {
  return {
    onQueryChange: vi.fn<ExplorerViewHandlers["onQueryChange"]>(),
    onQuerySubmit: vi.fn<ExplorerViewHandlers["onQuerySubmit"]>(),
    onUseRecentQuery: vi.fn<ExplorerViewHandlers["onUseRecentQuery"]>(),
    onOpenWorkflow: vi.fn<ExplorerViewHandlers["onOpenWorkflow"]>(),
    onRemoveRecentQuery: vi.fn<ExplorerViewHandlers["onRemoveRecentQuery"]>(),
    onRemoveRecentWorkflow:
      vi.fn<ExplorerViewHandlers["onRemoveRecentWorkflow"]>(),
    onToggleDisplayMode: vi.fn<ExplorerViewHandlers["onToggleDisplayMode"]>(),
    onTogglePrefix: vi.fn<ExplorerViewHandlers["onTogglePrefix"]>(),
    onClearHistory: vi.fn<ExplorerViewHandlers["onClearHistory"]>(),
    onRetry: vi.fn<ExplorerViewHandlers["onRetry"]>(),
  }
}

function readyState(): ExplorerRenderState {
  return {
    repositoryLabel: "octo/repo",
    currentPath: "/octo/repo/actions",
    query: "",
    status: "ready",
    cacheStatus: null,
    displayMode: "explorer",
    isRefreshing: false,
    workflows: [
      workflow("deploy-api", 0),
      workflow("deploy-frontend", 1),
      workflow("test", 2),
    ],
    repositoryState: {
      ...createEmptyRepositoryState(),
      recentQueries: [{ query: "deploy", usedAt: 1 }],
    },
  }
}

afterEach(() => {
  document.body.replaceChildren()
})

describe("createExplorerView", () => {
  it("renders recent searches and grouped workflows for an empty query", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const viewHandlers = handlers()
    const view = createExplorerView(container, viewHandlers)

    view.render(readyState())

    expect(container.querySelectorAll(".group-toggle")).toHaveLength(1)
    expect(container.querySelector(".query-chip")?.textContent).toBe("deploy")
    container.querySelector<HTMLButtonElement>(".query-chip")?.click()
    expect(viewHandlers.onUseRecentQuery).toHaveBeenCalledWith("deploy")
  })

  it("renders a compact two-way switch for the original GitHub list", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const viewHandlers = handlers()
    const view = createExplorerView(container, viewHandlers)

    view.render(readyState())

    const switchButton = container.querySelector<HTMLButtonElement>(
      ".display-mode-button",
    )
    expect(switchButton?.textContent).toBe("Original")
    switchButton?.click()
    expect(viewHandlers.onToggleDisplayMode).toHaveBeenCalledOnce()

    view.render({ ...readyState(), displayMode: "original" })

    expect(switchButton?.textContent).toBe("Explorer")
    expect(
      container.querySelector<HTMLFormElement>(".search-form")?.hidden,
    ).toBe(true)
    expect(
      container.querySelector<HTMLElement>(".explorer-content")?.hidden,
    ).toBe(true)
    expect(
      container.querySelector<HTMLButtonElement>(".clear-button")?.hidden,
    ).toBe(true)
  })

  it("removes individual recent searches and workflows", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const viewHandlers = handlers()
    const view = createExplorerView(container, viewHandlers)
    const state = readyState()

    view.render({
      ...state,
      repositoryState: {
        ...state.repositoryState,
        recentWorkflows: [
          {
            id: "1",
            name: "deploy-api",
            url: "/octo/repo/actions/workflows/deploy-api.yml",
            openedAt: 1,
          },
        ],
      },
    })

    container
      .querySelector<HTMLButtonElement>("[data-remove-recent-query]")
      ?.click()
    container
      .querySelector<HTMLButtonElement>("[data-remove-recent-workflow]")
      ?.click()

    expect(viewHandlers.onRemoveRecentQuery).toHaveBeenCalledWith("deploy")
    expect(viewHandlers.onRemoveRecentWorkflow).toHaveBeenCalledWith("1")
    expect(viewHandlers.onOpenWorkflow).not.toHaveBeenCalled()
  })

  it("uses a flat score-ordered list while searching", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const view = createExplorerView(container, handlers())

    view.render({ ...readyState(), query: "dply api" })

    expect(container.querySelector(".group-toggle")).toBeNull()
    expect(container.querySelector(".workflow-name")?.textContent).toBe(
      "deploy-api",
    )
    expect(container.querySelector(".query-chip")).toBeNull()
  })

  it("bolds only the matching parts of workflow and YAML names", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const view = createExplorerView(container, handlers())

    view.render({ ...readyState(), query: "api" })

    const name = container.querySelector(".workflow-name")
    const fileName = container.querySelector(".workflow-file")
    expect(name?.textContent).toBe("deploy-api")
    expect(name?.querySelector(".search-match")?.textContent).toBe("api")
    expect(fileName?.textContent).toBe("deploy-api.yml")
    expect(fileName?.querySelector(".search-match")?.textContent).toBe("api")
  })

  it("renders independently toggleable nested groups", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const viewHandlers = handlers()
    const view = createExplorerView(container, viewHandlers)
    const state = readyState()

    view.render({
      ...state,
      workflows: [
        workflow("deploy-api-prod", 0),
        workflow("deploy/api_staging", 1),
      ],
    })

    const toggles =
      container.querySelectorAll<HTMLButtonElement>(".group-toggle")
    expect(toggles).toHaveLength(1)
    expect(toggles[0]?.dataset.prefix).toBe("deploy/api")
    expect(toggles[0]?.querySelector(".group-name")?.textContent).toBe(
      "deploy/api",
    )
    expect(
      [...container.querySelectorAll(".workflow-name")].map(
        (element) => element.textContent,
      ),
    ).toEqual(["prod", "staging"])
    expect(
      [...container.querySelectorAll(".workflow-file")].map(
        (element) => element.textContent,
      ),
    ).toEqual(["deploy-api-prod.yml", "deploy/api_staging.yml"])
    toggles[0]?.click()
    expect(viewHandlers.onTogglePrefix).toHaveBeenCalledWith("deploy/api")
  })

  it("labels stale data and exposes a retry action", () => {
    const container = document.createElement("div")
    document.body.append(container)
    const viewHandlers = handlers()
    const view = createExplorerView(container, viewHandlers)

    view.render({ ...readyState(), cacheStatus: "stale" })

    expect(container.querySelector(".cache-badge")?.textContent).toBe(
      "Stale cache",
    )
    container.querySelector<HTMLButtonElement>(".inline-retry")?.click()
    expect(viewHandlers.onRetry).toHaveBeenCalledOnce()
  })
})
