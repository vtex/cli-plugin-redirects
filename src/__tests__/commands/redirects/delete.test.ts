import '../../setup'
import { jest } from '@jest/globals'

// Mock the delete module function
const mockRedirectsDelete = jest.fn()

jest.mock('../../../modules/rewriter/delete.js', () => ({
  __esModule: true,
  default: mockRedirectsDelete,
}))

// Import the command after mocking
import RedirectsDelete from '../../../commands/redirects/delete.js'

describe('RedirectsDelete Command', () => {
  let command: RedirectsDelete

  beforeEach(() => {
    jest.clearAllMocks()
    command = new RedirectsDelete([], {} as any)
  })

  describe('static properties', () => {
    it('should have correct description', () => {
      expect(RedirectsDelete.description).toContain('Deletes redirects')
      expect(RedirectsDelete.description).toContain('account')
      expect(RedirectsDelete.description).toContain('workspace')
    })

    it('should have correct examples', () => {
      expect(RedirectsDelete.examples).toHaveLength(1)
      expect(RedirectsDelete.examples[0]).toContain('vtex redirects delete')
      expect(RedirectsDelete.examples[0]).toContain('csvPath')
    })

    it('should have correct args configuration', () => {
      expect(RedirectsDelete.args).toHaveLength(1)

      const csvPathArg = RedirectsDelete.args[0]
      expect(csvPathArg.name).toBe('csvPath')
      expect(csvPathArg.required).toBe(true)
      expect(csvPathArg.description).toContain('CSV file containing the URL paths to delete')
    })

    it('should inherit global flags', () => {
      expect(RedirectsDelete.flags).toBeDefined()
      // The flags should include global flags from CustomCommand
    })
  })

  describe('run method', () => {
    it('should call redirectsDelete with correct csvPath', async () => {
      const testCsvPath = 'test-delete.csv'

      // Mock the parse method to return our test data
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: testCsvPath },
        flags: {},
      })
      ;(mockRedirectsDelete as any).mockResolvedValueOnce(undefined)

      await command.run()

      expect(mockRedirectsDelete).toHaveBeenCalledWith(testCsvPath)
      expect(mockRedirectsDelete).toHaveBeenCalledTimes(1)
    })

    it('should handle csvPath with different file extensions', async () => {
      const testCases = ['delete.csv', 'paths-to-remove.csv', 'data/deletes/paths.csv', 'cleanup-2024.csv']

      for (const csvPath of testCases) {
        ;(command as any).parse = jest.fn().mockReturnValue({
          args: { csvPath },
          flags: {},
        })
        ;(mockRedirectsDelete as any).mockResolvedValueOnce(undefined)

        await command.run()

        expect(mockRedirectsDelete).toHaveBeenCalledWith(csvPath)
      }

      expect(mockRedirectsDelete).toHaveBeenCalledTimes(testCases.length)
    })

    it('should handle csvPath with special characters', async () => {
      const specialPaths = [
        'delete-file-with-dashes.csv',
        'delete_file_with_underscores.csv',
        'delete.with.dots.csv',
        'delete (with parentheses).csv',
      ]

      for (const csvPath of specialPaths) {
        ;(command as any).parse = jest.fn().mockReturnValue({
          args: { csvPath },
          flags: {},
        })
        ;(mockRedirectsDelete as any).mockResolvedValueOnce(undefined)

        await command.run()

        expect(mockRedirectsDelete).toHaveBeenCalledWith(csvPath)
      }

      expect(mockRedirectsDelete).toHaveBeenCalledTimes(specialPaths.length)
    })

    it('should propagate errors from redirectsDelete', async () => {
      const testError = new Error('Delete failed')

      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'error-test.csv' },
        flags: {},
      })
      ;(mockRedirectsDelete as any).mockRejectedValueOnce(testError)

      await expect(command.run()).rejects.toThrow('Delete failed')
      expect(mockRedirectsDelete).toHaveBeenCalledWith('error-test.csv')
    })

    it('should handle empty csvPath string', async () => {
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: '' },
        flags: {},
      })
      ;(mockRedirectsDelete as any).mockResolvedValueOnce(undefined)

      await command.run()

      expect(mockRedirectsDelete).toHaveBeenCalledWith('')
    })
  })

  describe('command integration', () => {
    it('should be properly configured as an oclif command', () => {
      // Verify the command extends the expected base class
      expect(command).toBeInstanceOf(RedirectsDelete)

      // Verify required static properties exist
      expect(RedirectsDelete.description).toBeDefined()
      expect(RedirectsDelete.examples).toBeDefined()
      expect(RedirectsDelete.args).toBeDefined()
      expect(RedirectsDelete.flags).toBeDefined()
    })

    it('should have proper command configuration for oclif', () => {
      // Args should be properly configured
      expect(RedirectsDelete.args[0].name).toBe('csvPath')
      expect(RedirectsDelete.args[0].required).toBe(true)

      // Should have examples for help text
      expect(RedirectsDelete.examples.length).toBeGreaterThan(0)
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
      ;(mockRedirectsDelete as any).mockRejectedValueOnce(timeoutError)

      await expect(command.run()).rejects.toThrow('Network timeout')
    })

    it('should handle permission errors', async () => {
      const permissionError = new Error('Permission denied')
      permissionError.name = 'PermissionError'
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: '/root/restricted.csv' },
        flags: {},
      })
      ;(mockRedirectsDelete as any).mockRejectedValueOnce(permissionError)

      await expect(command.run()).rejects.toThrow('Permission denied')
    })

    it('should handle file not found errors', async () => {
      const fileError = new Error('File not found')
      fileError.name = 'FileNotFoundError'
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'nonexistent.csv' },
        flags: {},
      })
      ;(mockRedirectsDelete as any).mockRejectedValueOnce(fileError)

      await expect(command.run()).rejects.toThrow('File not found')
    })
  })

  describe('performance scenarios', () => {
    it('should handle large delete operations', async () => {
      ;(command as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'large-delete-list.csv' },
        flags: {},
      })

      // Simulate a long-running delete operation
      mockRedirectsDelete.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)))

      const startTime = Date.now()
      await command.run()
      const endTime = Date.now()

      expect(endTime - startTime).toBeGreaterThanOrEqual(100)
      expect(mockRedirectsDelete).toHaveBeenCalledWith('large-delete-list.csv')
    })

    it('should handle concurrent command executions', async () => {
      const command1 = new RedirectsDelete([], {} as any)
      const command2 = new RedirectsDelete([], {} as any)

      ;(command1 as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'concurrent1.csv' },
        flags: {},
      })
      ;(command2 as any).parse = jest.fn().mockReturnValue({
        args: { csvPath: 'concurrent2.csv' },
        flags: {},
      })
      ;(mockRedirectsDelete as any).mockResolvedValue(undefined)

      // Run commands concurrently
      await Promise.all([command1.run(), command2.run()])

      expect(mockRedirectsDelete).toHaveBeenCalledTimes(2)
      expect(mockRedirectsDelete).toHaveBeenCalledWith('concurrent1.csv')
      expect(mockRedirectsDelete).toHaveBeenCalledWith('concurrent2.csv')
    })
  })
})
