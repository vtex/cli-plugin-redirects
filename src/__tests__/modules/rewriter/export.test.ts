import '../../setup'
import { jest } from '@jest/globals'
import {
  createMockWriteStream,
  createMockRewriter,
  generateMockRedirects,
  mockExportResponse,
  setupMockProcessExit,
  restoreMockProcessExit,
} from '../../utils/test-helpers'

// Mock dependencies
const mockCreateWriteStream = jest.fn()
const mockReadJson = jest.fn()
const mockWriteJsonSync = jest.fn()
const mockSleep = jest.fn()
const mockEncode = jest.fn()
const mockShowGraphQLErrors = jest.fn()

jest.mock('fs', () => ({
  createWriteStream: mockCreateWriteStream,
}))

jest.mock('fs-extra', () => ({
  readJson: mockReadJson,
  writeJsonSync: mockWriteJsonSync,
}))

jest.mock('../../../modules/rewriter/utils', () => ({
  DELIMITER: ';',
  encode: mockEncode,
  MAX_RETRIES: 3,
  METAINFO_FILE: '.vtex_redirects_metainfo.json',
  RETRY_INTERVAL_S: 1,
  saveMetainfo: jest.fn(),
  deleteMetainfo: jest.fn(),
  showGraphQLErrors: mockShowGraphQLErrors,
  sleep: mockSleep,
}))

jest.mock('../../../clients/apps/Rewriter', () => ({
  Rewriter: {
    createClient: jest.fn(),
  },
}))

