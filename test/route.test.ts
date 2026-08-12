import { describe, expect, it } from "vitest"

import { parseGitHubActionsRoute } from "../src/github/route"

describe("parseGitHubActionsRoute", () => {
  it("extracts a repository from Actions routes", () => {
    expect(
      parseGitHubActionsRoute(
        "https://github.com/Octo/Repo/actions/workflows/deploy.yml",
      ),
    ).toMatchObject({
      repository: { owner: "Octo", repo: "Repo", key: "octo/repo" },
    })
  })

  it("accepts the Actions root", () => {
    expect(
      parseGitHubActionsRoute("https://github.com/octo/repo/actions"),
    ).not.toBeNull()
  })

  it.each([
    "https://github.com/octo/repo/issues",
    "https://example.com/octo/repo/actions",
    "http://github.com/octo/repo/actions",
  ])("rejects non-matching route %s", (url) => {
    expect(parseGitHubActionsRoute(url)).toBeNull()
  })
})
