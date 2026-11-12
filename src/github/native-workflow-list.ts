export const WORKFLOW_LIST_ANCHOR =
  'nav[data-component="Sidebar.Main"][aria-label="Workflows"]'

const NATIVE_SECTION_SELECTOR = ':scope > [data-component="Sidebar.Section"]'
const SIDEBAR_EXPANDED_ATTRIBUTE = "data-expanded"
const SIDEBAR_SELECTOR = `aside[${SIDEBAR_EXPANDED_ATTRIBUTE}]`
export const COLLAPSED_HOST_ATTRIBUTE = "data-sidebar-collapsed"

export function findNativeWorkflowElementsToHide(
  root: Element,
): Set<HTMLElement> {
  // Keep the nav (and our shadow host) visible; management has its own nav.
  return new Set(root.querySelectorAll<HTMLElement>(NATIVE_SECTION_SELECTOR))
}

export function isSidebarCollapsed(root: Element): boolean {
  return (
    root.closest(SIDEBAR_SELECTOR)?.getAttribute(SIDEBAR_EXPANDED_ATTRIBUTE) ===
    "false"
  )
}

/**
 * Hides GitHub's workflow sections while Explorer is shown. A collapsed
 * sidebar is too narrow for Explorer, so it keeps GitHub's icon-only sections
 * and hides the shadow host instead.
 */
export class NativeWorkflowListGuard {
  readonly #root: Element
  readonly #shadowHost: HTMLElement
  readonly #observer: MutationObserver
  readonly #originalHidden = new Map<HTMLElement, HTMLElement["hidden"]>()
  #hidden = false

  constructor(root: Element, shadowHost: HTMLElement) {
    this.#root = root
    this.#shadowHost = shadowHost
    this.#observer = new MutationObserver(() => this.#apply())
    this.#observer.observe(root, { childList: true, subtree: true })
    const sidebar = root.closest(SIDEBAR_SELECTOR)
    if (sidebar !== null) {
      this.#observer.observe(sidebar, {
        attributes: true,
        attributeFilter: [SIDEBAR_EXPANDED_ATTRIBUTE],
      })
    }
    this.#apply()
  }

  setHidden(hidden: boolean): void {
    this.#hidden = hidden
    this.#apply()
  }

  dispose(): void {
    this.#observer.disconnect()
    this.#shadowHost.removeAttribute(COLLAPSED_HOST_ATTRIBUTE)
    this.#restore()
  }

  #apply(): void {
    const collapsed = isSidebarCollapsed(this.#root)
    this.#shadowHost.toggleAttribute(COLLAPSED_HOST_ATTRIBUTE, collapsed)
    if (!this.#hidden || collapsed) {
      this.#restore()
      return
    }

    for (const element of findNativeWorkflowElementsToHide(this.#root)) {
      if (!this.#originalHidden.has(element)) {
        this.#originalHidden.set(element, element.hidden)
      }
      element.hidden = true
    }
  }

  #restore(): void {
    for (const [element, wasHidden] of this.#originalHidden) {
      element.hidden = wasHidden
    }
    this.#originalHidden.clear()
  }
}
