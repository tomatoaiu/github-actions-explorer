import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import {
  parseWorkflowPage,
  WorkflowParseError,
} from "../src/github/workflow-parser"
import type { Repository } from "../src/github/route"

const repository: Repository = {
  owner: "octo",
  repo: "repo",
  key: "octo/repo",
}

function fixture(name: string): string {
  return readFileSync(resolve("test/fixtures", name), "utf8")
}

describe("parseWorkflowPage", () => {
  it("extracts workflow metadata from GitHub partial HTML", () => {
    const result = parseWorkflowPage(fixture("workflows-page-1.html"), {
      repository,
      sourceOrderStart: 7,
    })

    expect(result).toEqual({
      kind: "page",
      workflows: [
        {
          id: "101",
          name: "deploy-api",
          fileName: "deploy-api.yml",
          url: "/octo/repo/actions/workflows/deploy-api.yml",
          disabled: false,
          sourceOrder: 7,
        },
        {
          id: "102",
          name: "Deploy frontend",
          fileName: "deploy_frontend.yaml",
          url: "/octo/repo/actions/workflows/deploy_frontend.yaml",
          disabled: true,
          sourceOrder: 8,
        },
        {
          id: "103",
          name: "Copilot review",
          fileName: "copilot-review",
          url: "/octo/repo/actions/workflows/agents/copilot-review",
          disabled: false,
          sourceOrder: 9,
        },
      ],
    })
  })

  it("treats a whitespace-only page as the pagination end", () => {
    expect(
      parseWorkflowPage(fixture("workflows-empty.html"), { repository }),
    ).toEqual({ kind: "end" })
  })

  it("does not mistake unrecognized non-empty HTML for zero workflows", () => {
    expect(() =>
      parseWorkflowPage(fixture("workflows-malformed.html"), { repository }),
    ).toThrow(WorkflowParseError)
  })

  it("rejects workflow links for a different repository", () => {
    expect(() =>
      parseWorkflowPage(
        '<li data-test-selector="workflow-rendered" data-item-id="1"><tool-tip>Build</tool-tip><a href="/other/repo/actions/workflows/build.yml">Build</a></li>',
        { repository },
      ),
    ).toThrow(WorkflowParseError)
  })
})
