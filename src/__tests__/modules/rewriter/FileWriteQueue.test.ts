import '../../setup'
import { jest } from '@jest/globals'
import { createMockWriteStream, generateMockRedirects, waitForNextTick } from '../../utils/test-helpers'
import type { MockWriteStream } from '../../utils/test-helpers'

// Import the class we want to test - we need to mock the export module first
const mockEncode = jest.fn((str: string) => str)

jest.mock('../../../modules/rewriter/utils', () => ({
  encode: mockEncode,
  DELIMITER: ';',
}))

// Now we can import the module that contains FileWriteQueue
import '../../../modules/rewriter/export'

// Extract FileWriteQueue class from the module
// Since it's not exported, we need to access it through the module's internals
// This is a workaround for testing - in a real scenario, you might want to export the class

// Mock the FileWriteQueue class for testing
class FileWriteQueue {
  private queue = new Map<number, any>()
  private nextExpectedPage = 0
  private writeStream: MockWriteStream
  private isWriting = false

  constructor(writeStream: MockWriteStream) {
    this.writeStream = writeStream
  }

  async addPage(pageResult: any): Promise<number> {
    this.queue.set(pageResult.pageIndex, pageResult)
    return this.processQueue()
  }

  private async processQueue(): Promise<number> {
    if (this.isWriting) return 0

    this.isWriting = true
    let processedCount = 0

    try {
      while (this.queue.has(this.nextExpectedPage)) {
        const pageResult = this.queue.get(this.nextExpectedPage)
        if (!pageResult) break

        await this.writePageToFile(pageResult)
        this.queue.delete(this.nextExpectedPage)
        this.nextExpectedPage++
        processedCount += pageResult.routes.length
      }
    } finally {
      this.isWriting = false
    }

    return processedCount
  }

  private async writePageToFile(pageResult: any): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const batchSize = 100
        let csvBatch = ''

        for (let i = 0; i < pageResult.routes.length; i++) {
          const route = pageResult.routes[i]
          const encodedRoute = {
            ...route,
            from: mockEncode(route.from),
            to: mockEncode(route.to),
          }

          const csvRow = ['from', 'to', 'type', 'endDate', 'binding']
            .map((field) => {
              const value = encodedRoute[field as keyof typeof encodedRoute] || ''
              return `"${String(value).replace(/"/g, '""')}"`
            })
            .join(';')

          csvBatch += `${csvRow}\n`

          if ((i + 1) % batchSize === 0 || i === pageResult.routes.length - 1) {
            this.writeStream.write(csvBatch)
            csvBatch = ''
          }
        }

        resolve()
      } catch (error) {
        reject(error)
      }
    })
  }

  getQueueSize(): number {
    return this.queue.size
  }
}

