import { Graph } from './types'

interface VertexInfo<T> {
  parents: Set<T>
  children: Set<T>
}

export function createGraph<T>(edges: [T, T][] = []) {
  const graph = new Map<T, VertexInfo<T>>()

  function getVertex(t: T) {
    let vertex = graph.get(t)

    if (!vertex) {
      vertex = {
        parents: new Set(),
        children: new Set(),
      }

      graph.set(t, vertex)
    }

    return vertex
  }

  function addVertex(vertex: T) {
    getVertex(vertex)
  }

  function addEdge([from, to]: [T, T]) {
    getVertex(from).children.add(to)
    getVertex(to).parents.add(from)
  }

  function removeEdge([from, to]: [T, T]) {
    getVertex(from).children.delete(to)
    getVertex(to).parents.delete(from)
  }

  function childrenOf(vertex: T) {
    return Array.from(getVertex(vertex).children)
  }

  function parentsOf(vertex: T) {
    return Array.from(getVertex(vertex).parents)
  }

  function hasChildren(vertex: T) {
    return getVertex(vertex).children.size > 0
  }

  function hasParents(vertex: T) {
    return getVertex(vertex).parents.size > 0
  }

  function vertices() {
    const result: T[] = []
    graph.forEach((_, key) => {
      result.push(key)
    })
    return result
  }

  function has(vertex: T) {
    return graph.has(vertex)
  }

  function removeVertex(vertex: T) {
    if (!has(vertex)) return

    for (const child of childrenOf(vertex)) {
      removeEdge([vertex, child])
    }

    graph.delete(vertex)
  }

  function size() {
    return graph.size
  }

  edges.forEach(addEdge)

  return {
    addEdge,
    removeEdge,
    childrenOf,
    parentsOf,
    hasChildren,
    hasParents,
    vertices,
    has,
    addVertex,
    removeVertex,
    size,
  }
}

export function hasCycles(graph: Graph<any>) {
  const explored = new Set()
  const exploring = new Set()

  function explore(vertex: unknown) {
    if (exploring.has(vertex)) {
      return true
    }

    if (explored.has(vertex)) {
      return false
    }

    exploring.add(vertex)

    const cycleDetected = graph.childrenOf(vertex).some(explore)

    if (!cycleDetected) {
      exploring.delete(vertex)
      explored.add(vertex)
    }

    return cycleDetected
  }

  return graph.vertices().some(explore)
}

export function mapVertices<T, U>(
  graph: Graph<T>,
  mapping: (vertex: T) => U,
): Graph<U> {
  const mappedVertices = new Map(
    graph.vertices().map(vertex => [vertex, mapping(vertex)]),
  )

  const mappedGraph = createGraph<U>()

  mappedVertices.forEach((mappedVertex, vertex) => {
    for (const child of graph.childrenOf(vertex)) {
      if (mappedVertices.has(child)) {
        const mappedChild = mappedVertices.get(child)!
        mappedGraph.addEdge([mappedVertex, mappedChild])
      }
    }
  })

  return mappedGraph
}
