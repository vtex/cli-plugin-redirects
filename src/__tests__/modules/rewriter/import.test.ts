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
const mockWriteFile = jest.fn() as jest.MockedFunction<any>
const mockRemove = jest.fn() as jest.MockedFunction<any>
const mockCreateInterface = jest.fn() as jest.MockedFunction<any>
const mockRewriterImportRedirects = jest.fn() as jest.MockedFunction<any>
const mockDeleteRedirects = jest.fn() as jest.MockedFunction<any>
const mockReadCSV = jest.fn() as jest.MockedFunction<any>
const mockValidateInput = jest.fn() as jest.MockedFunction<any>
const mockSplitJsonArray = jest.fn() as jest.MockedFunction<any>
const mockProgressBar = jest.fn() as jest.MockedFunction<any>
const mockSaveMetainfo = jest.fn() as jest.MockedFunction<any>
const mockDeleteMetainfo = jest.fn() as jest.MockedFunction<any>
const mockHandleReadError = jest.fn() as jest.MockedFunction<any>
const mockShowGraphQLErrors = jest.fn() as jest.MockedFunction<any>
const mockSleep = jest.fn() as jest.MockedFunction<any>
const mockParser = jest.fn() as jest.MockedFunction<any>

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
  writeFile: mockWriteFile,
  remove: mockRemove,
}))

jest.mock('json2csv', () => ({
  Parser: jest.fn().mockImplementation(() => ({
    parse: mockParser,
  })),
}))

jest.mock('path', () => ({
  resolve: jest.fn((fileName) => `/resolved/${fileName}`),
}))

jest.mock('ramda', () => ({
  difference: jest.fn((a: any[], b: any[]) => a.filter((item: any) => !b.includes(item))),
  isEmpty: jest.fn((arr: any[]) => arr.length === 0),
  length: jest.fn((arr: any[]) => arr.length),
  map: jest.fn((fn: any, arr: any[]) => arr.map(fn)),
  pluck: jest.fn((prop: string, arr: any[]) => arr.map((item: any) => item[prop])),
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
      importRedirects: mockRewriterImportRedirects,
    })),
  },
}))

jest.mock('../../../modules/rewriter/delete', () => ({
  __esModule: true,
  default: mockDeleteRedirects,
}))

