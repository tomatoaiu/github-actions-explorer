import type { Workflow } from "./workflow"

export type WorkflowGroup = {
  kind: "group"
  key: string
  label: string
  workflows: Workflow[]
  children: GroupedWorkflowItem[]
}

export type UngroupedWorkflow = {
  kind: "workflow"
  workflow: Workflow
  displayName: string
}

export type GroupedWorkflowItem = WorkflowGroup | UngroupedWorkflow

export type WorkflowHierarchySegment = {
  key: string
  label: string
}

type WorkflowHierarchyEntry = {
  workflow: Workflow
  segments: WorkflowHierarchySegment[]
  source: "name" | "fileName" | null
}

const HIERARCHY_DELIMITER = /[-_/]/u
const HIERARCHY_DELIMITERS = /[-_/]+/u
const WORKFLOW_FILE_EXTENSION = /\.ya?ml$/iu
const HIERARCHY_COLLATOR = new Intl.Collator(undefined, {
  sensitivity: "base",
})

function normalizeSegment(segment: string): string {
  return segment.toLocaleLowerCase("en-US")
}

function hierarchyFromValue(
  value: string,
  removeFileExtension: boolean,
): WorkflowHierarchySegment[] | null {
  const hierarchyValue = removeFileExtension
    ? value.replace(WORKFLOW_FILE_EXTENSION, "")
    : value
  const delimiterIndex = hierarchyValue.search(HIERARCHY_DELIMITER)
  if (delimiterIndex <= 0) {
    return null
  }

  const labels = hierarchyValue
    .split(HIERARCHY_DELIMITERS)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
  if (labels.length < 2) {
    return null
  }

  return labels.map((label) => ({
    key: normalizeSegment(label),
    label,
  }))
}

export function getWorkflowHierarchy(
  workflow: Workflow,
): WorkflowHierarchySegment[] | null {
  return getWorkflowHierarchyDetails(workflow)?.segments ?? null
}

export function getWorkflowPrefix(
  workflow: Workflow,
): WorkflowHierarchySegment | null {
  return getWorkflowHierarchy(workflow)?.[0] ?? null
}

function getWorkflowHierarchyDetails(workflow: Workflow): {
  segments: WorkflowHierarchySegment[]
  source: "name" | "fileName"
} | null {
  const nameSegments = hierarchyFromValue(workflow.name, false)
  if (nameSegments !== null) {
    return { segments: nameSegments, source: "name" }
  }

  const fileNameSegments = hierarchyFromValue(workflow.fileName, true)
  return fileNameSegments === null
    ? null
    : { segments: fileNameSegments, source: "fileName" }
}

function workflowDisplayName(
  entry: WorkflowHierarchyEntry,
  ancestorCount: number,
): string {
  if (entry.source !== "name" || ancestorCount === 0) {
    return entry.workflow.name
  }

  let suffix = entry.workflow.name
  for (let index = 0; index < ancestorCount; index += 1) {
    const delimiter = HIERARCHY_DELIMITERS.exec(suffix)
    if (delimiter === null) {
      return entry.segments.at(-1)?.label ?? entry.workflow.name
    }
    suffix = suffix.slice(delimiter.index + delimiter[0].length)
  }

  return suffix.trim() || entry.segments.at(-1)?.label || entry.workflow.name
}

function compareGroupedItems(
  left: GroupedWorkflowItem,
  right: GroupedWorkflowItem,
): number {
  if (left.kind !== right.kind) {
    return left.kind === "group" ? -1 : 1
  }

  const leftLabel = left.kind === "group" ? left.label : left.displayName
  const rightLabel = right.kind === "group" ? right.label : right.displayName
  const labelOrder = HIERARCHY_COLLATOR.compare(leftLabel, rightLabel)
  if (labelOrder !== 0) {
    return labelOrder
  }

  if (left.kind === "group" && right.kind === "group") {
    return HIERARCHY_COLLATOR.compare(left.key, right.key)
  }
  if (left.kind === "workflow" && right.kind === "workflow") {
    return left.workflow.sourceOrder - right.workflow.sourceOrder
  }
  return 0
}

function compactGroupChain(group: WorkflowGroup): WorkflowGroup {
  const labels = [group.label]
  let lastGroup = group

  while (
    lastGroup.children.length === 1 &&
    lastGroup.children[0]?.kind === "group"
  ) {
    lastGroup = lastGroup.children[0]
    labels.push(lastGroup.label)
  }

  return {
    kind: "group",
    key: lastGroup.key,
    label: labels.join("/"),
    workflows: lastGroup.workflows,
    children: lastGroup.children.map((item) =>
      item.kind === "group" ? compactGroupChain(item) : item,
    ),
  }
}

function groupHierarchyLevel(
  entries: WorkflowHierarchyEntry[],
  depth: number,
  parentKeys: string[],
): GroupedWorkflowItem[] {
  const segmentCounts = new Map<string, number>()
  for (const entry of entries) {
    const segment = entry.segments[depth]
    if (segment !== undefined) {
      segmentCounts.set(segment.key, (segmentCounts.get(segment.key) ?? 0) + 1)
    }
  }

  const emittedGroups = new Set<string>()
  const items: GroupedWorkflowItem[] = []
  for (const entry of entries) {
    const segment = entry.segments[depth]
    if (segment === undefined || (segmentCounts.get(segment.key) ?? 0) < 2) {
      items.push({
        kind: "workflow",
        workflow: entry.workflow,
        displayName: workflowDisplayName(entry, depth),
      })
      continue
    }

    if (emittedGroups.has(segment.key)) {
      continue
    }

    emittedGroups.add(segment.key)
    const childEntries = entries.filter(
      (candidate) => candidate.segments[depth]?.key === segment.key,
    )
    const pathKeys = [...parentKeys, segment.key]
    items.push({
      kind: "group",
      key: pathKeys.join("/"),
      label: segment.label,
      workflows: childEntries.map((candidate) => candidate.workflow),
      children: groupHierarchyLevel(childEntries, depth + 1, pathKeys),
    })
  }

  return items.toSorted(compareGroupedItems)
}

export function groupWorkflows(workflows: Workflow[]): GroupedWorkflowItem[] {
  return groupHierarchyLevel(
    workflows.map((workflow) => {
      const hierarchy = getWorkflowHierarchyDetails(workflow)
      return {
        workflow,
        segments: hierarchy?.segments ?? [],
        source: hierarchy?.source ?? null,
      }
    }),
    0,
    [],
  ).map((item) => (item.kind === "group" ? compactGroupChain(item) : item))
}
