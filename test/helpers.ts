import type { Workflow } from "../src/domain/workflow"

export function workflow(
  name: string,
  sourceOrder: number,
  fileName = `${name}.yml`,
): Workflow {
  return {
    id: String(sourceOrder + 1),
    name,
    fileName,
    url: `/octo/repo/actions/workflows/${encodeURIComponent(fileName)}`,
    disabled: false,
    sourceOrder,
  }
}
