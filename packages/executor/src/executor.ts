import {
  Assignment,
  Parameter,
  AssignmentResolver,
  Operation,
  MaybeExplicit,
  Task,
  Schedule,
  Evaluatable,
  Checkpoint,
} from './types'
import { createGraph, hasCycles } from './graph'
import { isNotNullish } from './utils'
// import { TreeMap, createTreeMap } from './tree-map'

interface Foo<T> {
  isMember(a: Checkpoint | Evaluatable): T
  isEqualTo(a: T, b: T): boolean
  deepCloneButNotCloneWhatIsThisOp(
    a: T,
    deepWhatever: <T>(childNode: T) => Checkpoint | Evaluatable,
  ): T
  // fork TODO remember that algorithm
}

// // TODO: foo === operation
// function _flattenAllDependencies(
//   operation: Operation | Evaluatable,
//   explicit: boolean,
//   allFoos: Map<Operation, MaybeExplicit<Operation>>,
// ) {
//   if (operation.type === 'value' || operation.type === 'parameter') {
//     return
//   }

//   if (allFoos.has(operation)) {
//     const bar = allFoos.get(operation)!
//     bar.explicit = bar.explicit || explicit
//     return
//   }

//   allFoos.set(operation, {
//     explicit,
//     type: operation.type,
//     foo: operation,
//   })

//   switch (operation.type) {
//     case 'executable': {
//       for (const dep of Object.values(operation.dependencies)) {
//         _flattenAllDependencies(dep, false, allFoos)
//       }
//       if (operation.siblingDependencies) {
//         // TODO collect sibling deps as well
//       }
//       break
//     }
//     case 'scheduler': {
//       for (const dep of Object.values(operation.dependencies)) {
//         _flattenAllDependencies(dep, false, allFoos)
//       }
//       break
//     }
//     case 'checkpoint': {
//       if (operation.dependencies) {
//         for (const dep of operation.dependencies) {
//           _flattenAllDependencies(dep, explicit, allFoos)
//         }
//       }

//       if (operation.assignments) {
//         for (const { value } of operation.assignments) {
//           _flattenAllDependencies(value, false, allFoos)
//         }
//       }

//       break
//     }
//   }
// }

// function flattenAllDependencies(
//   operations: (ExecutableDependency | Checkpoint)[],
//   assignments: Assignment[],
// ) {
//   const allOperations: Map<Operation, MaybeExplicit<Operation>> = new Map()

//   for (const operation of operations) {
//     _flattenAllDependencies(operation, true, allOperations)
//   }

//   for (const { value } of assignments) {
//     _flattenAllDependencies(value, false, allOperations)
//   }

//   return allOperations
// }

function deepClone(
  foo: Evaluatable | Operation,
  cloneChild: (
    foo: Evaluatable | Operation,
    explicit: boolean,
    eager: boolean,
  ) => Evaluatable | Operation,
  explicit: boolean,
  eager: boolean,
) {
  switch (foo.type) {
    case 'scheduler': {
      const clonedDeps = {}
      for (const [key, dep] of Object.entries(foo.dependencies)) {
        clonedDeps[key] = cloneChild(dep, false, eager)
      }
      return {
        ...foo,
        dependencies: clonedDeps,
      }
    }
    case 'executable': {
      const clonedDeps = {}
      for (const [key, dep] of Object.entries(foo.dependencies)) {
        clonedDeps[key] = cloneChild(dep, false, eager)
      }
      // if (foo.siblings) {
      //   for (const siblingDep of Object.values(foo.siblings.dependencies)) {
      //     cloneChild(siblingDep, false, false)
      //   }
      // }
      return {
        ...foo,
        dependencies: clonedDeps,
      }
    }
    case 'evocation': {
      return cloneChild(foo.value, true, eager)
    }
    case 'checkpoint': {
      return {
        ...foo,
        operations: foo.dependencies.map(dep => cloneChild(dep, true, eager)),
        assignments: [],
      }
    }
    default: {
      return { ...foo }
    }
  }
}

function memoizeByMap() {}

function createScopedDeepClone(
  assignments: TreeMap<Evaluatable | Operation, Evaluatable | Operation>,
  cache: Map<Evaluatable | Operation, Evaluatable | Operation>,
) {
  return function cloneChild(
    child: Evaluatable | Operation,
    explicit: boolean,
    eager: boolean,
  ) {
    if (cache.has(child)) {
      return cache.get(child)
    }

    let resolvedChild = child
    while (assignments.has(child)) {
      resolvedChild = assignments.getRequired(child)
    }

    if (resolvedChild.type === 'evocation') {
      return deepClone(
        resolvedChild.value,
        createScopedDeepClone(
          createTreeMap(resolvedChild.assignments, assignments),
          new Map(),
        ),
        explicit,
        eager,
      )
    }
  }
}

