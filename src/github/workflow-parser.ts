import type { Workflow } from "../domain/workflow"
import type { Repository } from "./route"

export class WorkflowParseError extends Error {
  override name = "WorkflowParseError"
}

export type ParsedWorkflowPage = {
  kind: "page"
  workflows: Workflow[]
}

export type ParsedWorkflowPageEnd = {
  kind: "end"
}

export type WorkflowPageResult = ParsedWorkflowPage | ParsedWorkflowPageEnd

type ParseWorkflowPageOptions = {
  repository: Repository
  sourceOrderStart?: number
}

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/gu, " ").trim() ?? ""
}

function decodeFileName(path: string): string {
  const lastSegment = path.split("/").at(-1)
  if (lastSegment === undefined || lastSegment.length === 0) {
    throw new WorkflowParseError("Workflow URL does not contain a file name")
  }

  try {
    return decodeURIComponent(lastSegment)
  } catch {
    throw new WorkflowParseError("Workflow URL contains invalid encoding")
  }
}

function parseWorkflowRow(
  row: Element,
  repository: Repository,
  sourceOrder: number,
): Workflow {
  const id = normalizeText(row.getAttribute("data-item-id"))
  const link = row.querySelector<HTMLAnchorElement>(
    'a[href*="/actions/workflows/"]',
  )
  const href = link?.getAttribute("href")
  const name = normalizeText(
    row.querySelector("tool-tip")?.textContent ??
      row.querySelector(".ActionListItem-label")?.textContent,
  )

  if (
    id.length === 0 ||
    href === null ||
    href === undefined ||
    name.length === 0
  ) {
    throw new WorkflowParseError("Workflow row is missing an id, name, or URL")
  }

  let workflowUrl: URL
  try {
    workflowUrl = new URL(href, "https://github.com")
  } catch {
    throw new WorkflowParseError("Workflow row contains an invalid URL")
  }

  if (workflowUrl.origin !== "https://github.com") {
    throw new WorkflowParseError("Workflow URL points outside GitHub")
  }

  const workflowMarker = "/actions/workflows/"
  const markerIndex = workflowUrl.pathname
    .toLocaleLowerCase("en-US")
    .indexOf(workflowMarker)
  const expectedRepositoryPath = `/${repository.owner}/${repository.repo}`
  const actualRepositoryPath = workflowUrl.pathname.slice(0, markerIndex)

  if (
    markerIndex < 0 ||
    actualRepositoryPath.toLocaleLowerCase("en-US") !==
      expectedRepositoryPath.toLocaleLowerCase("en-US")
  ) {
    throw new WorkflowParseError(
      "Workflow URL does not belong to the repository",
    )
  }

  const workflowPath = workflowUrl.pathname.slice(
    markerIndex + workflowMarker.length,
  )
  const mutedLabels = [...row.querySelectorAll(".color-fg-muted")].map(
    (element) => normalizeText(element.textContent),
  )
  const disabled =
    mutedLabels.some((label) => /^disabled$/iu.test(label)) ||
    row.matches('[aria-disabled="true"], [data-disabled="true"]') ||
    row.querySelector('[aria-disabled="true"], [data-disabled="true"]') !== null

  return {
    id,
    name,
    fileName: decodeFileName(workflowPath),
    url: `${workflowUrl.pathname}${workflowUrl.search}${workflowUrl.hash}`,
    disabled,
    sourceOrder,
  }
}

export function parseWorkflowPage(
  html: string,
  options: ParseWorkflowPageOptions,
): WorkflowPageResult {
  if (html.trim().length === 0) {
    return { kind: "end" }
  }

  const document = new DOMParser().parseFromString(html, "text/html")
  const rows = [
    ...document.querySelectorAll(
      '[data-test-selector="workflow-rendered"], li.actions-workflow-list-item',
    ),
  ]

  if (rows.length === 0) {
    throw new WorkflowParseError(
      "GitHub returned non-empty HTML without recognizable workflow rows",
    )
  }

  const sourceOrderStart = options.sourceOrderStart ?? 0
  return {
    kind: "page",
    workflows: rows.map((row, index) =>
      parseWorkflowRow(row, options.repository, sourceOrderStart + index),
    ),
  }
}
