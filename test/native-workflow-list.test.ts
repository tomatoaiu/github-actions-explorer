import { afterEach, describe, expect, it } from "vitest"

import {
  COLLAPSED_HOST_ATTRIBUTE,
  findNativeWorkflowElementsToHide,
  isSidebarCollapsed,
  NativeWorkflowListGuard,
  WORKFLOW_LIST_ANCHOR,
} from "../src/github/native-workflow-list"

const flushMutations = () => new Promise((resolve) => setTimeout(resolve, 0))

function createActionsSidebar(): HTMLElement {
  const page = document.createElement("div")
  // Reduced from the Primer Sidebar on github.com Actions pages (2026-11).
  page.innerHTML = `
    <aside aria-label="Actions" data-expanded="true">
      <div data-component="Sidebar">
        <nav aria-label="Workflows" data-component="Sidebar.Main">
          <div data-component="Sidebar.Section" id="all-workflows">
            <div data-component="Sidebar.Item">
              <a href="/octo/repo/actions" aria-current="page">All workflows</a>
            </div>
          </div>
          <div data-component="Sidebar.Section" id="workflows">
            <div data-component="Sidebar.SectionGroup">
              <h2 data-component="Heading">Workflows</h2>
              <div data-component="Sidebar.DisclosurePanel">
                <div data-component="Sidebar.Item">
                  <a href="/octo/repo/actions/workflows/ci.yml">CI</a>
                </div>
                <button data-component="Button">Show more</button>
              </div>
            </div>
          </div>
        </nav>
      </div>
      <div data-component="Sidebar.Footer">
        <nav aria-label="Management" data-component="Sidebar.Main">
          <div data-component="Sidebar.Section" id="management">
            <a href="/octo/repo/actions/caches">Caches</a>
          </div>
        </nav>
      </div>
    </aside>
  `
  return page
}

describe("findNativeWorkflowElementsToHide", () => {
  it("mounts inside the workflow nav and hides only its native sections", () => {
    const page = createActionsSidebar()
    const anchor = page.querySelector(WORKFLOW_LIST_ANCHOR)
    expect(anchor?.getAttribute("aria-label")).toBe("Workflows")
    if (anchor === null) throw new Error("Missing workflow anchor")

    const explorer = document.createElement("github-actions-explorer")
    anchor.prepend(explorer)
    const elements = findNativeWorkflowElementsToHide(anchor)
    expect([...elements].map((element) => element.id)).toEqual([
      "all-workflows",
      "workflows",
    ])
    for (const element of elements) element.hidden = true
    expect(explorer.closest("[hidden]")).toBeNull()
    expect(page.querySelector("#management")?.closest("[hidden]")).toBeNull()

    // React may replace a section during navigation; re-scan the current DOM.
    const section = anchor.querySelector("#workflows")!
    const replacement = section.cloneNode(true) as HTMLElement
    replacement.hidden = false
    section.replaceWith(replacement)
    expect(findNativeWorkflowElementsToHide(anchor)).toEqual(
      new Set([anchor.querySelector("#all-workflows")!, replacement]),
    )
  })

  it("does not mount inside the management nav", () => {
    const page = createActionsSidebar()
    page.querySelector('nav[aria-label="Workflows"]')?.remove()

    expect(page.querySelector(WORKFLOW_LIST_ANCHOR)).toBeNull()
  })

  it("leaves unrelated content untouched when GitHub markup is incomplete", () => {
    const root = document.createElement("nav")
    root.innerHTML = '<div id="unknown">Workflows</div>'

    expect(findNativeWorkflowElementsToHide(root)).toEqual(new Set())
  })
})

describe("NativeWorkflowListGuard", () => {
  const guards: NativeWorkflowListGuard[] = []

  afterEach(() => {
    for (const guard of guards.splice(0)) guard.dispose()
    document.body.replaceChildren()
  })

  function mountGuard() {
    document.body.append(createActionsSidebar())
    const anchor = document.querySelector(WORKFLOW_LIST_ANCHOR)!
    const shadowHost = document.createElement("github-actions-explorer")
    anchor.prepend(shadowHost)
    const guard = new NativeWorkflowListGuard(anchor, shadowHost)
    guards.push(guard)
    const aside = document.querySelector("aside")!
    const hiddenSectionIds = () =>
      [...anchor.querySelectorAll<HTMLElement>("[data-component]")]
        .filter((element) => element.hidden)
        .map((element) => element.id)
    return { guard, shadowHost, aside, hiddenSectionIds }
  }

  it("hides native sections only while Explorer is shown", () => {
    const { guard, shadowHost, hiddenSectionIds } = mountGuard()
    expect(hiddenSectionIds()).toEqual([])

    guard.setHidden(true)
    expect(hiddenSectionIds()).toEqual(["all-workflows", "workflows"])
    expect(shadowHost.hasAttribute(COLLAPSED_HOST_ATTRIBUTE)).toBe(false)

    guard.setHidden(false)
    expect(hiddenSectionIds()).toEqual([])
  })

  it("shows GitHub's icon-only sections while the sidebar is collapsed", async () => {
    const { guard, shadowHost, aside, hiddenSectionIds } = mountGuard()
    guard.setHidden(true)

    aside.dataset.expanded = "false"
    await flushMutations()
    expect(isSidebarCollapsed(shadowHost)).toBe(true)
    expect(shadowHost.hasAttribute(COLLAPSED_HOST_ATTRIBUTE)).toBe(true)
    expect(hiddenSectionIds()).toEqual([])

    aside.dataset.expanded = "true"
    await flushMutations()
    expect(shadowHost.hasAttribute(COLLAPSED_HOST_ATTRIBUTE)).toBe(false)
    expect(hiddenSectionIds()).toEqual(["all-workflows", "workflows"])
  })

  it("starts collapsed and restores the page on dispose", () => {
    document.body.append(createActionsSidebar())
    document.querySelector("aside")!.dataset.expanded = "false"
    const anchor = document.querySelector(WORKFLOW_LIST_ANCHOR)!
    const shadowHost = document.createElement("github-actions-explorer")
    anchor.prepend(shadowHost)
    const guard = new NativeWorkflowListGuard(anchor, shadowHost)
    expect(shadowHost.hasAttribute(COLLAPSED_HOST_ATTRIBUTE)).toBe(true)

    document.querySelector("aside")!.dataset.expanded = "true"
    guard.setHidden(true)
    guard.dispose()
    expect(shadowHost.hasAttribute(COLLAPSED_HOST_ATTRIBUTE)).toBe(false)
    expect(anchor.querySelector("[hidden]")).toBeNull()
  })
})
