import {
  ExecutableContext,
  ExecutableDependencies,
  TaskConfig,
  Schedule,
  Task,
  Scope,
  Async,
  Operation,
  AssignmentResolver,
} from './types'

export interface TaskExecutionInput {
  schedule: Schedule
  task: Task
  scope: Scope
}

export interface TaskExecution {
  (input: TaskExecutionInput): Async<void>
}

interface TaskExecuteFunctionConfig {
  explicit: boolean
  operation: Operation
  resolveAssignments: AssignmentResolver
  monitor: unknown
}

function createTaskExecuteFunction({
  explicit,
  operation,
  resolveAssignments,
  monitor,
}: TaskExecuteFunctionConfig): TaskExecution {
  switch (operation.type) {
    case 'checkpoint': {
      return function execute({ scope }: TaskExecutionInput) {
        monitor.markCheckpoint(scope.name, operation.name, explicit)
      }
    }
    case 'executable': {
      return async function execute({ scope }: TaskExecutionInput) {
        const resolvedDependencies: ExecutableContext<
          ExecutableDependencies
        > = {}

        for (const [prop, dependency] of Object.entries(
          operation.dependencies,
        )) {
          // TODO some validation might be nice
          resolvedDependencies[prop] = scope.get(resolveAssignments(dependency))
        }

        // TODO which level should error handling happen at?
        const result = await operation.execute(resolvedDependencies, {}, [])

        scope.set(operation, result)
      }
    }
    case 'scheduler': {
      return async function execute({
        schedule,
        task,
        scope,
      }: TaskExecutionInput) {
        const resolvedDependencies: ExecutableContext<
          ExecutableDependencies
        > = {}

        for (const [prop, dependency] of Object.entries(
          operation.dependencies,
        )) {
          resolvedDependencies[prop] = scope.get(resolveAssignments(dependency))
        }

        // TODO which level should error handling happen at?
        const forks = await operation.execute(resolvedDependencies, {}, [])

        // TODO make the forks
      }
    }
  }
}

export function createTask({
  vertex,
  resolveAssignments,
  scope,
  monitor,
}: TaskConfig) {
  const { explicit, foo: operation } = vertex

  const execute = createTaskExecuteFunction({
    explicit,
    operation,
    resolveAssignments,
    monitor,
  })

  return {
    scope,
    execute,
  }
}
