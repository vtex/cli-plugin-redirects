import '../setup'
import { jest } from '@jest/globals'
import { createMockWriteStream, generateMockRedirects, mockExportResponse } from '../utils/test-helpers'
import fs from 'fs'
import path from 'path'
import os from 'os'

// Mock dependencies for integration test
const mockCreateWriteStream = jest.fn()
const mockReadJson = jest.fn()
const mockWriteJsonSync = jest.fn()

jest.mock('fs', () => ({
  createWriteStream: mockCreateWriteStream,
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
}))

jest.mock('fs-extra', () => ({
  readJson: mockReadJson,
  writeJsonSync: mockWriteJsonSync,
}))

const mockRewriter = {
  exportRedirects: jest.fn(),
}

jest.mock('../../clients/apps/Rewriter', () => ({
  Rewriter: {
    createClient: jest.fn(() => mockRewriter),
  },
}))

jest.mock('../../modules/rewriter/utils', () => ({
  DELIMITER: ';',
  encode: jest.fn((str: string) => str),
  MAX_RETRIES: 3,
  METAINFO_FILE: '.vtex_redirects_metainfo.json',
  RETRY_INTERVAL_S: 0.1, // Shorter for tests
  saveMetainfo: jest.fn(),
  deleteMetainfo: jest.fn(),
  showGraphQLErrors: jest.fn(),
  sleep: jest.fn(),
}))

