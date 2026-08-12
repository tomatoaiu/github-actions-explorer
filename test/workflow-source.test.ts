import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it, vi } from "vitest"

import type { Repository } from "../src/github/route"
import {
  fetchWorkflows,
  WorkflowSourceError,
} from "../src/github/workflow-source"

const repository: Repository = {
  owner: "octo",
  repo: "repo",
  key: "octo/repo",
}
const page = readFileSync(
  resolve("test/fixtures/workflows-page-1.html"),
  "utf8",
)

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  })
}

describe("fetchWorkflows", () => {
  it("fetches pages until GitHub returns an empty partial", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(htmlResponse(page))
      .mockResolvedValueOnce(htmlResponse(""))

    const workflows = await fetchWorkflows({
      repository,
      signal: new AbortController().signal,
      fetcher,
    })

    expect(workflows).toHaveLength(3)
    expect(workflows.map((workflow) => workflow.sourceOrder)).toEqual([0, 1, 2])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "/octo/repo/actions/workflows_partial?query=&page=1",
    )
  })

  it("throws when GitHub returns an HTTP error", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(htmlResponse("", 500))

    await expect(
      fetchWorkflows({
        repository,
        signal: new AbortController().signal,
        fetcher,
      }),
    ).rejects.toThrow(WorkflowSourceError)
  })

  it("throws instead of silently truncating a repeated page", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => htmlResponse(page))

    await expect(
      fetchWorkflows({
        repository,
        signal: new AbortController().signal,
        fetcher,
      }),
    ).rejects.toThrow("same workflow page twice")
  })
})
