import { describe, expect, it } from "vitest"

import {
  getWorkflowHierarchy,
  getWorkflowPrefix,
  groupWorkflows,
} from "../src/domain/grouping"
import { workflow } from "./helpers"

describe("getWorkflowHierarchy", () => {
  it("splits mixed -, _, and / separators into hierarchy segments", () => {
    const item = workflow("Release/API_prod", 0, "deploy_prod.yml")

    expect(getWorkflowHierarchy(item)).toEqual([
      { key: "release", label: "Release" },
      { key: "api", label: "API" },
      { key: "prod", label: "prod" },
    ])
  })

  it("prefers the display name over the file name", () => {
    const item = workflow("release-prod", 0, "deploy_api_prod.yml")

    expect(getWorkflowHierarchy(item)).toEqual([
      { key: "release", label: "release" },
      { key: "prod", label: "prod" },
    ])
  })

  it("falls back to the extension-free file name", () => {
    const item = workflow("Deploy API", 0, "deploy_api_prod.yml")

    expect(getWorkflowHierarchy(item)).toEqual([
      { key: "deploy", label: "deploy" },
      { key: "api", label: "api" },
      { key: "prod", label: "prod" },
    ])
  })

  it("does not skip a leading delimiter in the display name", () => {
    const item = workflow("-deploy_api", 0, "fallback_build.yml")

    expect(getWorkflowPrefix(item)).toEqual({
      key: "fallback",
      label: "fallback",
    })
  })
})

describe("groupWorkflows", () => {
  it("groups matching prefixes", () => {
    const items = [
      workflow("deploy-api", 0),
      workflow("deploy-frontend", 1),
      workflow("test", 2),
      workflow("deploy_worker", 3),
    ]

    const result = groupWorkflows(items)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      kind: "group",
      key: "deploy",
      label: "deploy",
      workflows: [items[0], items[1], items[3]],
      children: [
        { kind: "workflow", workflow: items[0], displayName: "api" },
        {
          kind: "workflow",
          workflow: items[1],
          displayName: "frontend",
        },
        { kind: "workflow", workflow: items[3], displayName: "worker" },
      ],
    })
    expect(result[1]).toEqual({
      kind: "workflow",
      workflow: items[2],
      displayName: "test",
    })
  })

  it("recursively groups every shared hierarchy level", () => {
    const items = [
      workflow("deploy-api-prod", 0),
      workflow("deploy/api_staging", 1),
      workflow("deploy-web-prod", 2),
      workflow("deploy_web_staging", 3),
      workflow("test", 4),
    ]

    const result = groupWorkflows(items)
    const deploy = result[0]

    expect(deploy).toMatchObject({
      kind: "group",
      key: "deploy",
      label: "deploy",
    })
    if (deploy?.kind !== "group") {
      throw new TypeError("Expected the first item to be a deploy group")
    }
    expect(deploy.children).toHaveLength(2)
    expect(deploy.children[0]).toMatchObject({
      kind: "group",
      key: "deploy/api",
      label: "api",
      workflows: [items[0], items[1]],
    })
    expect(deploy.children[1]).toMatchObject({
      kind: "group",
      key: "deploy/web",
      label: "web",
      workflows: [items[2], items[3]],
    })
    expect(result[1]).toEqual({
      kind: "workflow",
      workflow: items[4],
      displayName: "test",
    })
  })

  it("sorts groups before workflows and alphabetizes both at every level", () => {
    const result = groupWorkflows([
      workflow("zeta", 0),
      workflow("deploy-zeta", 1),
      workflow("tools-zebra", 2),
      workflow("deploy-web-staging", 3),
      workflow("alpha", 4),
      workflow("tools-alpha", 5),
      workflow("deploy-api-prod", 6),
      workflow("deploy-web-prod", 7),
      workflow("deploy-api-staging", 8),
      workflow("deploy-alpha", 9),
    ])

    expect(
      result.map((item) =>
        item.kind === "group"
          ? `group:${item.label}`
          : `workflow:${item.displayName}`,
      ),
    ).toEqual([
      "group:deploy",
      "group:tools",
      "workflow:alpha",
      "workflow:zeta",
    ])

    const deploy = result[0]
    if (deploy?.kind !== "group") {
      throw new TypeError("Expected the first item to be a deploy group")
    }
    expect(
      deploy.children.map((item) =>
        item.kind === "group"
          ? `group:${item.label}`
          : `workflow:${item.displayName}`,
      ),
    ).toEqual(["group:api", "group:web", "workflow:alpha", "workflow:zeta"])
  })

  it("groups a workflow and deeper descendants under their shared path", () => {
    const items = [workflow("deploy-api", 0), workflow("deploy/api-prod", 1)]

    const result = groupWorkflows(items)
    const deploy = result[0]
    expect(deploy).toMatchObject({
      kind: "group",
      key: "deploy/api",
      label: "deploy/api",
    })
    if (deploy?.kind !== "group") {
      throw new TypeError("Expected a deploy group")
    }
    expect(deploy.workflows).toEqual(items)
  })

  it("compares every hierarchy segment case-insensitively", () => {
    const result = groupWorkflows([
      workflow("Deploy-API-prod", 0),
      workflow("deploy/api_staging", 1),
    ])
    const deploy = result[0]

    expect(deploy).toMatchObject({
      kind: "group",
      key: "deploy/api",
      label: "Deploy/API",
    })
    if (deploy?.kind !== "group") {
      throw new TypeError("Expected a deploy group")
    }
  })

  it("removes all visible ancestor prefixes from grouped workflow names", () => {
    const items = [
      workflow("deploy-api-prod", 0),
      workflow("deploy/api_staging", 1),
    ]
    const api = groupWorkflows(items)[0]
    if (api?.kind !== "group") {
      throw new TypeError("Expected a deploy/api group")
    }

    expect(api.label).toBe("deploy/api")
    expect(api.children).toEqual([
      { kind: "workflow", workflow: items[0], displayName: "prod" },
      { kind: "workflow", workflow: items[1], displayName: "staging" },
    ])
  })

  it("keeps display names when hierarchy comes from YAML file names", () => {
    const items = [
      workflow("Production API", 0, "deploy_api_prod.yml"),
      workflow("Staging API", 1, "deploy_api_staging.yml"),
    ]
    const api = groupWorkflows(items)[0]
    if (api?.kind !== "group") {
      throw new TypeError("Expected a deploy/api group")
    }

    expect(api.label).toBe("deploy/api")
    expect(api.children).toEqual([
      {
        kind: "workflow",
        workflow: items[0],
        displayName: "Production API",
      },
      {
        kind: "workflow",
        workflow: items[1],
        displayName: "Staging API",
      },
    ])
  })

  it("leaves a hierarchy ungrouped when it occurs only once", () => {
    const only = workflow("deploy-api-prod", 0)

    expect(groupWorkflows([only])).toEqual([
      { kind: "workflow", workflow: only, displayName: "deploy-api-prod" },
    ])
  })

  it("compacts consecutive empty intermediate groups into one toggle", () => {
    const result = groupWorkflows([
      workflow("path/to/report/daily", 0),
      workflow("path/to/report/monthly", 1),
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      kind: "group",
      key: "path/to/report",
      label: "path/to/report",
      children: [
        { kind: "workflow", displayName: "daily" },
        { kind: "workflow", displayName: "monthly" },
      ],
    })
  })
})
