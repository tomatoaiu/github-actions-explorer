import { describe, expect, it } from "vitest"

import { findNativeWorkflowElementsToHide } from "../src/github/native-workflow-list"

describe("findNativeWorkflowElementsToHide", () => {
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
