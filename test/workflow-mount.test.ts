import { afterEach, describe, expect, it, vi } from "vitest"

import { WORKFLOW_LIST_ANCHOR } from "../src/github/native-workflow-list"
import { observeWorkflowMount } from "../src/github/workflow-mount"

const cleanups: (() => void)[] = []
const flushMutations = () => new Promise((resolve) => setTimeout(resolve, 0))

function createUi() {
  const shadowHost = document.createElement("github-actions-explorer")
  const ui = {
    shadowHost,
    mount: vi.fn<() => void>(() => {
      document.querySelector(WORKFLOW_LIST_ANCHOR)!.prepend(shadowHost)
    }),
    remove: vi.fn<() => void>(() => shadowHost.remove()),
  }
  const stop = observeWorkflowMount(ui)
  cleanups.push(stop)
  return { ui, stop }
}

function createAnchor() {
  const nav = document.createElement("nav")
  nav.setAttribute("aria-label", "Actions workflows")
  return nav
}

afterEach(() => {
  for (const stop of cleanups.splice(0)) stop()
  document.body.replaceChildren()
})

describe("observeWorkflowMount", () => {
  it("mounts when the sidebar arrives and remounts after atomic React replacement", async () => {
    const { ui } = createUi()
    expect(ui.mount).not.toHaveBeenCalled()
    const anchor = createAnchor()
    document.body.append(anchor)
    await flushMutations()
    expect(ui.shadowHost.parentElement).toBe(anchor)

    const replacement = createAnchor()
    anchor.replaceWith(replacement)
    await flushMutations()
    expect(ui.shadowHost.parentElement).toBe(replacement)
    expect(ui.remove).toHaveBeenCalledOnce()
    expect(ui.mount).toHaveBeenCalledTimes(2)

    replacement.append(document.createElement("ul"))
    await flushMutations()
    expect(ui.mount).toHaveBeenCalledTimes(2)
    expect(document.querySelectorAll("github-actions-explorer")).toHaveLength(1)
  })

  it("recovers if hydration removes only the host", async () => {
    const anchor = createAnchor()
    document.body.append(anchor)
    const { ui } = createUi()
    anchor.replaceChildren(document.createElement("ul"))
    await flushMutations()
    expect(ui.shadowHost.parentElement).toBe(anchor)
    expect(ui.remove).toHaveBeenCalledOnce()
    expect(ui.mount).toHaveBeenCalledTimes(2)
  })

  it("unmounts when the anchor disappears and stops observing on route disposal", async () => {
    const anchor = createAnchor()
    document.body.append(anchor)
    const { ui, stop } = createUi()
    anchor.remove()
    await flushMutations()
    expect(ui.remove).toHaveBeenCalledOnce()
    expect(ui.shadowHost.isConnected).toBe(false)
    document.body.append(anchor)
    await flushMutations()
    expect(ui.mount).toHaveBeenCalledTimes(2)

    stop()
    ui.remove()
    document.body.replaceChildren(createAnchor())
    await flushMutations()
    expect(ui.mount).toHaveBeenCalledTimes(2)
    expect(ui.shadowHost.isConnected).toBe(false)
  })
})