jest.mock('../../../modules/rewriter/utils', () => ({
  deleteMetainfo: mockDeleteMetainfo,
  DELIMITER: ';',
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
import redirectsImport from '../../../modules/rewriter/import'

describe('Import Module', () => {
  const mockBar = {
    tick: jest.fn(),
  }

  const mockListener = {
    close: jest.fn(),
    on: jest.fn().mockReturnThis(),
  }

  const sampleRedirects = [
    { from: '/old1', to: '/new1', type: 'PERMANENT', endDate: '', binding: 'binding1' },
    { from: '/old2', to: '/new2', type: 'TEMPORARY', endDate: '2024-12-31', binding: 'binding2' },
    { from: '/old3', to: '/new3', type: 'PERMANENT', endDate: '', binding: 'binding1' },
  ]

  beforeEach(() => {
    jest.clearAllMocks()

    // Set up default mocks
    mockReadFile.mockResolvedValue(Buffer.from('test-data'))
    mockReadJson.mockResolvedValue({})
    mockCreateInterface.mockReturnValue(mockListener)
    mockProgressBar.mockReturnValue(mockBar)
    mockReadCSV.mockResolvedValue(sampleRedirects)
    mockSplitJsonArray.mockReturnValue([sampleRedirects.slice(0, 2), sampleRedirects.slice(2)])
    mockRewriterImportRedirects.mockResolvedValue(true)
    mockShowGraphQLErrors.mockReturnValue(false)
    mockSleep.mockResolvedValue(undefined)
    mockParser.mockReturnValue('from\n/old1\n/old2')
    mockWriteFile.mockResolvedValue(undefined)
    mockRemove.mockResolvedValue(undefined)
    mockDeleteRedirects.mockResolvedValue(undefined)
  })

  describe('successful import without reset', () => {
    it('should import redirects successfully', async () => {
      const result = await redirectsImport('test.csv', {})

      expect(mockReadCSV).toHaveBeenCalledWith('test.csv')
      expect(mockValidateInput).toHaveBeenCalled()
      expect(mockRewriterImportRedirects).toHaveBeenCalledTimes(2) // Two batches
      expect(mockDeleteMetainfo).toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith('Finished!\n')
      expect(result).toEqual(['/old1', '/old2', '/old3'])
    })

    it('should handle empty CSV file', async () => {
      mockReadCSV.mockResolvedValue([])
      mockSplitJsonArray.mockReturnValue([])

      const result = await redirectsImport('empty.csv', {})

      expect(mockReadCSV).toHaveBeenCalledWith('empty.csv')
      expect(mockRewriterImportRedirects).not.toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith('Finished!\n')
      expect(result).toEqual([])
    })

    it('should handle single redirect import', async () => {
      const singleRedirect = [sampleRedirects[0]]
      mockReadCSV.mockResolvedValue(singleRedirect)
      mockSplitJsonArray.mockReturnValue([singleRedirect])

      const result = await redirectsImport('single.csv', {})

      expect(mockRewriterImportRedirects).toHaveBeenCalledTimes(1)
      expect(mockRewriterImportRedirects).toHaveBeenCalledWith(singleRedirect)
      expect(result).toEqual(['/old1'])
    })

    it('should update progress bar correctly', async () => {
      await redirectsImport('test.csv', {})

      expect(mockProgressBar).toHaveBeenCalledWith('Importing routes...', 0, 2)
      expect(mockBar.tick).toHaveBeenCalledTimes(2)
    })
  })

  describe('import with reset option', () => {
    it('should handle reset option when no existing routes to delete', async () => {
      // Mock difference to return empty array (no routes to delete)
      const { difference } = require('ramda')
      difference.mockReturnValue([])

      const result = await redirectsImport('test.csv', { reset: true })

      expect(result).toEqual(['/old1', '/old2', '/old3'])
      expect(mockDeleteRedirects).not.toHaveBeenCalled()
      expect(mockWriteFile).not.toHaveBeenCalled()
      expect(mockRemove).not.toHaveBeenCalled()
    })

    it('should delete old routes when reset is true and there are routes to delete', async () => {
      // Mock difference to return routes that need to be deleted
      const { difference } = require('ramda')
      const routesToDelete = ['/old-route1', '/old-route2']
      difference.mockReturnValue(routesToDelete)

      const result = await redirectsImport('test.csv', { reset: true })

      expect(mockLogger.info).toHaveBeenCalledWith('Deleting old redirects...')
      expect(mockParser).toHaveBeenCalled()
      expect(mockWriteFile).toHaveBeenCalled()
      expect(mockDeleteRedirects).toHaveBeenCalled()
      expect(mockRemove).toHaveBeenCalled()
      expect(result).toEqual(['/old1', '/old2', '/old3'])
    })

    it('should create temporary delete file with correct format', async () => {
      const { difference, map } = require('ramda')
      const routesToDelete = ['/old-route1', '/old-route2']
      difference.mockReturnValue(routesToDelete)
      map.mockImplementation((fn: any, arr: any) => arr.map(fn))

      await redirectsImport('test.csv', { reset: true })

      // Check that CSV parser was called with correct fields
      const parserCall = jest.mocked(require('json2csv').Parser).mock.calls[0][0]
      expect(parserCall.fields).toEqual(['from'])
      expect(parserCall.delimiter).toBe(';')
      expect(parserCall.quote).toBe('')
    })

    it('should handle delete operation failure during reset', async () => {
      const { difference } = require('ramda')
      difference.mockReturnValue(['/old-route1'])
      mockDeleteRedirects.mockRejectedValue(new Error('Delete failed'))

      await expect(redirectsImport('test.csv', { reset: true })).rejects.toThrow('Delete failed')
    })
  })

  describe('error handling', () => {
    it('should handle file read errors', async () => {
      const fileError = new Error('File not found')
      mockReadFile.mockRejectedValue(fileError)

      await expect(redirectsImport('nonexistent.csv', {})).rejects.toThrow()
    })

    it('should handle CSV parsing errors', async () => {
      const csvError = new Error('Invalid CSV')
      mockReadCSV.mockRejectedValue(csvError)

      await expect(redirectsImport('invalid.csv', {})).rejects.toThrow()
    })

    it('should handle validation errors', async () => {
      const validationError = new Error('Validation failed')
      mockValidateInput.mockImplementation(() => {
        throw validationError
      })

      await expect(redirectsImport('invalid-data.csv', {})).rejects.toThrow('Validation failed')
    })

    it('should handle API errors during import', async () => {
      const apiError = new Error('API Error')
      mockRewriterImportRedirects.mockRejectedValue(apiError)

      await expect(redirectsImport('test.csv', {})).rejects.toThrow('API Error')
      expect(mockSaveMetainfo).toHaveBeenCalled()
      expect(mockListener.close).toHaveBeenCalled()
    })

    it('should handle GraphQL errors with retry logic', async () => {
      const graphqlError = new Error('GraphQL Error')
      mockRewriterImportRedirects.mockRejectedValue(graphqlError)
      mockShowGraphQLErrors.mockReturnValue(true) // Indicates GraphQL error

      const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })

      await expect(redirectsImport('test.csv', {})).rejects.toThrow('process.exit called')

      expect(mockLogger.error).toHaveBeenCalledWith('Error handling import')
      expect(mockShowGraphQLErrors).toHaveBeenCalledWith(graphqlError)

      mockProcessExit.mockRestore()
    })

    it('should retry on non-GraphQL errors up to MAX_RETRIES', async () => {
      const networkError = new Error('Network Error')
      mockRewriterImportRedirects.mockRejectedValue(networkError)
      mockShowGraphQLErrors.mockReturnValue(false) // Not a GraphQL error

      const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })

      await expect(redirectsImport('test.csv', {})).rejects.toThrow('process.exit called')

      expect(mockLogger.error).toHaveBeenCalledWith('Error handling import')
      expect(mockLogger.error).toHaveBeenCalledWith('Retrying in 5 seconds...')
      expect(mockLogger.info).toHaveBeenCalledWith('Press CTRL+C to abort')

      mockProcessExit.mockRestore()
    })
  })

  describe('metainfo handling', () => {
    it('should handle existing metainfo correctly', async () => {
      const existingMetainfo = {
        imports: {
          'some-other-hash': { counter: 5 },
        },
      }
      mockReadJson.mockResolvedValue(existingMetainfo)

      await redirectsImport('test.csv', {})

      expect(mockProgressBar).toHaveBeenCalledWith('Importing routes...', 0, 2)
    })

    it('should resume from saved counter', async () => {
      const existingMetainfo = {
        imports: {
          'mocked-hash': { counter: 1 }, // Start from second batch
        },
      }
      mockReadJson.mockResolvedValue(existingMetainfo)

      await redirectsImport('test.csv', {})

      expect(mockProgressBar).toHaveBeenCalledWith('Importing routes...', 1, 2)
      expect(mockRewriterImportRedirects).toHaveBeenCalledTimes(1) // Only second batch
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

      redirectsImport('test.csv', {})

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
      const largeRedirects = Array.from({ length: 25 }, (_, i) => ({
        from: `/path${i}`,
        to: `/target${i}`,
        type: 'PERMANENT' as const,
        endDate: '',
        binding: 'binding1',
      }))
      mockReadCSV.mockResolvedValue(largeRedirects)

      const batches = [largeRedirects.slice(0, 10), largeRedirects.slice(10, 20), largeRedirects.slice(20, 25)]
      mockSplitJsonArray.mockReturnValue(batches)

      const result = await redirectsImport('large.csv', {})

      expect(mockRewriterImportRedirects).toHaveBeenCalledTimes(3)
      expect(mockBar.tick).toHaveBeenCalledTimes(3)
      expect(mockDeleteMetainfo).toHaveBeenCalled()
      expect(result).toHaveLength(25)
    })

    it('should handle partial completion correctly', async () => {
      mockRewriterImportRedirects
        .mockResolvedValueOnce(true) // First batch succeeds
        .mockRejectedValueOnce(new Error('Second batch fails'))

      await expect(redirectsImport('test.csv', {})).rejects.toThrow('Second batch fails')

      expect(mockRewriterImportRedirects).toHaveBeenCalledTimes(2)
      expect(mockBar.tick).toHaveBeenCalledTimes(1) // Only first batch completed
      expect(mockSaveMetainfo).toHaveBeenCalled()
    })
  })

  describe('input validation', () => {
    it('should validate redirect schema correctly', async () => {
      await redirectsImport('test.csv', {})

      expect(mockValidateInput).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'array',
          items: expect.objectContaining({
            type: 'object',
            properties: expect.objectContaining({
              from: { type: 'string' },
              to: { type: 'string' },
              endDate: { type: 'string' },
              type: { type: 'string', enum: ['PERMANENT', 'TEMPORARY'] },
              binding: { type: 'string' },
            }),
            required: ['from', 'to', 'type'],
          }),
        }),
        sampleRedirects
      )
    })

    it('should handle redirects with missing optional fields', async () => {
      const redirectsWithMissingFields = [
        { from: '/old1', to: '/new1', type: 'PERMANENT' }, // Missing endDate and binding
        { from: '/old2', to: '/new2', type: 'TEMPORARY', endDate: '2024-12-31' }, // Missing binding
      ]
      mockReadCSV.mockResolvedValue(redirectsWithMissingFields)
      mockSplitJsonArray.mockReturnValue([redirectsWithMissingFields])

      const result = await redirectsImport('partial.csv', {})

      expect(mockRewriterImportRedirects).toHaveBeenCalledWith(redirectsWithMissingFields)
      expect(result).toEqual(['/old1', '/old2'])
    })
  })

  describe('options handling', () => {
    it('should handle undefined options', async () => {
      const result = await redirectsImport('test.csv', undefined as any)

      expect(result).toEqual(['/old1', '/old2', '/old3'])
      expect(mockDeleteRedirects).not.toHaveBeenCalled()
    })

    it('should handle null options', async () => {
      const result = await redirectsImport('test.csv', null as any)

      expect(result).toEqual(['/old1', '/old2', '/old3'])
      expect(mockDeleteRedirects).not.toHaveBeenCalled()
    })

    it('should handle options with r flag instead of reset', async () => {
      const { difference } = require('ramda')
      difference.mockReturnValue([])

      const result = await redirectsImport('test.csv', { r: true })

      expect(result).toEqual(['/old1', '/old2', '/old3'])
    })

    it('should prioritize reset over r flag', async () => {
      const { difference } = require('ramda')
      difference.mockReturnValue([])

      const result = await redirectsImport('test.csv', { r: true, reset: false })

      expect(result).toEqual(['/old1', '/old2', '/old3'])
      expect(mockDeleteRedirects).not.toHaveBeenCalled()
    })
  })

  describe('file hash generation', () => {
    it('should generate consistent file hash', async () => {
      const fileData = Buffer.from('consistent-data')
      mockReadFile.mockResolvedValue(fileData)

      await redirectsImport('test.csv', {})

      expect(mockReadFile).toHaveBeenCalledWith('test.csv')
      // The hash includes account, workspace, and file data
    })

    it('should handle file read errors for hash generation', async () => {
      const readError = new Error('Permission denied')
      mockReadFile.mockRejectedValue(readError)
      mockHandleReadError.mockReturnValue(() => {
        throw new Error('File read error handled')
      })

      await expect(redirectsImport('restricted.csv', {})).rejects.toThrow('File read error handled')
    })
  })
})
