const WORKFLOW_ITEM_SELECTOR =
  '[data-test-selector="workflow-rendered"], li.actions-workflow-list-item'
const ALL_WORKFLOWS_SELECTOR = '[data-item-id="all_workflows"]'
const SECTION_DIVIDER_SELECTOR =
  'li.ActionList-sectionDivider[role="presentation"]'

export function findNativeWorkflowElementsToHide(
  root: Element,
): Set<HTMLElement> {
  const elements = new Set<HTMLElement>()
  const workflowItems = root.querySelectorAll(WORKFLOW_ITEM_SELECTOR)

  for (const item of workflowItems) {
    const group = item.closest<HTMLElement>("nav-list-group")
    if (group === null) {
      continue
    }
    elements.add(group.closest<HTMLElement>("li") ?? group)
  }

  const allWorkflows = root.querySelector<HTMLElement>(ALL_WORKFLOWS_SELECTOR)
  if (allWorkflows === null) {
    return elements
  }

  elements.add(allWorkflows)
  const divider = allWorkflows.nextElementSibling
  if (
    divider instanceof HTMLElement &&
    divider.matches(SECTION_DIVIDER_SELECTOR)
  ) {
    elements.add(divider)
  }

  return elements
}