function createAssignmentResolver(
  operations: Map<Operation, MaybeExplicit<Operation>>,
  assignments: Assignment[],
): AssignmentResolver {
  const allAssignments: Assignment[] = assignments

  operations.forEach((_, foo) => {
    if (foo.type === 'checkpoint' && foo.assignments) {
      allAssignments.push(...foo.assignments)
    }
  })

  const assignmentMappings = new Map<Evaluatable, Evaluatable>()

  function resolveAssignments(foo: Evaluatable) {
    let resolvedFoo = foo
    // TODO prevent endless loop for assignment rings
    while (assignmentMappings.has(foo)) {
      resolvedFoo = assignmentMappings.get(foo)!
    }
    return (
      operations.get(resolvedFoo as Operation) || {
        explicit: false,
        type: resolvedFoo.type,
        foo: resolvedFoo,
      }
    )
  }

  for (const { target, value } of allAssignments) {
    const existingMapping = assignmentMappings.get(target)

    if (
      existingMapping &&
      resolveAssignments(existingMapping).foo !== resolveAssignments(value).foo
    ) {
      throw new Error('TODO conflicting assignments copy')
    }

    assignmentMappings.set(target, value)
  }

  return resolveAssignments
}

function createOutline(
  operations: Operation[],
  resolveAssignments: AssignmentResolver,
) {
  const unresolvedParameters: Parameter[] = []

  const resolvedValues: Map<Evaluatable, unknown> = new Map()

  const outline = createGraph<MaybeExplicit<Operation>>()

  function addToOutline(whatever: Operation | Parameter) {
    const resolved = resolveAssignments(whatever)

    if (outline.has(resolved as MaybeExplicit<Operation>))
      return resolved as MaybeExplicit<Operation>
    if (resolvedValues.has(resolved.foo as Evaluatable)) return null

    switch (resolved.type) {
      case 'value': {
        resolvedValues.set(resolved.foo, resolved.foo.value)
        return null
      }
      case 'parameter': {
        if (
          Object.prototype.hasOwnProperty.call(resolved.foo, 'defaultValue')
        ) {
          resolvedValues.set(resolved.foo, resolved.foo.defaultValue)
        } else {
          unresolvedParameters.push(resolved.foo)
        }
        return null
      }
      case 'executable': {
        const deps = Object.values(resolved.foo.dependencies)

        if (resolved.foo.siblingDependencies) {
          // TODO add the sibling deps to the list in consideration?
          // do a completely separate process?
        }

        outline.addVertex(resolved)
        deps
          .map(addToOutline)
          .filter(isNotNullish)
          .map(dependency => [dependency, resolved])
          .forEach(outline.addEdge)

        return resolved
      }
      case 'scheduler': {
        const deps = Object.values(resolved.foo.dependencies)

        outline.addVertex(resolved)
        deps
          .map(addToOutline)
          .filter(isNotNullish)
          .map(dependency => [dependency, resolved])
          .forEach(outline.addEdge)

        return resolved
      }
      case 'checkpoint': {
        const deps = resolved.foo.dependencies

        outline.addVertex(resolved)
        deps
          .map(addToOutline)
          .filter(isNotNullish)
          .map(dependency => [dependency, resolved])
          .forEach(outline.addEdge)

        return resolved
      }
    }
  }

  operations.forEach(addToOutline)

  return {
    outline,
    unresolvedParameters,
    resolvedValues,
  }
}

export function createValidSchedule(
  operations: Operation[],
  assignments: Assignment<unknown>[],
) {
  const allFoos = flattenAllDependencies(operations, assignments)

  const resolveAssignments = createAssignmentResolver(allFoos, assignments)

  const { outline, unresolvedParameters, resolvedValues } = createOutline(
    operations,
    resolveAssignments,
  )

  if (unresolvedParameters.length || hasCycles(outline)) {
    throw new Error('TODO validation copy')
  }

  return { outline, resolvedValues, resolveAssignments }
}

////////////////////////////////////////
// DOES NOT BELONG IN SAME FILE AS ABOVE
////////////////////////////////////////

const maxConcurrency = Infinity

export async function executeSchedule(graph: Schedule) {
  const executedVertices: Task[] = []
  const failedVertices: Map<Task, unknown> = new Map()
  const executableVertices = graph
    .vertices()
    .filter(vertex => !graph.hasParents(vertex))

  return new Promise(resolve => {
    let tasksRunning = 0

    async function runTask(task: Task) {
      tasksRunning += 1
      try {
        await task.execute(graph, task, task.scope)

        const children = graph.childrenOf(task)

        graph.removeVertex(task)

        for (const child of children) {
          if (!graph.hasParents(child)) {
            executableVertices.push(child)
          }
        }

        executedVertices.push(task)
      } catch (err) {
        failedVertices.set(task, err)
      } finally {
        tasksRunning -= 1

        propagateExecution()
      }
    }

    function propagateExecution() {
      while (executableVertices.length && tasksRunning < maxConcurrency) {
        runTask(executableVertices.pop()!)
      }

      if (tasksRunning === 0) {
        resolve({
          successful: graph.size() === 0 && failedVertices.size === 0,
          executed: executedVertices,
          failed: failedVertices,
          unexecuted: graph.vertices(),
          // skipped
        })
      }
    }

    propagateExecution()
  })
}
