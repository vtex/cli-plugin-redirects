import '../../setup'
import { jest } from '@jest/globals'

// Mock the export module function
const mockRedirectsExport = jest.fn()

jest.mock('../../../modules/rewriter/export.js', () => ({
  __esModule: true,
  default: mockRedirectsExport,
}))

// Import the command after mocking
import RedirectsExport from '../../../commands/redirects/export.js'

describe('RedirectsExport Command', () => {
  let command: RedirectsExport

  beforeEach(() => {
    jest.clearAllMocks()
    command = new RedirectsExport([], {} as any)
  })

  describe('static properties', () => {
    it('should have correct description', () => {
      expect(RedirectsExport.description).toContain('Exports all redirects')
      expect(RedirectsExport.description).toContain('account')
      expect(RedirectsExport.description).toContain('workspace')
      expect(RedirectsExport.description).toContain('CSV file')
    })

    it('should have correct examples', () => {
      expect(RedirectsExport.examples).toHaveLength(1)
      expect(RedirectsExport.examples[0]).toContain('vtex redirects export')
      expect(RedirectsExport.examples[0]).toContain('csvPath')
    })

    it('should have correct args configuration', () => {
      expect(RedirectsExport.args).toHaveLength(1)

      const csvPathArg = RedirectsExport.args[0]
      expect(csvPathArg.name).toBe('csvPath')
      expect(csvPathArg.required).toBe(true)
      expect(csvPathArg.description).toContain('Name of the CSV file')
    })

    it('should inherit global flags', () => {
      expect(RedirectsExport.flags).toBeDefined()
      // The flags should include global flags from CustomCommand
    })
  })

  describe('run method', () => {
    it('should call redirectsExport with correct csvPath', async () => {
      const testCsvPath = 'test-export.csv'

      // Mock the parse method to return our test data
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: testCsvPath },
        flags: {},
      })
      ;(mockRedirectsExport as any).mockResolvedValueOnce(undefined)

      await command.run()

      expect(mockRedirectsExport).toHaveBeenCalledWith(testCsvPath)
      expect(mockRedirectsExport).toHaveBeenCalledTimes(1)
    })

    it('should handle csvPath with different file extensions', async () => {
      const testCases = ['export.csv', 'redirects-backup.csv', 'data/exports/redirects.csv', 'redirects-2024.csv']

      for (const csvPath of testCases) {
        ;(command as any).parse = jest.fn().mockReturnValue({
          args: { csvPath },
          flags: {},
        })
        ;(mockRedirectsExport as any).mockResolvedValueOnce(undefined)

        await command.run()

        expect(mockRedirectsExport).toHaveBeenCalledWith(csvPath)
      }

      expect(mockRedirectsExport).toHaveBeenCalledTimes(testCases.length)
    })

    it('should handle csvPath with special characters', async () => {
      const specialPaths = [
        'export-file-with-dashes.csv',
        'export_file_with_underscores.csv',
        'export.with.dots.csv',
        'export (with parentheses).csv',
      ]

      for (const csvPath of specialPaths) {
        ;(command as any).parse = jest.fn().mockReturnValue({
          args: { csvPath },
          flags: {},
        })
        ;(mockRedirectsExport as any).mockResolvedValueOnce(undefined)

        await command.run()

        expect(mockRedirectsExport).toHaveBeenCalledWith(csvPath)
      }

      expect(mockRedirectsExport).toHaveBeenCalledTimes(specialPaths.length)
    })

    it('should propagate errors from redirectsExport', async () => {
      const testError = new Error('Export failed')

      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'error-test.csv' },
        flags: {},
      })
      ;(mockRedirectsExport as any).mockRejectedValueOnce(testError)

      await expect(command.run()).rejects.toThrow('Export failed')
      expect(mockRedirectsExport).toHaveBeenCalledWith('error-test.csv')
    })

    it('should handle empty csvPath string', async () => {
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: '' },
        flags: {},
      })
      ;(mockRedirectsExport as any).mockResolvedValueOnce(undefined)

      await command.run()

      expect(mockRedirectsExport).toHaveBeenCalledWith('')
    })
  })

  describe('command integration', () => {
    it('should be properly configured as an oclif command', () => {
      // Verify the command extends the expected base class
      expect(command).toBeInstanceOf(RedirectsExport)

      // Verify required static properties exist
      expect(RedirectsExport.description).toBeDefined()
      expect(RedirectsExport.examples).toBeDefined()
      expect(RedirectsExport.args).toBeDefined()
      expect(RedirectsExport.flags).toBeDefined()
    })

    it('should have proper command configuration for oclif', () => {
      // Args should be properly configured
      expect(RedirectsExport.args[0].name).toBe('csvPath')
      expect(RedirectsExport.args[0].required).toBe(true)

      // Should have examples for help text
      expect(RedirectsExport.examples.length).toBeGreaterThan(0)
    })
  })

  describe('error scenarios', () => {
    it('should handle network timeout errors', async () => {
      const timeoutError = new Error('Network timeout')
      timeoutError.name = 'TimeoutError'
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'timeout-test.csv' },
        flags: {},
      })
      ;(mockRedirectsExport as any).mockRejectedValueOnce(timeoutError)

      await expect(command.run()).rejects.toThrow('Network timeout')
    })

    it('should handle permission errors', async () => {
      const permissionError = new Error('Permission denied')
      permissionError.name = 'PermissionError'
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: '/root/restricted.csv' },
        flags: {},
      })
      ;(mockRedirectsExport as any).mockRejectedValueOnce(permissionError)

      await expect(command.run()).rejects.toThrow('Permission denied')
    })

    it('should handle disk space errors', async () => {
      const diskError = new Error('No space left on device')
      diskError.name = 'DiskSpaceError'
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'large-export.csv' },
        flags: {},
      })
      ;(mockRedirectsExport as any).mockRejectedValueOnce(diskError)

      await expect(command.run()).rejects.toThrow('No space left on device')
    })
  })

  describe('performance scenarios', () => {
    it('should handle large file exports', async () => {
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'large-dataset.csv' },
        flags: {},
      })

      // Simulate a long-running export
      mockRedirectsExport.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)))

      const startTime = Date.now()
      await command.run()
      const endTime = Date.now()

      expect(endTime - startTime).toBeGreaterThanOrEqual(100)
      expect(mockRedirectsExport).toHaveBeenCalledWith('large-dataset.csv')
    })

    it('should handle concurrent command executions', async () => {
      const command1 = new RedirectsExport([], {} as any)
      const command2 = new RedirectsExport([], {} as any)

      ;(command1 as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'concurrent1.csv' },
        flags: {},
      })
      ;(command2 as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'concurrent2.csv' },
        flags: {},
      })
      ;(mockRedirectsExport as any).mockResolvedValue(undefined)

      // Run commands concurrently
      await Promise.all([command1.run(), command2.run()])

      expect(mockRedirectsExport).toHaveBeenCalledTimes(2)
      expect(mockRedirectsExport).toHaveBeenCalledWith('concurrent1.csv')
      expect(mockRedirectsExport).toHaveBeenCalledWith('concurrent2.csv')
    })
  })
})
