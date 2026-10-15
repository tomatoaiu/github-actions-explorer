import { describe, expect, it } from "vitest"

import {
  findNativeWorkflowElementsToHide,
  WORKFLOW_LIST_ANCHOR,
} from "../src/github/native-workflow-list"

describe("findNativeWorkflowElementsToHide", () => {
  it("mounts inside the React workflow nav and hides only its native list", () => {
    const page = document.createElement("div")
    // Reduced from the React Actions sidebar; management is a separate nav.
    page.innerHTML = `
      <nav aria-label="Actions workflows" data-component="NavList">
        <ul data-component="ActionList" id="native-list">
          <li data-component="ActionList.Item"><a href="/octo/repo/actions">All workflows</a></li>
          <li data-component="ActionList.Group">
            <div data-component="GroupHeadingWrap"><h3>Workflows</h3></div>
            <ul><li data-component="ActionList.Item">
              <a href="/octo/repo/actions/workflows/ci.yml">CI</a>
            </li></ul>
          </li>
        </ul>
      </nav>
      <nav aria-label="Actions management"><ul id="management"><li>Runners</li></ul></nav>
    `
    const anchor = page.querySelector(WORKFLOW_LIST_ANCHOR)
    expect(anchor).not.toBeNull()
    if (anchor === null) throw new Error("Missing workflow anchor")

    const explorer = document.createElement("github-actions-explorer")
    anchor.prepend(explorer)
    const elements = findNativeWorkflowElementsToHide(anchor)
    expect([...elements].map((element) => element.id)).toEqual(["native-list"])
    for (const element of elements) element.hidden = true
    expect(explorer.closest("[hidden]")).toBeNull()
    expect(page.querySelector("#management")?.closest("[hidden]")).toBeNull()

    // React may replace the list during navigation; re-scan the current DOM.
    const list = anchor.querySelector("#native-list")!
    const replacement = list.cloneNode(true) as HTMLElement
    replacement.hidden = false
    list.replaceWith(replacement)
    expect(findNativeWorkflowElementsToHide(anchor)).toEqual(
      new Set([replacement]),
    )
  })

  it("still finds the legacy mount anchor", () => {
    const page = document.createElement("div")
    page.innerHTML = "<actions-workflow-list></actions-workflow-list>"
    expect(page.querySelector(WORKFLOW_LIST_ANCHOR)?.tagName).toBe(
      "ACTIONS-WORKFLOW-LIST",
    )
  })

  it("selects the All workflows row, its divider, and workflow container", () => {
    const root = document.createElement("actions-workflow-list")
    const list = document.createElement("ul")
    const allWorkflows = document.createElement("li")
    allWorkflows.id = "all"
    allWorkflows.dataset.itemId = "all_workflows"
    const allDivider = document.createElement("li")
    allDivider.id = "all-divider"
    allDivider.className = "ActionList-sectionDivider"
    allDivider.setAttribute("role", "presentation")
    const workflowContainer = document.createElement("li")
    workflowContainer.id = "workflow-container"
    const workflowGroup = document.createElement("nav-list-group")
    const workflow = document.createElement("li")
    workflow.dataset.testSelector = "workflow-rendered"
    workflowGroup.append(workflow)
    workflowContainer.append(workflowGroup)
    const managementDivider = document.createElement("li")
    managementDivider.id = "management-divider"
    managementDivider.className = "ActionList-sectionDivider"
    managementDivider.setAttribute("role", "presentation")
    const management = document.createElement("li")
    management.id = "management"
    list.append(
      allWorkflows,
      allDivider,
      workflowContainer,
      managementDivider,
      management,
    )
    root.append(list)

    const ids = [...findNativeWorkflowElementsToHide(root)].map(
      (element) => element.id,
    )

    expect(ids).toEqual(["workflow-container", "all", "all-divider"])
    expect(ids).not.toContain("management-divider")
    expect(ids).not.toContain("management")
  })

  it("leaves unrelated content untouched when GitHub markup is incomplete", () => {
    const root = document.createElement("actions-workflow-list")
    root.innerHTML = '<li id="management">Management</li>'

    expect(findNativeWorkflowElementsToHide(root)).toEqual(new Set())
  })
})
