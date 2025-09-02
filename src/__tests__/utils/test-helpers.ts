import { jest } from '@jest/globals'
import { Writable } from 'stream'
import type { Redirect } from '../../clients/apps/Rewriter'

export interface MockWriteStream extends Writable {
  writtenData: string[]
  destroyed: boolean
  ended: boolean
}

export const createMockWriteStream = (): MockWriteStream => {
  const writtenData: string[] = []
  let destroyed = false
  let ended = false

  const stream = new Writable({
    write(chunk: any, _encoding: any, callback: any) {
      writtenData.push(chunk.toString())
      callback()
    },
  }) as MockWriteStream

  // Override methods to track state
  const originalEnd = stream.end.bind(stream)
  const originalDestroy = stream.destroy.bind(stream)

  stream.end = function (...args: any[]) {
    ended = true
    return originalEnd(...args)
  }

  stream.destroy = function (...args: any[]) {
    destroyed = true
    return originalDestroy(...args)
  }

  // Add custom properties
  Object.defineProperty(stream, 'writtenData', {
    get: () => writtenData,
    enumerable: true,
  })

  Object.defineProperty(stream, 'destroyed', {
    get: () => destroyed,
    enumerable: true,
  })

  Object.defineProperty(stream, 'ended', {
    get: () => ended,
    enumerable: true,
  })

  return stream
}

export const createMockRewriter = () => {
  return {
    exportRedirects: jest.fn(),
  }
}

export const generateMockRedirects = (count: number, startIndex = 0): Redirect[] => {
  return Array.from({ length: count }, (_, i) => ({
    from: `/old-path-${startIndex + i}`,
    to: `/new-path-${startIndex + i}`,
    type: i % 2 === 0 ? 'PERMANENT' : ('TEMPORARY' as const),
    endDate: i % 3 === 0 ? '2024-12-31' : '',
    binding: `binding-${i % 2}`,
  }))
}

export const mockExportResponse = (routes: Redirect[], next?: string) => ({
  routes,
  next: next || undefined,
})

export const waitForNextTick = () => new Promise((resolve) => setImmediate(resolve))

export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const getWrittenCsvContent = (mockStream: MockWriteStream): string => {
  return mockStream.writtenData.join('')
}

export const parseCsvContent = (csvContent: string): string[][] => {
  return csvContent
    .trim()
    .split('\n')
    .map((line) => line.split(';').map((cell) => cell.replace(/^"|"$/g, '')))
}

export const setupMockProcessExit = () => {
  const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
    throw new Error(`process.exit called with code ${code}`)
  })
  return mockExit
}

export const restoreMockProcessExit = (mockExit: any) => {
  mockExit.mockRestore()
}
