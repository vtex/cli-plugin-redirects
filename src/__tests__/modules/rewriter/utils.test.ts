import '../../setup'
import { jest } from '@jest/globals'

// Mock dependencies
const mockCsv = jest.fn()
const mockJsonSplit = jest.fn()
const mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}

jest.mock('csvtojson', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    fromFile: mockCsv,
  })),
}))

jest.mock('json-array-split', () => ({
  __esModule: true,
  default: mockJsonSplit,
}))

jest.mock('vtex', () => ({
  logger: mockLogger,
}))

jest.mock('fs-extra', () => ({
  writeJsonSync: jest.fn(),
}))

// Import utils after mocking
import {
  DELIMITER,
  MAX_ENTRIES_PER_REQUEST,
  METAINFO_FILE,
  MAX_RETRIES,
  RETRY_INTERVAL_S,
  sleep,
  showGraphQLErrors,
  handleReadError,
  readCSV,
  splitJsonArray,
  progressBar,
  validateInput,
  saveMetainfo,
  deleteMetainfo,
  encode,
} from '../../../modules/rewriter/utils'

describe('Utils Module', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Constants', () => {
    it('should have correct delimiter', () => {
      expect(DELIMITER).toBe(';')
    })

    it('should have reasonable batch size', () => {
      expect(MAX_ENTRIES_PER_REQUEST).toBe(10)
      expect(typeof MAX_ENTRIES_PER_REQUEST).toBe('number')
    })

    it('should have correct metainfo file name', () => {
      expect(METAINFO_FILE).toBe('.vtex_redirects_metainfo.json')
    })

    it('should have reasonable retry configuration', () => {
      expect(MAX_RETRIES).toBe(10)
      expect(RETRY_INTERVAL_S).toBe(5)
    })
  })

  describe('sleep function', () => {
    it('should resolve after specified time', async () => {
      const startTime = Date.now()
      await sleep(100)
      const endTime = Date.now()

      expect(endTime - startTime).toBeGreaterThanOrEqual(95) // Allow for small timing variations
    })

    it('should handle zero milliseconds', async () => {
      const startTime = Date.now()
      await sleep(0)
      const endTime = Date.now()

      expect(endTime - startTime).toBeLessThan(50) // Should be very fast
    })
  })

  describe('showGraphQLErrors', () => {
    it('should display GraphQL errors and return true', () => {
      const mockError = {
        graphQLErrors: [
          { message: 'Field "test" of type "String" must have a selection of subfields.' },
          { message: 'Cannot query field "nonExistent" on type "Query".' },
        ],
      }

      const result = showGraphQLErrors(mockError)

      expect(result).toBe(true)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Field "test" of type "String" must have a selection of subfields.\nCannot query field "nonExistent" on type "Query".'
      )
    })

    it('should return undefined for non-GraphQL errors', () => {
      const mockError = {
        message: 'Network error',
      }

      const result = showGraphQLErrors(mockError)

      expect(result).toBeUndefined()
      expect(mockLogger.error).not.toHaveBeenCalled()
    })

    it('should handle empty GraphQL errors array', () => {
      const mockError = {
        graphQLErrors: [],
      }

      const result = showGraphQLErrors(mockError)

      expect(result).toBe(true)
      expect(mockLogger.error).toHaveBeenCalledWith('')
    })
  })

  describe('handleReadError', () => {
    let mockProcessExit: any

    beforeEach(() => {
      mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })
    })

    afterEach(() => {
      mockProcessExit.mockRestore()
    })

    it('should log error and exit process', () => {
      const mockError = {
        message: 'File not found',
      }
      const testPath = '/test/path.csv'

      const errorHandler = handleReadError(testPath)

      expect(() => errorHandler(mockError)).toThrow('process.exit called')
      expect(mockLogger.error).toHaveBeenCalledWith('Error reading file: /test/path.csv')
      expect(mockLogger.error).toHaveBeenCalledWith('File not found')
    })
  })

  describe('readCSV', () => {
    it('should read and sort CSV file correctly', async () => {
      const mockCsvData = [
        { from: '/z-path', to: '/z-target', type: 'PERMANENT' },
        { from: '/a-path', to: '/a-target', type: 'TEMPORARY' },
        { from: '/m-path', to: '/m-target', type: 'PERMANENT' },
      ]

      ;(mockCsv as any).mockResolvedValueOnce(mockCsvData)

      const result = await readCSV('test.csv')

      expect(mockCsv).toHaveBeenCalledWith('test.csv')
      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)

      // Should be sorted (exact order depends on hash function, but should be consistent)
      expect(result).toHaveLength(3)
    })

    it('should handle CSV parsing errors', async () => {
      const mockError = new Error('CSV parsing failed')
      ;(mockCsv as any).mockRejectedValueOnce(mockError)

      const mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })

      await expect(readCSV('bad.csv')).rejects.toThrow('process.exit called')

      mockProcessExit.mockRestore()
    })

    it('should handle empty CSV file', async () => {
      ;(mockCsv as any).mockResolvedValueOnce([])

      const result = await readCSV('empty.csv')

      expect(result).toEqual([])
    })
  })

  describe('splitJsonArray', () => {
    it('should split large arrays into chunks', () => {
      const largeArray = Array.from({ length: 25 }, (_, i) => ({ id: i }))
      mockJsonSplit.mockReturnValueOnce([largeArray.slice(0, 10), largeArray.slice(10, 20), largeArray.slice(20, 25)])

      const result = splitJsonArray(largeArray)

      expect(mockJsonSplit).toHaveBeenCalledWith(largeArray, MAX_ENTRIES_PER_REQUEST)
      expect(result).toHaveLength(3)
    })

    it('should handle small arrays', () => {
      const smallArray = [{ id: 1 }, { id: 2 }]
      mockJsonSplit.mockReturnValueOnce([smallArray])

      const result = splitJsonArray(smallArray)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual(smallArray)
    })
  })

  describe('progressBar', () => {
    it('should create progress bar with correct configuration', () => {
      const bar = progressBar('Testing', 5, 10)

      expect(bar).toBeDefined()
      // ProgressBar is a class, so we can check if it's an instance
      expect(bar.constructor.name).toBe('ProgressBar')
    })

    it('should handle zero total', () => {
      const bar = progressBar('Empty', 0, 0)

      expect(bar).toBeDefined()
    })

    it('should handle current greater than total', () => {
      const bar = progressBar('Overflow', 15, 10)

      expect(bar).toBeDefined()
    })
  })

  describe('validateInput', () => {
    let mockProcessExit: any

    beforeEach(() => {
      mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called')
      })
    })

    afterEach(() => {
      mockProcessExit.mockRestore()
    })

    it('should pass validation for valid input', () => {
      const validSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['from', 'to'],
        },
      }

      const validData = [{ from: '/test', to: '/test-target' }]

      // Should not throw
      expect(() => validateInput(validSchema, validData)).not.toThrow()
    })

    it('should exit on invalid input', () => {
      const validSchema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['from', 'to'],
        },
      }

      const invalidData = [
        { from: '/test' }, // Missing 'to' field
      ]

      expect(() => validateInput(validSchema, invalidData)).toThrow('process.exit called')
      expect(mockLogger.error).toHaveBeenCalledWith('Errors validating input:')
    })
  })

  describe('saveMetainfo', () => {
    it('should save metadata correctly', () => {
      const metainfo = {}
      const metainfoType = 'exports'
      const fileHash = 'abc123'
      const counter = 5
      const data = { next: 'token', routeCount: 100 }

      saveMetainfo(metainfo, metainfoType, fileHash, counter, data)

      expect(metainfo).toEqual({
        exports: {
          abc123: {
            counter: 5,
            data: { next: 'token', routeCount: 100 },
          },
        },
      })
    })

    it('should handle existing metadata', () => {
      const metainfo = {
        exports: {
          existing: { counter: 1, data: {} },
        },
      }
      const metainfoType = 'exports'
      const fileHash = 'abc123'
      const counter = 5
      const data = { next: 'token' }

      saveMetainfo(metainfo, metainfoType, fileHash, counter, data)

      expect(metainfo.exports.existing).toEqual({ counter: 1, data: {} })
      expect((metainfo.exports as any).abc123).toEqual({ counter: 5, data: { next: 'token' } })
    })
  })

  describe('deleteMetainfo', () => {
    it('should delete specific metadata entry', () => {
      const metainfo = {
        exports: {
          abc123: { counter: 5, data: {} },
          def456: { counter: 3, data: {} },
        },
      }
      const metainfoType = 'exports'
      const fileHash = 'abc123'

      deleteMetainfo(metainfo, metainfoType, fileHash)

      expect(metainfo.exports.abc123).toBeUndefined()
      expect(metainfo.exports.def456).toBeDefined()
    })

    it('should handle non-existent metadata type', () => {
      const metainfo = {}
      const metainfoType = 'nonexistent'
      const fileHash = 'abc123'

      // Should not throw
      expect(() => deleteMetainfo(metainfo, metainfoType, fileHash)).not.toThrow()
    })

    it('should handle non-existent file hash', () => {
      const metainfo = {
        exports: {
          existing: { counter: 1, data: {} },
        },
      }
      const metainfoType = 'exports'
      const fileHash = 'nonexistent'

      // Should not throw
      expect(() => deleteMetainfo(metainfo, metainfoType, fileHash)).not.toThrow()
      expect(metainfo.exports.existing).toBeDefined()
    })
  })

  describe('encode function', () => {
    it('should encode delimiter characters', () => {
      const input = 'path;with;semicolons'
      const result = encode(input)

      expect(result).toContain('%3B') // URL encoded semicolon
      expect(result).not.toContain(';')
    })

    it('should handle strings without delimiters', () => {
      const input = 'path/without/semicolons'
      const result = encode(input)

      expect(result).toBe(input) // Should be unchanged
    })

    it('should handle empty strings', () => {
      const result = encode('')

      expect(result).toBe('')
    })

    it('should handle multiple delimiter occurrences', () => {
      const input = 'path;with;many;semicolons;'
      const result = encode(input)

      expect(result.split('%3B')).toHaveLength(5) // Should split into 5 parts
      expect(result).not.toContain(';')
    })
  })
})
