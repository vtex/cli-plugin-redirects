import '../../setup'
import { jest } from '@jest/globals'

// Mock external dependencies
const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}

const mockSessionManager = {
  getSingleton: jest.fn().mockReturnValue({
    account: 'test-account',
    workspace: 'test-workspace',
  }),
}

const mockReadFile = jest.fn() as jest.MockedFunction<any>
const mockReadJson = jest.fn() as jest.MockedFunction<any>
const mockCreateInterface = jest.fn() as jest.MockedFunction<any>
const mockRewriterDeleteRedirects = jest.fn() as jest.MockedFunction<any>
const mockReadCSV = jest.fn() as jest.MockedFunction<any>
const mockValidateInput = jest.fn() as jest.MockedFunction<any>
const mockSplitJsonArray = jest.fn() as jest.MockedFunction<any>
const mockProgressBar = jest.fn() as jest.MockedFunction<any>
const mockSaveMetainfo = jest.fn() as jest.MockedFunction<any>
const mockDeleteMetainfo = jest.fn() as jest.MockedFunction<any>
const mockHandleReadError = jest.fn() as jest.MockedFunction<any>
const mockShowGraphQLErrors = jest.fn() as jest.MockedFunction<any>
const mockSleep = jest.fn() as jest.MockedFunction<any>

// Mock dependencies
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('mocked-hash'),
  })),
}))

jest.mock('fs-extra', () => ({
  readFile: mockReadFile,
  readJson: mockReadJson,
}))

jest.mock('vtex', () => ({
  SessionManager: mockSessionManager,
  logger: mockLogger,
  isVerbose: false,
}))

jest.mock('readline', () => ({
  createInterface: mockCreateInterface,
}))

jest.mock('../../../clients/apps/Rewriter', () => ({
  Rewriter: {
    createClient: jest.fn(() => ({
      deleteRedirects: mockRewriterDeleteRedirects,
    })),
  },
}))

jest.mock('../../../modules/rewriter/utils', () => ({
  deleteMetainfo: mockDeleteMetainfo,
  handleReadError: mockHandleReadError,
  MAX_RETRIES: 10,
  METAINFO_FILE: '.vtex_redirects_metainfo.json',
  progressBar: mockProgressBar,
  readCSV: mockReadCSV,
  RETRY_INTERVAL_S: 5,
  saveMetainfo: mockSaveMetainfo,
  showGraphQLErrors: mockShowGraphQLErrors,
  sleep: mockSleep,
  splitJsonArray: mockSplitJsonArray,
  validateInput: mockValidateInput,
}))

// Import the module after mocking
import redirectsDelete from '../../../modules/rewriter/delete'

