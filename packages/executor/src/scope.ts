import { Scope, Evaluatable } from './types'

export function createScope({
  name,
  parent = null,
  contents = new Map(),
}: {
  name: string
  parent?: Scope | null
  contents?: Map<Evaluatable, any> | undefined
}): Scope {
  if (parent) {
    parent.childNames.push(name)
  }

  const childNames: string[] = []

  function hasOwn(dependency: Evaluatable): boolean {
    return contents.has(dependency)
  }

  function has(dependency: Evaluatable): boolean {
    return Boolean(hasOwn(dependency) || (parent && parent.has(dependency)))
  }

  function get<T>(dependency: Evaluatable<T>): null | T {
    if (has(dependency)) {
      return contents.get(dependency)!
    }

    if (parent) {
      return parent.get(dependency)
    }

    return null
  }

  function set<T>(dependency: Evaluatable<T>, value: T) {
    contents.set(dependency, value)
  }

  const scope = {
    name,
    childNames,
    has,
    hasOwn,
    set,
    get,
    earliestAncestorProvidingValues(dependencies: Evaluatable[]): null | Scope {
      const unprovidedValues = dependencies.filter(
        provider => !hasOwn(provider),
      )

      if (!parent) {
        return unprovidedValues.length ? null : scope
      }

      if (unprovidedValues.length === dependencies.length) {
        return parent.earliestAncestorProvidingValues(unprovidedValues)
      }

      if (unprovidedValues.every(dependency => parent!.has(dependency))) {
        return scope
      }

      return null
    },
  }

  return scope
}