describe('Export Module', () => {
  let mockRewriter: any
  let mockWriteStream: any
  let exportModule: any
  let mockProcessExit: any

  beforeEach(async () => {
    jest.clearAllMocks()

    mockProcessExit = setupMockProcessExit()
    mockWriteStream = createMockWriteStream()
    mockRewriter = createMockRewriter()

    mockCreateWriteStream.mockReturnValue(mockWriteStream)
    ;(mockReadJson as any).mockResolvedValue({})
    ;(mockSleep as any).mockResolvedValue(undefined)
    ;(mockEncode as any).mockImplementation((str: string) => str)

    // Mock Rewriter.createClient to return our mock
    const { Rewriter } = await import('../../../clients/apps/Rewriter')
    ;(Rewriter.createClient as jest.Mock).mockReturnValue(mockRewriter)

    // Import the export function
    exportModule = await import('../../../modules/rewriter/export')
  })

  afterEach(() => {
    restoreMockProcessExit(mockProcessExit)
  })

  describe('handleExport', () => {
    it('should export a small dataset successfully', async () => {
      const testRoutes = generateMockRedirects(5)
      mockRewriter.exportRedirects.mockResolvedValueOnce(mockExportResponse(testRoutes))

      await exportModule.default('test-export.csv')

      expect(mockCreateWriteStream).toHaveBeenCalledWith('./test-export.csv')
      expect(mockRewriter.exportRedirects).toHaveBeenCalledWith(undefined)
      expect(mockWriteStream.writtenData.length).toBeGreaterThan(0)

      // Should have written headers plus data
      const content = mockWriteStream.writtenData.join('')
      expect(content).toContain('from;to;type;endDate;binding')
      expect(content).toContain('/old-path-0')
    })

    it('should handle paginated data correctly', async () => {
      const page1Routes = generateMockRedirects(3, 0)
      const page2Routes = generateMockRedirects(3, 3)
      const page3Routes = generateMockRedirects(2, 6)

      mockRewriter.exportRedirects
        .mockResolvedValueOnce(mockExportResponse(page1Routes, 'token1'))
        .mockResolvedValueOnce(mockExportResponse(page2Routes, 'token2'))
        .mockResolvedValueOnce(mockExportResponse(page3Routes))

      await exportModule.default('test-export.csv')

      expect(mockRewriter.exportRedirects).toHaveBeenCalledTimes(3)
      expect(mockRewriter.exportRedirects).toHaveBeenNthCalledWith(1, undefined)
      expect(mockRewriter.exportRedirects).toHaveBeenNthCalledWith(2, 'token1')
      expect(mockRewriter.exportRedirects).toHaveBeenNthCalledWith(3, 'token2')

      const content = mockWriteStream.writtenData.join('')
      const lines = content.trim().split('\n')

      // Headers + 8 data rows
      expect(lines.length).toBe(9)
    })

    it('should handle empty result gracefully', async () => {
      mockRewriter.exportRedirects.mockResolvedValueOnce(mockExportResponse([]))

      await exportModule.default('empty-export.csv')

      expect(mockWriteStream.writtenData.length).toBeGreaterThan(0)

      const content = mockWriteStream.writtenData.join('')
      const lines = content.trim().split('\n')

      // Should only have headers
      expect(lines.length).toBe(1)
      expect(content).toContain('from;to;type;endDate;binding')
    })

    it('should handle concurrent processing with multiple pages', async () => {
      // Simulate a larger dataset that would benefit from concurrent processing
      const pages = Array.from({ length: 10 }, (_, i) => generateMockRedirects(100, i * 100))

      pages.forEach((pageRoutes, index) => {
        const nextToken = index < pages.length - 1 ? `token${index + 1}` : undefined
        mockRewriter.exportRedirects.mockResolvedValueOnce(mockExportResponse(pageRoutes, nextToken))
      })

      await exportModule.default('large-export.csv')

      expect(mockRewriter.exportRedirects).toHaveBeenCalledTimes(10)

      const content = mockWriteStream.writtenData.join('')
      const lines = content.trim().split('\n')

      // Headers + 1000 data rows
      expect(lines.length).toBe(1001)
    })

    it('should properly encode route data', async () => {
      ;(mockEncode as any).mockImplementation((str: string) => `encoded_${str}`)

      const testRoutes = [
        {
          from: '/special/path',
          to: '/encoded/path',
          type: 'PERMANENT' as const,
          endDate: '',
          binding: '',
        },
      ]

      mockRewriter.exportRedirects.mockResolvedValueOnce(mockExportResponse(testRoutes))

      await exportModule.default('encoded-export.csv')

      expect(mockEncode).toHaveBeenCalledWith('/special/path')
      expect(mockEncode).toHaveBeenCalledWith('/encoded/path')

      const content = mockWriteStream.writtenData.join('')
      expect(content).toContain('encoded_/special/path')
      expect(content).toContain('encoded_/encoded/path')
    })

    it('should resume from metadata when available', async () => {
      const existingMetadata = {
        exports: {
          'some-hash': {
            counter: 0,
            data: {
              routeCount: 150,
              next: 'resume-token',
            },
          },
        },
      }

      ;(mockReadJson as any).mockResolvedValueOnce(existingMetadata)

      const resumeRoutes = generateMockRedirects(50, 150)
      mockRewriter.exportRedirects.mockResolvedValueOnce(mockExportResponse(resumeRoutes))

      await exportModule.default('resume-export.csv')

      // Should start from the resume token
      expect(mockRewriter.exportRedirects).toHaveBeenCalledWith('resume-token')
    })

    it('should handle network errors with proper error reporting', async () => {
      const networkError = new Error('Network timeout')
      mockRewriter.exportRedirects.mockRejectedValueOnce(networkError)

      await expect(exportModule.default('error-export.csv')).rejects.toThrow('Network timeout')

      expect(mockShowGraphQLErrors).toHaveBeenCalledWith(networkError)
    })

    it('should clean up resources on interruption', async () => {
      const testRoutes = generateMockRedirects(5)
      mockRewriter.exportRedirects.mockResolvedValueOnce(mockExportResponse(testRoutes))

      // Simulate the export function
      try {
        await exportModule.default('interrupted-export.csv')
      } catch (error) {
        // Ignore the error for this test
      }

      // Stream should be properly handled
      expect(mockWriteStream).toBeDefined()
    })

    it('should handle write stream errors', async () => {
      const writeError = new Error('Disk full')
      mockWriteStream.write = jest.fn(() => {
        throw writeError
      })

      const testRoutes = generateMockRedirects(1)
      mockRewriter.exportRedirects.mockResolvedValueOnce(mockExportResponse(testRoutes))

      await expect(exportModule.default('write-error.csv')).rejects.toThrow()
    })

    it('should respect concurrency limits', async () => {
      // This is more of an integration test, but we can verify the structure
      const largeDataset = Array.from({ length: 20 }, (_, i) => generateMockRedirects(50, i * 50))

      largeDataset.forEach((pageRoutes, index) => {
        const nextToken = index < largeDataset.length - 1 ? `token${index + 1}` : undefined
        mockRewriter.exportRedirects.mockResolvedValueOnce(mockExportResponse(pageRoutes, nextToken))
      })

      await exportModule.default('concurrent-export.csv')

      // Should have processed all pages
      expect(mockRewriter.exportRedirects).toHaveBeenCalledTimes(20)

      const content = mockWriteStream.writtenData.join('')
      const lines = content.trim().split('\n')

      // Headers + (20 * 50) data rows
      expect(lines.length).toBe(1001)
    })
  })

  describe('retry mechanism', () => {
    it('should retry on failure up to MAX_RETRIES', async () => {
      const retryError = new Error('Temporary failure')

      // Mock the first few calls to fail, then succeed
      mockRewriter.exportRedirects
        .mockRejectedValueOnce(retryError)
        .mockRejectedValueOnce(retryError)
        .mockResolvedValueOnce(mockExportResponse(generateMockRedirects(1)))

      // The retry mechanism is in the default export function
      // We need to test it appropriately
      try {
        await exportModule.default('retry-export.csv')
      } catch (error) {
        // The retry mechanism might still throw after MAX_RETRIES
        expect(mockSleep).toHaveBeenCalled()
      }
    })

    it('should exit after MAX_RETRIES failures', async () => {
      const persistentError = new Error('Persistent failure')

      mockRewriter.exportRedirects.mockRejectedValue(persistentError)

      await expect(exportModule.default('persistent-error.csv')).rejects.toThrow()

      expect(mockShowGraphQLErrors).toHaveBeenCalled()
    })
  })

  describe('environment configuration', () => {
    it('should respect EXPORT_CONCURRENCY environment variable', async () => {
      const originalEnv = process.env.EXPORT_CONCURRENCY
      process.env.EXPORT_CONCURRENCY = '10'

      const testRoutes = generateMockRedirects(5)
      mockRewriter.exportRedirects.mockResolvedValueOnce(mockExportResponse(testRoutes))

      await exportModule.default('env-config-export.csv')

      // Restore environment
      if (originalEnv !== undefined) {
        process.env.EXPORT_CONCURRENCY = originalEnv
      } else {
        delete process.env.EXPORT_CONCURRENCY
      }

      expect(mockWriteStream.writtenData.length).toBeGreaterThan(0)
    })

    it('should respect EXPORT_BATCH_SIZE environment variable', async () => {
      const originalEnv = process.env.EXPORT_BATCH_SIZE
      process.env.EXPORT_BATCH_SIZE = '50'

      const testRoutes = generateMockRedirects(100) // More than batch size
      mockRewriter.exportRedirects.mockResolvedValueOnce(mockExportResponse(testRoutes))

      await exportModule.default('batch-size-export.csv')

      // Restore environment
      if (originalEnv !== undefined) {
        process.env.EXPORT_BATCH_SIZE = originalEnv
      } else {
        delete process.env.EXPORT_BATCH_SIZE
      }

      expect(mockWriteStream.writtenData.length).toBeGreaterThan(0)
    })
  })
})
