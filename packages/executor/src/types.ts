import { TaskExecution } from './task'

export type ExecutableDependency<T = any> =
  | Executable<T, ExecutableDependencies, ExecutableDependencies>
  | Scheduler<T, ExecutableDependencies>
  | Parameter<T>

export type ExecutableDependencies = {
  [key: string]: Evaluatable<any>
}

export type ExecutableContext<Deps extends ExecutableDependencies> = {
  [K in keyof Deps]: Deps[K] extends Executable<infer T, any, any> ? T : never
}

export type Async<T> = T | Promise<T> | PromiseLike<T>

export interface Executable<
  T = unknown,
  Deps extends ExecutableDependencies = ExecutableDependencies,
  SiblingDeps extends ExecutableDependencies = ExecutableDependencies
> {
  type: 'executable'

  name: string

  dependencies: Deps

  siblings?: {
    dependencies: SiblingDeps
    filter: (siblingContext: ExecutableContext<Deps>) => boolean
  }

  execute: (
    context: ExecutableContext<Deps>,
    taskContext: {},
    ...siblingContexts: ExecutableContext<SiblingDeps>[]
  ) => Async<T>
}

export interface Scheduler<
  T = unknown,
  Deps extends ExecutableDependencies = ExecutableDependencies
> {
  type: 'scheduler'

  name: string

  dependencies: Deps

  execute: (
    context: ExecutableContext<Deps>,
    taskContext: {},
  ) => Async<Async<T>[]>
}

// TODO: rename
export interface Checkpoint {
  type: 'checkpoint'
  name: string
  dependencies: (ExecutableDependency | Checkpoint)[]
  assignments: Assignment[]
}

// // TODO: rename
// export interface Evocation<T = unknown> {
//   type: 'evocation'
//   value: Evaluatable<T>
//   assignments: Assignment[]
// }

export interface Parameter<T = unknown> {
  type: 'parameter'
  name: string
  description?: string
  defaultValue?: T
}

export interface Value<T = unknown> {
  type: 'value'
  value: T
}

export type Evaluatable<T = unknown> =
  | Value<T>
  | Parameter<T>
  | Executable<T>
  | Scheduler<T>
  // | Evocation<T>

export type Operation = Executable | Scheduler | Checkpoint

export interface Assignment<T = unknown> {
  target: Parameter<T> | Executable<T, any, any>
  value: Value<T> | Executable<T, any, any>
}

export interface Scope {
  name: string
  childNames: string[]
  get<T>(dependency: Evaluatable<T>): null | T
  hasOwn(dependency: Evaluatable): boolean
  has(dependency: Evaluatable): boolean
  set<T>(dependency: Evaluatable<T>, value: T): void
  earliestAncestorProvidingValues(dependencies: Evaluatable[]): null | Scope
}

export interface Graph<T = unknown> {
  addEdge: (edge: [T, T]) => void
  removeEdge: (edge: [T, T]) => void
  childrenOf: (vertex: T) => T[]
  parentsOf: (vertex: T) => T[]
  hasChildren: (vertex: T) => boolean
  hasParents: (vertex: T) => boolean
  vertices: () => T[]
  has: (vertex: T) => boolean
  addVertex: (vertex: T) => void
  removeVertex: (vertex: T) => void
  size: () => number
}

export type MaybeExplicit<T extends { type: any }> = T extends any
  ? {
      explicit: boolean
      type: T['type']
      foo: T
    }
  : never

export interface AssignmentResolver {
  (checkpoint: Checkpoint): MaybeExplicit<Checkpoint>
  <T>(scheduler: Scheduler<T>): MaybeExplicit<Scheduler<T>>
  <T>(assignable: Executable<T> | Parameter<T>): MaybeExplicit<
    Executable<T> | Parameter<T> | Value<T>
  >
  (whatever: Checkpoint | Scheduler | Executable | Parameter): MaybeExplicit<
    Checkpoint | Scheduler | Executable | Parameter | Value
  >
}

export interface TaskConfig {
  scope: Scope
  resolveAssignments: AssignmentResolver
  vertex: MaybeExplicit<
    Operation /* also implicit ops like checking sibling deps */
  >
  monitor: unknown
}

export type Task = {
  scope: Scope
  execute: TaskExecution
}

export type Schedule = Graph<Task>

export interface ZipperProtocolCase<
  T = unknown,
  Element extends T = T,
  ChildKey = unknown
> {
  isMember(t: T): t is Element
  getChildren(e: Element): Iterable<[ChildKey, T]>
  reconstruct(e: Element, c: ChildKey, child: T): T
}

export interface ZipperProtocol<T = unknown> {
  getChildren(value: T): Iterable<[unknown, T]>
  reconstruct(value: T, childKey: unknown, child: T): T
}
