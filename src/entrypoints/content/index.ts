// oxlint-disable-next-line import/no-unassigned-import -- WXT extracts this import into the Shadow Root stylesheet.
import "./style.css"

import { createShadowRootUi, defineContentScript } from "#imports"
import type { ShadowRootContentScriptUi } from "wxt/utils/content-script-ui/shadow-root"

import { parseGitHubActionsRoute } from "../../github/route"
import {
  NativeWorkflowListGuard,
  WORKFLOW_LIST_ANCHOR,
} from "../../github/native-workflow-list"
import { observeWorkflowMount } from "../../github/workflow-mount"
import { ExplorerController } from "../../ui/controller"
import type { ExplorerDisplayMode } from "../../ui/render"

type MountedExplorer = {
  dispose: () => void
}

type RouteSession = {
  abortController: AbortController
  ui: ShadowRootContentScriptUi<MountedExplorer> | null
  stopObserving: (() => void) | null
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
      session?.stopObserving?.()
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
      const nextSession: RouteSession = {
        abortController,
        ui: null,
        stopObserving: null,
      }
      session = nextSession

      try {
        const ui = await createShadowRootUi<MountedExplorer>(ctx, {
          name: "github-actions-explorer",
          position: "inline",
          anchor: WORKFLOW_LIST_ANCHOR,
          append: "first",
          isolateEvents: true,
          onMount(container, _shadow, shadowHost) {
            const anchor = shadowHost.parentElement
            const guard =
              anchor === null
                ? null
                : new NativeWorkflowListGuard(anchor, shadowHost)
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
        nextSession.stopObserving = observeWorkflowMount(ui)
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
