import { WORKFLOW_LIST_ANCHOR } from "./native-workflow-list"

type WorkflowUi = {
  shadowHost: HTMLElement
  mount: () => void
  remove: () => void
}

export function observeWorkflowMount(ui: WorkflowUi): () => void {
  let mountedAnchor: Element | null = null

  const reconcile = (): void => {
    const anchor = document.querySelector(WORKFLOW_LIST_ANCHOR)
    if (anchor === mountedAnchor && ui.shadowHost.parentElement === anchor) {
      return
    }

    if (mountedAnchor !== null) {
      ui.remove()
      mountedAnchor = null
    }
    if (anchor !== null) {
      ui.mount()
      mountedAnchor = anchor
    }
  }

  // React can replace the anchor in one mutation batch without it ever being
  // absent. WXT autoMount observes existence, not identity or host removal.
  reconcile()
  const observer = new MutationObserver(reconcile)
  observer.observe(document, { childList: true, subtree: true })
  return () => observer.disconnect()
}
