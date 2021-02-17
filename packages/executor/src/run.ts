import { Operation } from './types'
import { createValidSchedule, executeSchedule } from './executor'
import { createScope } from './scope'
import { mapVertices } from './graph'
import { createTask } from './task'

interface RunConfig {
  name?: string
  operations: Operation[]
  // something something assignments

  monitor: unknown
}

export async function run({ name = 'run', operations, monitor }: RunConfig) {
  const { outline, resolvedValues, resolveAssignments } = createValidSchedule(
    operations,
    [],
  )

  const rootScope = createScope({ name, contents: resolvedValues })

  const executableSchedule = mapVertices(outline, vertex =>
    createTask({ vertex, scope: rootScope, monitor, resolveAssignments }),
  )

  await executeSchedule(executableSchedule)

  // TODO any sort of summarizing?
}