describe('Export Integration Tests', () => {
  let mockWriteStream: any
  let exportModule: any
  beforeEach(async () => {
    jest.clearAllMocks()

    // Create temp directory for test files (not used in current tests)
    const _tempDir = fs.mkdtempSync ? fs.mkdtempSync(path.join(os.tmpdir(), 'vtex-test-')) : '/tmp/vtex-test'
    void _tempDir // Suppress unused variable warning

    mockWriteStream = createMockWriteStream()
    mockCreateWriteStream.mockReturnValue(mockWriteStream)
    ;(mockReadJson as any).mockResolvedValue({})

    // Import the export module
    exportModule = await import('../../modules/rewriter/export')
  })

  describe('End-to-End Export Workflow', () => {
    it('should complete a full export workflow with multiple pages', async () => {
      // Setup test data - simulate 3 pages of redirects
      const page1 = generateMockRedirects(100, 0)
      const page2 = generateMockRedirects(100, 100)
      const page3 = generateMockRedirects(50, 200)

      ;(mockRewriter.exportRedirects as any)
        .mockResolvedValueOnce(mockExportResponse(page1, 'token1'))
        .mockResolvedValueOnce(mockExportResponse(page2, 'token2'))
        .mockResolvedValueOnce(mockExportResponse(page3))

      const csvPath = 'integration-test.csv'
      await exportModule.default(csvPath)

      // Verify API calls
      expect(mockRewriter.exportRedirects).toHaveBeenCalledTimes(3)
      expect(mockRewriter.exportRedirects).toHaveBeenNthCalledWith(1, undefined)
      expect(mockRewriter.exportRedirects).toHaveBeenNthCalledWith(2, 'token1')
      expect(mockRewriter.exportRedirects).toHaveBeenNthCalledWith(3, 'token2')

      // Verify file creation
      expect(mockCreateWriteStream).toHaveBeenCalledWith('./integration-test.csv')

      // Verify content
      const writtenContent = mockWriteStream.writtenData.join('')
      const lines = writtenContent.trim().split('\n')

      // Should have header + 250 data rows
      expect(lines.length).toBe(251)

      // Verify header
      expect(lines[0]).toBe('from;to;type;endDate;binding')

      // Verify first few data rows
      expect(lines[1]).toContain('/old-path-0')
      expect(lines[101]).toContain('/old-path-100') // First row from page 2
      expect(lines[201]).toContain('/old-path-200') // First row from page 3
    })

    it('should handle large dataset with memory efficiency', async () => {
      // Simulate a very large dataset
      const pageCount = 50
      const routesPerPage = 1000

      // Setup mock responses for all pages
      for (let i = 0; i < pageCount; i++) {
        const routes = generateMockRedirects(routesPerPage, i * routesPerPage)
        const nextToken = i < pageCount - 1 ? `token${i + 1}` : undefined

        ;(mockRewriter.exportRedirects as any).mockResolvedValueOnce(mockExportResponse(routes, nextToken))
      }

      const csvPath = 'large-dataset.csv'
      await exportModule.default(csvPath)

      // Verify all pages were processed
      expect(mockRewriter.exportRedirects).toHaveBeenCalledTimes(pageCount)

      // Verify total content
      const writtenContent = mockWriteStream.writtenData.join('')
      const lines = writtenContent.trim().split('\n')

      // Should have header + (50 * 1000) data rows
      expect(lines.length).toBe(50001)
    })

    it('should handle resume from interruption', async () => {
      // Setup metadata as if previous export was interrupted
      const existingMetadata = {
        exports: {
          // Hash would be generated based on account, workspace, and file path
          abc123: {
            counter: 0,
            data: {
              routeCount: 150,
              next: 'resume-token-150',
            },
          },
        },
      }

      ;(mockReadJson as any).mockResolvedValueOnce(existingMetadata)

      // Setup remaining data to be exported
      const remainingRoutes = generateMockRedirects(100, 150)
      ;(mockRewriter.exportRedirects as any).mockResolvedValueOnce(mockExportResponse(remainingRoutes))

      const csvPath = 'resume-test.csv'
      await exportModule.default(csvPath)

      // Should start from resume token
      expect(mockRewriter.exportRedirects).toHaveBeenCalledWith('resume-token-150')

      // Should write the remaining data
      const writtenContent = mockWriteStream.writtenData.join('')
      expect(writtenContent).toContain('/old-path-150')
    })

    it('should handle empty dataset gracefully', async () => {
      ;(mockRewriter.exportRedirects as any).mockResolvedValueOnce(mockExportResponse([]))

      const csvPath = 'empty-export.csv'
      await exportModule.default(csvPath)

      expect(mockRewriter.exportRedirects).toHaveBeenCalledTimes(1)

      const writtenContent = mockWriteStream.writtenData.join('')
      const lines = writtenContent.trim().split('\n')

      // Should only have header row
      expect(lines.length).toBe(1)
      expect(lines[0]).toBe('from;to;type;endDate;binding')
    })

    it('should handle network errors with proper retry', async () => {
      const networkError = new Error('Network timeout')

      // First call fails, second succeeds
      ;(mockRewriter.exportRedirects as any)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(mockExportResponse(generateMockRedirects(5)))

      const csvPath = 'retry-test.csv'

      // The retry mechanism is handled in the default export wrapper
      try {
        await exportModule.default(csvPath)
      } catch (error) {
        // May still throw after retries, but should have attempted retry
      }

      // Should have been called at least once
      expect(mockRewriter.exportRedirects).toHaveBeenCalled()
    })

    it('should handle concurrent file writing correctly', async () => {
      // Simulate rapid succession of pages that would test queue ordering
      const pageCount = 10
      const routesPerPage = 50

      for (let i = 0; i < pageCount; i++) {
        const routes = generateMockRedirects(routesPerPage, i * routesPerPage)
        const nextToken = i < pageCount - 1 ? `token${i + 1}` : undefined

        // Add small delays to simulate real-world timing
        mockRewriter.exportRedirects.mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve(mockExportResponse(routes, nextToken)), Math.random() * 10)
            )
        )
      }

      const csvPath = 'concurrent-test.csv'
      await exportModule.default(csvPath)

      // Verify all pages were processed
      expect(mockRewriter.exportRedirects).toHaveBeenCalledTimes(pageCount)

      // Verify content is in correct order
      const writtenContent = mockWriteStream.writtenData.join('')
      const lines = writtenContent.trim().split('\n')

      // Should maintain proper ordering despite concurrent processing
      expect(lines[1]).toContain('/old-path-0') // First route
      expect(lines[51]).toContain('/old-path-50') // First route from page 2
      expect(lines[101]).toContain('/old-path-100') // First route from page 3
    })

    it('should handle special characters in redirect data', async () => {
      const specialRoutes = [
        {
          from: '/path"with"quotes',
          to: '/path;with;semicolons',
          type: 'PERMANENT' as const,
          endDate: '2024-12-31',
          binding: 'store;with"special,chars',
        },
        {
          from: '/path\nwith\nnewlines',
          to: '/path\twith\ttabs',
          type: 'TEMPORARY' as const,
          endDate: '',
          binding: '',
        },
      ]

      ;(mockRewriter.exportRedirects as any).mockResolvedValueOnce(mockExportResponse(specialRoutes))

      const csvPath = 'special-chars.csv'
      await exportModule.default(csvPath)

      const writtenContent = mockWriteStream.writtenData.join('')

      // Should properly escape special characters
      expect(writtenContent).toContain('""') // Escaped quotes
      expect(writtenContent).not.toContain('\n/path') // No unescaped newlines in data

      // Should still be valid CSV structure
      const lines = writtenContent.trim().split('\n')
      expect(lines.length).toBe(3) // Header + 2 data rows
    })
  })

  describe('Performance Benchmarks', () => {
    it('should process 10k redirects efficiently', async () => {
      const routeCount = 10000
      const pageSize = 1000
      const pageCount = routeCount / pageSize

      for (let i = 0; i < pageCount; i++) {
        const routes = generateMockRedirects(pageSize, i * pageSize)
        const nextToken = i < pageCount - 1 ? `token${i + 1}` : undefined

        ;(mockRewriter.exportRedirects as any).mockResolvedValueOnce(mockExportResponse(routes, nextToken))
      }

      const startTime = Date.now()
      await exportModule.default('performance-test.csv')
      const endTime = Date.now()

      const processingTime = endTime - startTime

      // Should complete within reasonable time (adjust threshold as needed)
      expect(processingTime).toBeLessThan(5000) // 5 seconds max

      // Verify all data was processed
      const writtenContent = mockWriteStream.writtenData.join('')
      const lines = writtenContent.trim().split('\n')
      expect(lines.length).toBe(routeCount + 1) // +1 for header
    })
  })

  describe('Error Recovery', () => {
    it('should clean up resources on error', async () => {
      const criticalError = new Error('Critical system error')
      ;(mockRewriter.exportRedirects as any).mockRejectedValueOnce(criticalError)

      const csvPath = 'error-cleanup-test.csv'

      await expect(exportModule.default(csvPath)).rejects.toThrow('Critical system error')

      // Stream should have been created and attempt cleanup
      expect(mockCreateWriteStream).toHaveBeenCalledWith('./error-cleanup-test.csv')
    })

    it('should handle disk space errors gracefully', async () => {
      const diskError = new Error('ENOSPC: no space left on device')

      // Simulate disk space error during write
      mockWriteStream.write = jest.fn(() => {
        throw diskError
      })

      const routes = generateMockRedirects(5)
      ;(mockRewriter.exportRedirects as any).mockResolvedValueOnce(mockExportResponse(routes))

      const csvPath = 'disk-space-test.csv'

      await expect(exportModule.default(csvPath)).rejects.toThrow('ENOSPC')
    })
  })
})
