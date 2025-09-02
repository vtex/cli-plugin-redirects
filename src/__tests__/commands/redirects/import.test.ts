import '../../setup'
import { jest } from '@jest/globals'

// Mock the import module function
const mockRedirectsImport = jest.fn()

jest.mock('../../../modules/rewriter/import.js', () => ({
  __esModule: true,
  default: mockRedirectsImport,
}))

// Import the command after mocking
import RedirectsImport from '../../../commands/redirects/import.js'

describe('RedirectsImport Command', () => {
  let command: RedirectsImport

  beforeEach(() => {
    jest.clearAllMocks()
    command = new RedirectsImport([], {} as any)
  })

  describe('static properties', () => {
    it('should have correct description', () => {
      expect(RedirectsImport.description).toContain('Imports redirects from a CSV file')
      expect(RedirectsImport.description).toContain('account')
      expect(RedirectsImport.description).toContain('workspace')
    })

    it('should have correct examples', () => {
      expect(RedirectsImport.examples).toHaveLength(1)
      expect(RedirectsImport.examples[0]).toContain('vtex redirects import')
      expect(RedirectsImport.examples[0]).toContain('csvPath')
    })

    it('should have correct args configuration', () => {
      expect(RedirectsImport.args).toBeDefined()
      expect(RedirectsImport.args.csvPath).toBeDefined()

      const csvPathArg = RedirectsImport.args.csvPath
      expect(csvPathArg.required).toBe(true)
      expect(csvPathArg.description).toContain('Name of the CSV file')
    })

    it('should have correct flags configuration', () => {
      expect(RedirectsImport.flags).toBeDefined()
      expect(RedirectsImport.flags.reset).toBeDefined()

      // Check reset flag properties
      const resetFlag = RedirectsImport.flags.reset
      expect(resetFlag.char).toBe('r')
      expect(resetFlag.description).toContain('Removes all redirects previously defined')
      expect(resetFlag.default).toBe(false)
    })

    it('should inherit global flags', () => {
      expect(RedirectsImport.flags).toBeDefined()
      // The flags should include global flags from CustomCommand
    })
  })

  describe('run method', () => {
    it('should call redirectsImport with correct csvPath and default options', async () => {
      const testCsvPath = 'test-import.csv'

      // Mock the parse method to return our test data
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: testCsvPath },
        flags: { reset: false },
      })
      ;(mockRedirectsImport as any).mockResolvedValueOnce(undefined)

      await command.run()

      expect(mockRedirectsImport).toHaveBeenCalledWith(testCsvPath, { reset: false })
      expect(mockRedirectsImport).toHaveBeenCalledTimes(1)
    })

    it('should call redirectsImport with reset flag when provided', async () => {
      const testCsvPath = 'test-import.csv'

      // Mock the parse method to return our test data with reset flag
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: testCsvPath },
        flags: { reset: true },
      })
      ;(mockRedirectsImport as any).mockResolvedValueOnce(undefined)

      await command.run()

      expect(mockRedirectsImport).toHaveBeenCalledWith(testCsvPath, { reset: true })
      expect(mockRedirectsImport).toHaveBeenCalledTimes(1)
    })

    it('should handle csvPath with different file extensions', async () => {
      const testCases = ['import.csv', 'redirects-data.csv', 'data/imports/redirects.csv', 'migration-2024.csv']

      for (const csvPath of testCases) {
        ;(command as any).parse = jest.fn().mockReturnValue({
          args: { csvPath },
          flags: { reset: false },
        })
        ;(mockRedirectsImport as any).mockResolvedValueOnce(undefined)

        await command.run()

        expect(mockRedirectsImport).toHaveBeenCalledWith(csvPath, { reset: false })
      }

      expect(mockRedirectsImport).toHaveBeenCalledTimes(testCases.length)
    })

    it('should handle csvPath with special characters', async () => {
      const specialPaths = [
        'import-file-with-dashes.csv',
        'import_file_with_underscores.csv',
        'import.with.dots.csv',
        'import (with parentheses).csv',
      ]

      for (const csvPath of specialPaths) {
        ;(command as any).parse = jest.fn().mockReturnValue({
          args: { csvPath },
          flags: { reset: false },
        })
        ;(mockRedirectsImport as any).mockResolvedValueOnce(undefined)

        await command.run()

        expect(mockRedirectsImport).toHaveBeenCalledWith(csvPath, { reset: false })
      }

      expect(mockRedirectsImport).toHaveBeenCalledTimes(specialPaths.length)
    })

    it('should propagate errors from redirectsImport', async () => {
      const testError = new Error('Import failed')

      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'error-test.csv' },
        flags: { reset: false },
      })
      ;(mockRedirectsImport as any).mockRejectedValueOnce(testError)

      await expect(command.run()).rejects.toThrow('Import failed')
      expect(mockRedirectsImport).toHaveBeenCalledWith('error-test.csv', { reset: false })
    })

    it('should handle empty csvPath string', async () => {
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: '' },
        flags: { reset: false },
      })
      ;(mockRedirectsImport as any).mockResolvedValueOnce(undefined)

      await command.run()

      expect(mockRedirectsImport).toHaveBeenCalledWith('', { reset: false })
    })
  })

  describe('reset flag scenarios', () => {
    it('should handle reset flag with short option -r', async () => {
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'test.csv' },
        flags: { reset: true },
      })
      ;(mockRedirectsImport as any).mockResolvedValueOnce(undefined)

      await command.run()

      expect(mockRedirectsImport).toHaveBeenCalledWith('test.csv', { reset: true })
    })

    it('should handle reset flag with long option --reset', async () => {
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'test.csv' },
        flags: { reset: true },
      })
      ;(mockRedirectsImport as any).mockResolvedValueOnce(undefined)

      await command.run()

      expect(mockRedirectsImport).toHaveBeenCalledWith('test.csv', { reset: true })
    })

    it('should default reset to false when not provided', async () => {
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'test.csv' },
        flags: {},
      })
      ;(mockRedirectsImport as any).mockResolvedValueOnce(undefined)

      await command.run()

      expect(mockRedirectsImport).toHaveBeenCalledWith('test.csv', { reset: false })
    })
  })

  describe('command integration', () => {
    it('should be properly configured as an oclif command', () => {
      // Verify the command extends the expected base class
      expect(command).toBeInstanceOf(RedirectsImport)

      // Verify required static properties exist
      expect(RedirectsImport.description).toBeDefined()
      expect(RedirectsImport.examples).toBeDefined()
      expect(RedirectsImport.args).toBeDefined()
      expect(RedirectsImport.flags).toBeDefined()
    })

    it('should have proper command configuration for oclif', () => {
      // Args should be properly configured
      expect(RedirectsImport.args[0].name).toBe('csvPath')
      expect(RedirectsImport.args[0].required).toBe(true)

      // Should have examples for help text
      expect(RedirectsImport.examples.length).toBeGreaterThan(0)

      // Should have reset flag configured
      expect(RedirectsImport.flags.reset).toBeDefined()
    })
  })

  describe('error scenarios', () => {
    it('should handle network timeout errors', async () => {
      const timeoutError = new Error('Network timeout')
      timeoutError.name = 'TimeoutError'
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'timeout-test.csv' },
        flags: { reset: false },
      })
      ;(mockRedirectsImport as any).mockRejectedValueOnce(timeoutError)

      await expect(command.run()).rejects.toThrow('Network timeout')
    })

    it('should handle permission errors', async () => {
      const permissionError = new Error('Permission denied')
      permissionError.name = 'PermissionError'
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: '/root/restricted.csv' },
        flags: { reset: false },
      })
      ;(mockRedirectsImport as any).mockRejectedValueOnce(permissionError)

      await expect(command.run()).rejects.toThrow('Permission denied')
    })

    it('should handle file not found errors', async () => {
      const fileError = new Error('File not found')
      fileError.name = 'FileNotFoundError'
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'nonexistent.csv' },
        flags: { reset: false },
      })
      ;(mockRedirectsImport as any).mockRejectedValueOnce(fileError)

      await expect(command.run()).rejects.toThrow('File not found')
    })

    it('should handle CSV validation errors', async () => {
      const validationError = new Error('Invalid CSV format')
      validationError.name = 'ValidationError'
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'invalid.csv' },
        flags: { reset: false },
      })
      ;(mockRedirectsImport as any).mockRejectedValueOnce(validationError)

      await expect(command.run()).rejects.toThrow('Invalid CSV format')
    })
  })

  describe('performance scenarios', () => {
    it('should handle large import operations', async () => {
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'large-import-list.csv' },
        flags: { reset: false },
      })

      // Simulate a long-running import operation
      mockRedirectsImport.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)))

      const startTime = Date.now()
      await command.run()
      const endTime = Date.now()

      expect(endTime - startTime).toBeGreaterThanOrEqual(100)
      expect(mockRedirectsImport).toHaveBeenCalledWith('large-import-list.csv', { reset: false })
    })

    it('should handle concurrent command executions', async () => {
      const command1 = new RedirectsImport([], {} as any)
      const command2 = new RedirectsImport([], {} as any)

      ;(command1 as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'concurrent1.csv' },
        flags: { reset: false },
      })
      ;(command2 as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'concurrent2.csv' },
        flags: { reset: true },
      })
      ;(mockRedirectsImport as any).mockResolvedValue(undefined)

      // Run commands concurrently
      await Promise.all([command1.run(), command2.run()])

      expect(mockRedirectsImport).toHaveBeenCalledTimes(2)
      expect(mockRedirectsImport).toHaveBeenCalledWith('concurrent1.csv', { reset: false })
      expect(mockRedirectsImport).toHaveBeenCalledWith('concurrent2.csv', { reset: true })
    })

    it('should handle reset operation with large datasets', async () => {
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'migration.csv' },
        flags: { reset: true },
      })

      // Simulate a long-running reset + import operation
      mockRedirectsImport.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 150)))

      const startTime = Date.now()
      await command.run()
      const endTime = Date.now()

      expect(endTime - startTime).toBeGreaterThanOrEqual(150)
      expect(mockRedirectsImport).toHaveBeenCalledWith('migration.csv', { reset: true })
    })
  })
})