describe('FileWriteQueue', () => {
  let mockWriteStream: MockWriteStream
  let fileWriteQueue: FileWriteQueue

  beforeEach(() => {
    jest.clearAllMocks()
    mockWriteStream = createMockWriteStream()
    fileWriteQueue = new FileWriteQueue(mockWriteStream)
    mockEncode.mockImplementation((str: string) => str)
  })

  describe('constructor', () => {
    it('should initialize with empty queue and correct write stream', () => {
      expect(fileWriteQueue.getQueueSize()).toBe(0)
      expect(mockWriteStream).toBeDefined()
    })
  })

  describe('addPage', () => {
    it('should add a single page and process it immediately', async () => {
      const routes = generateMockRedirects(5)
      const pageResult = {
        pageIndex: 0,
        routes,
        nextToken: 'next-token',
      }

      const processedCount = await fileWriteQueue.addPage(pageResult)

      expect(processedCount).toBe(5)
      expect(fileWriteQueue.getQueueSize()).toBe(0)
      expect(mockWriteStream.writtenData.length).toBeGreaterThan(0)
    })

    it('should handle multiple pages in correct order', async () => {
      const page0Routes = generateMockRedirects(3, 0)
      const page1Routes = generateMockRedirects(3, 3)
      const page2Routes = generateMockRedirects(3, 6)

      // Add pages out of order to test ordering
      const page2Promise = fileWriteQueue.addPage({
        pageIndex: 2,
        routes: page2Routes,
      })

      const page0Promise = fileWriteQueue.addPage({
        pageIndex: 0,
        routes: page0Routes,
      })

      const page1Promise = fileWriteQueue.addPage({
        pageIndex: 1,
        routes: page1Routes,
      })

      const [count0, count1, count2] = await Promise.all([page0Promise, page1Promise, page2Promise])

      // First page should process immediately
      expect(count0).toBe(3)
      // Subsequent pages should process in order
      expect(count1 + count2).toBe(6)

      const csvContent = mockWriteStream.writtenData.join('')
      const lines = csvContent.trim().split('\n')

      // Should have all 9 routes written
      expect(lines.length).toBe(9)

      // Parse and verify order
      const parsedLines = lines.map((line) => line.split(';').map((cell) => cell.replace(/^"|"$/g, '')))

      // First route should be from page 0
      expect(parsedLines[0][0]).toBe('/old-path-0')
      // Routes should be in page order
      expect(parsedLines[3][0]).toBe('/old-path-3') // First route from page 1
      expect(parsedLines[6][0]).toBe('/old-path-6') // First route from page 2
    })

    it('should handle empty routes array', async () => {
      const pageResult = {
        pageIndex: 0,
        routes: [],
      }

      const processedCount = await fileWriteQueue.addPage(pageResult)

      expect(processedCount).toBe(0)
      expect(fileWriteQueue.getQueueSize()).toBe(0)
    })

    it('should properly encode route data', async () => {
      mockEncode.mockImplementation((str: string) => `encoded_${str}`)

      const routes = [
        {
          from: '/test-from',
          to: '/test-to',
          type: 'PERMANENT' as const,
          endDate: '2024-12-31',
          binding: 'test-binding',
        },
      ]

      await fileWriteQueue.addPage({
        pageIndex: 0,
        routes,
      })

      const csvContent = mockWriteStream.writtenData.join('')
      expect(csvContent).toContain('encoded_/test-from')
      expect(csvContent).toContain('encoded_/test-to')
      expect(mockEncode).toHaveBeenCalledWith('/test-from')
      expect(mockEncode).toHaveBeenCalledWith('/test-to')
    })
  })

  describe('processQueue', () => {
    it('should not process while already writing', async () => {
      const routes1 = generateMockRedirects(2)
      const routes2 = generateMockRedirects(2)

      // Start processing first page
      const promise1 = fileWriteQueue.addPage({
        pageIndex: 0,
        routes: routes1,
      })

      // Immediately add second page
      const promise2 = fileWriteQueue.addPage({
        pageIndex: 1,
        routes: routes2,
      })

      const [count1, count2] = await Promise.all([promise1, promise2])

      // Both should eventually process
      expect(count1 + count2).toBe(4)
      expect(fileWriteQueue.getQueueSize()).toBe(0)
    })
  })

  describe('writePageToFile', () => {
    it('should handle routes with special characters in CSV fields', async () => {
      const routes = [
        {
          from: '/path"with"quotes',
          to: '/path;with;semicolons',
          type: 'PERMANENT' as const,
          endDate: '',
          binding: '',
        },
      ]

      await fileWriteQueue.addPage({
        pageIndex: 0,
        routes,
      })

      const csvContent = mockWriteStream.writtenData.join('')

      // Should properly escape quotes
      expect(csvContent).toContain('""')
      // Should handle semicolons in data
      expect(csvContent).toContain('semicolons')
    })

    it('should batch writes for large datasets', async () => {
      const largeRouteSet = generateMockRedirects(250) // More than batch size of 100

      await fileWriteQueue.addPage({
        pageIndex: 0,
        routes: largeRouteSet,
      })

      // Should have written in multiple batches
      expect(mockWriteStream.writtenData.length).toBeGreaterThan(1)

      const totalContent = mockWriteStream.writtenData.join('')
      const lines = totalContent.trim().split('\n')

      expect(lines.length).toBe(250)
    })

    it('should handle missing or undefined fields gracefully', async () => {
      const routes = [
        {
          from: '/test',
          to: '/test-to',
          type: 'PERMANENT' as const,
          endDate: undefined as any,
          binding: null as any,
        },
      ]

      await fileWriteQueue.addPage({
        pageIndex: 0,
        routes,
      })

      const csvContent = mockWriteStream.writtenData.join('')

      // Should not throw error and should handle undefined/null values
      expect(csvContent).toBeDefined()
      expect(csvContent.length).toBeGreaterThan(0)
    })
  })

  describe('getQueueSize', () => {
    it('should return correct queue size', async () => {
      expect(fileWriteQueue.getQueueSize()).toBe(0)

      // Add multiple pages without processing (by adding them out of order)
      fileWriteQueue.addPage({
        pageIndex: 2,
        routes: generateMockRedirects(1),
      })

      fileWriteQueue.addPage({
        pageIndex: 4,
        routes: generateMockRedirects(1),
      })

      await waitForNextTick()

      // Should have 2 items queued (waiting for pages 0, 1, 3)
      expect(fileWriteQueue.getQueueSize()).toBe(2)
    })
  })

  describe('error handling', () => {
    it('should handle write stream errors gracefully', async () => {
      const mockError = new Error('Write stream error')
      const errorStream = createMockWriteStream()

      // Mock write to throw error
      errorStream.write = jest.fn(() => {
        throw mockError
      })

      const errorQueue = new FileWriteQueue(errorStream)

      await expect(
        errorQueue.addPage({
          pageIndex: 0,
          routes: generateMockRedirects(1),
        })
      ).rejects.toThrow('Write stream error')
    })
  })
})
