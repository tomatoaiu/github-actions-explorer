// oxlint-disable-next-line import/no-unassigned-import -- WXT extracts this import into the Shadow Root stylesheet.
import "./style.css"

import { createShadowRootUi, defineContentScript } from "#imports"
import type { ShadowRootContentScriptUi } from "wxt/utils/content-script-ui/shadow-root"

import { parseGitHubActionsRoute } from "../../github/route"
import { findNativeWorkflowElementsToHide } from "../../github/native-workflow-list"
import { ExplorerController } from "../../ui/controller"
import type { ExplorerDisplayMode } from "../../ui/render"

type MountedExplorer = {
  dispose: () => void
}

type RouteSession = {
  abortController: AbortController
  ui: ShadowRootContentScriptUi<MountedExplorer> | null
}

class NativeWorkflowListGuard {
  readonly #root: Element
  readonly #observer: MutationObserver
  readonly #originalHidden = new Map<HTMLElement, HTMLElement["hidden"]>()
  #hidden = false

  constructor(root: Element) {
    this.#root = root
    this.#observer = new MutationObserver(() => this.#apply())
    this.#observer.observe(root, { childList: true, subtree: true })
  }

  setHidden(hidden: boolean): void {
    this.#hidden = hidden
    this.#apply()
  }

  dispose(): void {
    this.#observer.disconnect()
    this.#restore()
  }

  #apply(): void {
    if (!this.#hidden) {
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
    for (const [group, wasHidden] of this.#originalHidden) {
      group.hidden = wasHidden
    }
    this.#originalHidden.clear()
  }
}

export default defineContentScript({
  matches: ["https://github.com/*"],
  cssInjectionMode: "ui",
  runAt: "document_idle",

  main(ctx) {
    let displayMode: ExplorerDisplayMode = "explorer"
    let routeGeneration = 0
    let session: RouteSession | null = null

    const removeSession = (): void => {
      session?.abortController.abort()
      session?.ui?.remove()
      session = null
    }

    const handleRoute = async (url: URL): Promise<void> => {
      routeGeneration += 1
      const generation = routeGeneration
      removeSession()

      const route = parseGitHubActionsRoute(url)
      if (route === null) {
        return
      }

      const abortController = new AbortController()
      const nextSession: RouteSession = { abortController, ui: null }
      session = nextSession

      try {
        const ui = await createShadowRootUi<MountedExplorer>(ctx, {
          name: "github-actions-explorer",
          position: "inline",
          anchor: "actions-workflow-list",
          append: "first",
          isolateEvents: true,
          onMount(container, _shadow, shadowHost) {
            const anchor = shadowHost.parentElement
            const guard =
              anchor === null ? null : new NativeWorkflowListGuard(anchor)
            const controller = new ExplorerController({
              container,
              initialDisplayMode: displayMode,
              onDisplayModeChange(nextDisplayMode) {
                displayMode = nextDisplayMode
              },
              route,
              signal: abortController.signal,
              setNativeListHidden: (hidden) => guard?.setHidden(hidden),
            })
            controller.start()

            return {
              dispose() {
                controller.dispose()
                guard?.dispose()
              },
            }
          },
          onRemove(mounted) {
            mounted?.dispose()
          },
        })

        if (
          abortController.signal.aborted ||
          generation !== routeGeneration ||
          session !== nextSession
        ) {
          ui.remove()
          return
        }

        nextSession.ui = ui
        ui.autoMount()
      } catch {
        if (session === nextSession) {
          removeSession()
        }
      }
    }

    void handleRoute(new URL(window.location.href))
    ctx.addEventListener(window, "wxt:locationchange", ({ newUrl }) => {
      void handleRoute(newUrl)
    })
    ctx.onInvalidated(removeSession)
  },
})
