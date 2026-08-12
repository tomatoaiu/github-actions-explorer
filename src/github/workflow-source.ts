import type { Workflow } from "../domain/workflow"
import type { Repository } from "./route"
import { parseWorkflowPage } from "./workflow-parser"

const MAX_PAGE_COUNT = 500

export class WorkflowSourceError extends Error {
  override name = "WorkflowSourceError"
}

export type FetchWorkflowsOptions = {
  repository: Repository
  signal: AbortSignal
  fetcher?: typeof fetch
  origin?: string
}

function workflowPageUrl(
  repository: Repository,
  page: number,
  origin: string,
): URL {
  const url = new URL(
    `/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/actions/workflows_partial`,
    origin,
  )
  url.searchParams.set("query", "")
  url.searchParams.set("page", String(page))
  return url
}

export async function fetchWorkflows({
  repository,
  signal,
  fetcher = fetch,
  origin = "https://github.com",
}: FetchWorkflowsOptions): Promise<Workflow[]> {
  const workflows: Workflow[] = []
  const workflowIds = new Set<string>()
  const pageSignatures = new Set<string>()

  for (let page = 1; page <= MAX_PAGE_COUNT; page += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Each response determines whether a next page exists.
    const response = await fetcher(workflowPageUrl(repository, page, origin), {
      credentials: "same-origin",
      headers: { Accept: "text/html" },
      signal,
    })

    if (!response.ok) {
      throw new WorkflowSourceError(
        `GitHub workflow request failed with status ${response.status}`,
      )
    }

    const contentType = response.headers.get("content-type")
    if (contentType !== null && !contentType.includes("text/html")) {
      throw new WorkflowSourceError(
        `GitHub workflow request returned ${contentType}`,
      )
    }

    // oxlint-disable-next-line no-await-in-loop -- The current page is parsed before requesting the next one.
    const result = parseWorkflowPage(await response.text(), {
      repository,
      sourceOrderStart: workflows.length,
    })

    if (result.kind === "end") {
      return workflows
    }

    const pageSignature = result.workflows
      .map((workflow) => workflow.id)
      .join("\u0000")
    if (pageSignatures.has(pageSignature)) {
      throw new WorkflowSourceError(
        "GitHub returned the same workflow page twice",
      )
    }
    pageSignatures.add(pageSignature)

    for (const workflow of result.workflows) {
      if (workflowIds.has(workflow.id)) {
        throw new WorkflowSourceError(
          `GitHub returned duplicate workflow id ${workflow.id}`,
        )
      }
      workflowIds.add(workflow.id)
      workflows.push(workflow)
    }
  }

  throw new WorkflowSourceError(
    `GitHub workflow pagination exceeded ${MAX_PAGE_COUNT} pages`,
  )
}
