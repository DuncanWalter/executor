import { ZipperProtocol, ZipperProtocolCase } from './types'

export function isNotNullish<T>(x: null | undefined | T): x is T {
  return x !== null && x !== undefined
}

export function zipperMap<T>(
  { getChildren, reconstruct }: ZipperProtocol<T>,
  value: T,
  mapping: (value: T) => T,
): T {
  return Array.from(getChildren(value)).reduce((acc, [key, child]) => {
    const result = mapping(child)

    if (result !== child) {
      return reconstruct(value, key, result)
    }

    return acc
  }, value)
}

export function createZipperProtocol<T>(
  protocols: ZipperProtocolCase<T>[],
): ZipperProtocol<T> {
  return {
    getChildren(t: T) {
      for (const { isMember, getChildren } of protocols) {
        if (isMember(t)) {
          return getChildren(t)
        }
      }
      return []
    },
    reconstruct(t: T, childKey: unknown, child: T) {
      for (const { isMember, reconstruct } of protocols) {
        if (isMember(t)) {
          return reconstruct(t, childKey, child)
        }
      }
      throw new Error(
        'Internal Error: zipper reconstruction called on unrecognized input type',
      )
    },
  }
}