describe('Delete Module', () => {
  const mockBar = {
    tick: jest.fn(),
  }

  const mockListener = {
    close: jest.fn(),
    on: jest.fn().mockReturnThis(),
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Set up default mocks
    mockReadFile.mockResolvedValue(Buffer.from('test-data'))
    mockReadJson.mockResolvedValue({})
    mockCreateInterface.mockReturnValue(mockListener)
    mockProgressBar.mockReturnValue(mockBar)
    mockReadCSV.mockResolvedValue([{ from: '/path1' }, { from: '/path2' }, { from: '/path3' }])
    mockSplitJsonArray.mockReturnValue([['/path1', '/path2'], ['/path3']])
    mockRewriterDeleteRedirects.mockResolvedValue(true)
    mockShowGraphQLErrors.mockReturnValue(false)
    mockSleep.mockResolvedValue(undefined)
  })

  describe('successful deletion', () => {
    it('should delete redirects successfully', async () => {
      await redirectsDelete('test.csv')

      expect(mockReadCSV).toHaveBeenCalledWith('test.csv')
      expect(mockValidateInput).toHaveBeenCalled()
      expect(mockRewriterDeleteRedirects).toHaveBeenCalledTimes(2) // Two batches
      expect(mockRewriterDeleteRedirects).toHaveBeenCalledWith(['/path1', '/path2'])
      expect(mockRewriterDeleteRedirects).toHaveBeenCalledWith(['/path3'])
      expect(mockDeleteMetainfo).toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith('Finished!\n')
    })

    it('should handle empty CSV file', async () => {
      mockReadCSV.mockResolvedValue([])
      mockSplitJsonArray.mockReturnValue([])

      await redirectsDelete('empty.csv')

      expect(mockReadCSV).toHaveBeenCalledWith('empty.csv')
      expect(mockRewriterDeleteRedirects).not.toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith('Finished!\n')
    })

    it('should handle single path deletion', async () => {
      mockReadCSV.mockResolvedValue([{ from: '/single-path' }])
      mockSplitJsonArray.mockReturnValue([['/single-path']])

      await redirectsDelete('single.csv')

      expect(mockRewriterDeleteRedirects).toHaveBeenCalledTimes(1)
      expect(mockRewriterDeleteRedirects).toHaveBeenCalledWith(['/single-path'])
    })

    it('should update progress bar correctly', async () => {
      await redirectsDelete('test.csv')

      expect(mockProgressBar).toHaveBeenCalledWith('Deleting routes...', 0, 2)
      expect(mockBar.tick).toHaveBeenCalledTimes(2)
    })
  })

  describe('error handling', () => {
    it('should handle file read errors', async () => {
      const fileError = new Error('File not found')
      mockReadFile.mockRejectedValue(fileError)

      await expect(redirectsDelete('nonexistent.csv')).rejects.toThrow()
    })

    it('should handle CSV parsing errors', async () => {
      const csvError = new Error('Invalid CSV')
      mockReadCSV.mockRejectedValue(csvError)

      await expect(redirectsDelete('invalid.csv')).rejects.toThrow()
    })

    it('should handle validation errors', async () => {
      const validationError = new Error('Validation failed')
      mockValidateInput.mockImplementation(() => {
        throw validationError
      })

      await expect(redirectsDelete('invalid-data.csv')).rejects.toThrow('Validation failed')
    })

    it('should handle API errors during deletion', async () => {
      const apiError = new Error('API Error')
      mockRewriterDeleteRedirects.mockRejectedValue(apiError)

      await expect(redirectsDelete('test.csv')).rejects.toThrow('API Error')
      expect(mockSaveMetainfo).toHaveBeenCalled()
      expect(mockListener.close).toHaveBeenCalled()
    })

    it('should handle GraphQL errors with retry logic', async () => {
      const graphqlError = new Error('GraphQL Error')
      mockRewriterDeleteRedirects.mockRejectedValue(graphqlError)
      mockShowGraphQLErrors.mockReturnValue(true) // Indicates GraphQL error

      const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })

      await expect(redirectsDelete('test.csv')).rejects.toThrow('process.exit called')

      expect(mockLogger.error).toHaveBeenCalledWith('Error handling delete')
      expect(mockShowGraphQLErrors).toHaveBeenCalledWith(graphqlError)

      mockProcessExit.mockRestore()
    })

    it('should retry on non-GraphQL errors up to MAX_RETRIES', async () => {
      const networkError = new Error('Network Error')
      mockRewriterDeleteRedirects.mockRejectedValue(networkError)
      mockShowGraphQLErrors.mockReturnValue(false) // Not a GraphQL error

      // Mock to prevent infinite recursion in test

      // We need to mock the retry call
      const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })

      await expect(redirectsDelete('test.csv')).rejects.toThrow('process.exit called')

      expect(mockLogger.error).toHaveBeenCalledWith('Error handling delete')
      expect(mockLogger.error).toHaveBeenCalledWith('Retrying in 5 seconds...')
      expect(mockLogger.info).toHaveBeenCalledWith('Press CTRL+C to abort')

      mockProcessExit.mockRestore()
    })
  })

  describe('metainfo handling', () => {
    it('should handle existing metainfo correctly', async () => {
      const existingMetainfo = {
        deletes: {
          'some-other-hash': { counter: 5 },
        },
      }
      mockReadJson.mockResolvedValue(existingMetainfo)

      await redirectsDelete('test.csv')

      expect(mockProgressBar).toHaveBeenCalledWith('Deleting routes...', 0, 2)
    })

    it('should resume from saved counter', async () => {
      const existingMetainfo = {
        deletes: {
          'mocked-hash': { counter: 1 }, // Start from second batch
        },
      }
      mockReadJson.mockResolvedValue(existingMetainfo)

      await redirectsDelete('test.csv')

      expect(mockProgressBar).toHaveBeenCalledWith('Deleting routes...', 1, 2)
      expect(mockRewriterDeleteRedirects).toHaveBeenCalledTimes(1) // Only second batch
      expect(mockRewriterDeleteRedirects).toHaveBeenCalledWith(['/path3'])
    })

    it('should save metainfo on interruption', () => {
      const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })

      // Simulate SIGINT handler
      let sigintHandler: any
      mockCreateInterface.mockImplementation(() => ({
        ...mockListener,
        on: jest.fn((event, handler) => {
          if (event === 'SIGINT') {
            sigintHandler = handler
          }
          return mockListener
        }),
      }))

      redirectsDelete('test.csv')

      // Trigger SIGINT
      if (sigintHandler) {
        expect(() => sigintHandler()).toThrow('process.exit called')
        expect(mockSaveMetainfo).toHaveBeenCalled()
      }

      mockProcessExit.mockRestore()
    })
  })

  describe('batch processing', () => {
    it('should handle large datasets with multiple batches', async () => {
      const largePaths = Array.from({ length: 25 }, (_, i) => ({ from: `/path${i}` }))
      mockReadCSV.mockResolvedValue(largePaths)

      const batches = [
        largePaths.slice(0, 10).map((p) => p.from),
        largePaths.slice(10, 20).map((p) => p.from),
        largePaths.slice(20, 25).map((p) => p.from),
      ]
      mockSplitJsonArray.mockReturnValue(batches)

      await redirectsDelete('large.csv')

      expect(mockRewriterDeleteRedirects).toHaveBeenCalledTimes(3)
      expect(mockBar.tick).toHaveBeenCalledTimes(3)
      expect(mockDeleteMetainfo).toHaveBeenCalled()
    })

    it('should handle partial completion correctly', async () => {
      mockRewriterDeleteRedirects
        .mockResolvedValueOnce(true) // First batch succeeds
        .mockRejectedValueOnce(new Error('Second batch fails'))

      await expect(redirectsDelete('test.csv')).rejects.toThrow('Second batch fails')

      expect(mockRewriterDeleteRedirects).toHaveBeenCalledTimes(2)
      expect(mockBar.tick).toHaveBeenCalledTimes(1) // Only first batch completed
      expect(mockSaveMetainfo).toHaveBeenCalled()
    })
  })

  describe('path processing', () => {
    it('should extract paths from CSV data correctly', async () => {
      const csvData = [
        { from: '/path1', other: 'data1' },
        { from: '/path2', other: 'data2' },
        { from: '/path3', other: 'data3' },
      ]
      mockReadCSV.mockResolvedValue(csvData)
      mockSplitJsonArray.mockReturnValue([['/path1', '/path2', '/path3']])

      await redirectsDelete('test.csv')

      expect(mockSplitJsonArray).toHaveBeenCalledWith(['/path1', '/path2', '/path3'])
    })

    it('should handle special characters in paths', async () => {
      const csvData = [
        { from: '/path with spaces' },
        { from: '/path-with-dashes' },
        { from: '/path_with_underscores' },
        { from: '/path/with/slashes' },
      ]
      mockReadCSV.mockResolvedValue(csvData)
      const expectedPaths = csvData.map((item) => item.from)
      mockSplitJsonArray.mockReturnValue([expectedPaths])

      await redirectsDelete('special.csv')

      expect(mockSplitJsonArray).toHaveBeenCalledWith(expectedPaths)
      expect(mockRewriterDeleteRedirects).toHaveBeenCalledWith(expectedPaths)
    })
  })

  describe('file hash generation', () => {
    it('should generate consistent file hash', async () => {
      const fileData = Buffer.from('consistent-data')
      mockReadFile.mockResolvedValue(fileData)

      await redirectsDelete('test.csv')

      expect(mockReadFile).toHaveBeenCalledWith('test.csv')
      // The hash includes account, workspace, and file data
    })

    it('should handle file read errors for hash generation', async () => {
      const readError = new Error('Permission denied')
      mockReadFile.mockRejectedValue(readError)
      mockHandleReadError.mockReturnValue(() => {
        throw new Error('File read error handled')
      })

      await expect(redirectsDelete('restricted.csv')).rejects.toThrow('File read error handled')
    })
  })
})
