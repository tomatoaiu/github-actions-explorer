import * as v from "valibot"

const nonNegativeIntegerSchema = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(0),
)

export const githubPathSchema = v.pipe(
  v.string(),
  v.nonEmpty(),
  v.regex(/^\/(?!\/)/),
)

export const workflowSchema = v.strictObject({
  id: v.pipe(v.string(), v.nonEmpty()),
  name: v.pipe(v.string(), v.nonEmpty()),
  fileName: v.pipe(v.string(), v.nonEmpty()),
  url: githubPathSchema,
  disabled: v.boolean(),
  sourceOrder: nonNegativeIntegerSchema,
})

export type Workflow = v.InferOutput<typeof workflowSchema>

export function compareBySourceOrder(left: Workflow, right: Workflow): number {
  return left.sourceOrder - right.sourceOrder
}
