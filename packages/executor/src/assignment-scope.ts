import {
  Operation,
  Evaluatable,
  ZipperProtocolCase,
  Executable,
  Scheduler,
} from '../lib'
import { zipperMap, createZipperProtocol } from './utils'

type Foo = Operation | Evaluatable

export interface AssignmentScope {
  applyAssignments(key: Foo): { foo: Foo; scopes: Set<AssignmentScope> }

  assignments: Map<Foo, { foo: Foo; scope: AssignmentScope }>

  fork(assignments: Iterable<[Foo, Foo]>): AssignmentScope
  resolve(foo: Foo): Foo
  hasParent(scope: null | AssignmentScope): boolean

  owningScopes: Map<Foo, AssignmentScope>
}

const executableZipperProtocolCase: ZipperProtocolCase<
  Foo,
  Executable,
  { isSiblingDep: boolean; prop: string }
> = {
  isMember(foo): foo is Executable {
    return foo.type === 'executable'
  },
  getChildren(executable) {
    const children = new Map()

    for (const [prop, child] of Object.entries(executable.dependencies)) {
      children.set({ isSiblingDep: false, prop }, child)
    }

    if (executable.siblings) {
      for (const [prop, child] of Object.entries(
        executable.siblings.dependencies,
      )) {
        children.set({ isSiblingDep: true, prop }, child)
      }
    }

    return children
  },
  reconstruct(executable, { isSiblingDep, prop }, dep) {
    if (isSiblingDep) {
      if (!executable.siblings) {
        throw new Error(
          'Internal Error: executable sibling dependence reconstruction called for executable with no sibling dependencies',
        )
      }

      return {
        ...executable,
        siblings: {
          ...executable.siblings,
          dependencies: {
            ...executable.siblings.dependencies,
            [prop]: dep,
          },
        },
      }
    }

    return {
      ...executable,
      dependencies: {
        ...executable.dependencies,
        [prop]: dep,
      },
    }
  },
}

// can also handle aggregators I imagine
const schedulerZipperProtocolCase: ZipperProtocolCase<
  Foo,
  Scheduler,
  string
> = {
  isMember(foo): foo is Scheduler {
    return foo.type === 'scheduler'
  },
  getChildren(scheduler) {
    return Object.entries(scheduler.dependencies)
  },
  reconstruct(scheduler, prop, dep) {
    return {
      ...scheduler,
      dependencies: {
        ...scheduler.dependencies,
        [prop]: dep,
      },
    }
  },
}

// const splitterZipperProtocolCase: ZipperProtocolCase<Foo, Scheduler, string> = {
//   isMember(foo): foo is Splitter {
//     return foo.type === 'splitter'
//   },
//   getChildren(splitter) {
//     return Object.entries(splitter.dependencies)
//   },
//   reconstruct(splitter, prop, dep) {
//     return {
//       ...splitter,
//       dependencies: {
//         ...splitter.dependencies,
//         [prop]: dep,
//       },
//     }
//   },
// }

const fooZipperProtocol = createZipperProtocol([
  executableZipperProtocolCase,
  schedulerZipperProtocolCase,
  // splitterZipperProtocolCase,
])

function memoizeByReference<T extends object, R>(fn: (t: T) => R) {
  const cache = new WeakMap()

  return (t: T) => {
    if (cache.has(t)) {
      return cache.get(t)
    }

    const result = fn(t)

    cache.set(t, result)

    return result
  }
}

const createScopedResolver = ({
  applyAssignments,
  resolve,
  owningScopes,
}: AssignmentScope) =>
  memoizeByReference((foo: Foo) => {
    const { foo: rawResolved, scopes } = applyAssignments(foo)

    const recursivelyResolved = zipperMap(
      fooZipperProtocol,
      rawResolved,
      resolve,
    )

    Array.from(fooZipperProtocol.getChildren(recursivelyResolved)).forEach(
      ([, child]) => {
        const owningScope = owningScopes.get(child)
        if (owningScope) {
          scopes.add(owningScope)
        }
      },
    )

    const mostSpecificScope = Array.from(scopes).reduce<null | AssignmentScope>(
      (acc, next) => {
        return next.hasParent(acc) ? next : acc
      },
      null,
    )

    if (mostSpecificScope) {
      if (mostSpecificScope.resolve === resolve) {
        owningScopes.set(recursivelyResolved, mostSpecificScope)
      } else {
        // recursive resolution merely made a clone of an existing resolved foo
        return mostSpecificScope.resolve(foo)
      }
    }

    return recursivelyResolved
  })

function _createAssignmentScope(
  rawAssignments: Iterable<[Foo, Foo]>,
  parent?: AssignmentScope,
) {
  const assignmentScope = {
    applyAssignments(foo) {
      let rawResolved = foo
      const scopes = new Set()

      while (assignmentScope.assignments.has(rawResolved)) {
        const { scope, foo: assignedFoo } = assignmentScope.assignments.get(
          rawResolved,
        )!
        rawResolved = assignedFoo
        scopes.add(scope)
      }

      return { foo: rawResolved, scopes }
    },
    fork(assignments: Iterable<[Foo, Foo]>) {
      return _createAssignmentScope(assignments, assignmentScope)
    },
    hasParent(scope: null | AssignmentScope) {
      if (scope === assignmentScope) {
        return true
      }

      if (scope === null) {
        return false
      }

      if (parent) {
        return parent.hasParent(scope)
      }

      return false
    },
  } as AssignmentScope

  const ownAssignments = Array.from(rawAssignments, ([key, value]): [
    Foo,
    { foo: Foo; scope: AssignmentScope },
  ] => [key, { foo: value, scope: assignmentScope }])

  assignmentScope.assignments = new Map(ownAssignments)

  if (parent) {
    parent.assignments.forEach((value, key) => {
      assignmentScope.assignments.set(key, value)
    })
  }

  assignmentScope.resolve = createScopedResolver(assignmentScope)

  assignmentScope.owningScopes = parent
    ? parent.owningScopes
    : new Map<Foo, AssignmentScope>()

  return assignmentScope
}

export function createAssignmentScope(assignments: Iterable<[Foo, Foo]>) {
  return _createAssignmentScope(assignments)
}
