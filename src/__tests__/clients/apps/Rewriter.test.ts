import '../../setup'
import { jest } from '@jest/globals'
import { IOContext } from '@vtex/api'

// Mock external dependencies
const mockIOClientFactory = {
  createClient: jest.fn(),
}

const mockAppGraphQLClient = jest.fn()

// Mock the AppGraphQLClient constructor
mockAppGraphQLClient.prototype = {
  http: {
    post: jest.fn(),
  },
  graphql: {
    mutate: jest.fn(),
  },
}

jest.mock('@vtex/api', () => ({
  AppGraphQLClient: mockAppGraphQLClient,
}))

jest.mock('vtex', () => ({
  IOClientFactory: mockIOClientFactory,
}))

// Import the class after mocking
import { Rewriter, RedirectInput, Redirect, ExportResponse } from '../../../clients/apps/Rewriter'
import { ParsedUrlQuery } from 'querystring'

describe('Rewriter Client', () => {
  let rewriter: Rewriter
  const mockContext: IOContext = {
    account: 'test-account',
    workspace: 'test-workspace',
    authToken: 'test-token',
    region: 'aws-us-east-1',
    production: false,
    product: '',
    platform: 'test-platform',
    route: { id: 'test-id', params: {} as ParsedUrlQuery },
    userAgent: 'test-agent',
    operationId: 'test-op',
    requestId: 'test-req',
    segmentToken: '',
    sessionToken: '',
    adminUserAuthToken: '',
    storeUserAuthToken: '',
    logger: {} as any,
    tracer: {} as any,
    tracing: {} as any,
    metrics: {} as any,
  }

  const mockOptions = {
    timeout: 5000,
    retries: 3,
    exponentialTimeoutCoefficient: 2,
    initialBackoffDelay: 100,
    exponentialBackoffCoefficient: 2,
    headers: {},
    baseURL: 'https://api.vtex.com',
    params: {},
    verbose: false,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    rewriter = new Rewriter(mockContext, mockOptions)
  })

  describe('constructor', () => {
    it('should call AppGraphQLClient constructor with correct parameters', () => {
      expect(mockAppGraphQLClient).toHaveBeenCalledWith('vtex.rewriter@1.x', mockContext, {
        ...mockOptions,
        headers: { ...mockOptions.headers, 'cache-control': 'no-cache' },
        retries: 5,
        timeout: 10000,
      })
    })

    it('should override specific options', () => {
      const customOptions = {
        ...mockOptions,
        headers: { 'custom-header': 'test' },
        retries: 2,
        timeout: 8000,
      }

      new Rewriter(mockContext, customOptions)

      expect(mockAppGraphQLClient).toHaveBeenCalledWith('vtex.rewriter@1.x', mockContext, {
        ...customOptions,
        headers: { 'custom-header': 'test', 'cache-control': 'no-cache' },
        retries: 5, // Should be overridden
        timeout: 10000, // Should be overridden
      })
    })

    it('should handle empty headers in options', () => {
      const optionsWithoutHeaders = { ...mockOptions }
      delete (optionsWithoutHeaders as any).headers

      new Rewriter(mockContext, optionsWithoutHeaders)

      expect(mockAppGraphQLClient).toHaveBeenCalledWith('vtex.rewriter@1.x', mockContext, {
        ...optionsWithoutHeaders,
        headers: { 'cache-control': 'no-cache' },
        retries: 5,
        timeout: 10000,
      })
    })
  })

  describe('createClient static method', () => {
    it('should create client with default context and options', () => {
      const mockClient = { test: 'client' }
      mockIOClientFactory.createClient.mockReturnValue(mockClient)

      const result = Rewriter.createClient()

      expect(mockIOClientFactory.createClient).toHaveBeenCalledWith(Rewriter, {}, {})
      expect(result).toBe(mockClient)
    })

    it('should create client with custom context', () => {
      const customContext = { account: 'custom-account' }
      const mockClient = { test: 'client' }
      mockIOClientFactory.createClient.mockReturnValue(mockClient)

      const result = Rewriter.createClient(customContext)

      expect(mockIOClientFactory.createClient).toHaveBeenCalledWith(Rewriter, customContext, {})
      expect(result).toBe(mockClient)
    })

    it('should create client with custom options', () => {
      const customOptions = { timeout: 15000 }
      const mockClient = { test: 'client' }
      mockIOClientFactory.createClient.mockReturnValue(mockClient)

      const result = Rewriter.createClient({}, customOptions)

      expect(mockIOClientFactory.createClient).toHaveBeenCalledWith(Rewriter, {}, customOptions)
      expect(result).toBe(mockClient)
    })

    it('should create client with both custom context and options', () => {
      const customContext = { account: 'custom-account' }
      const customOptions = { timeout: 15000 }
      const mockClient = { test: 'client' }
      mockIOClientFactory.createClient.mockReturnValue(mockClient)

      const result = Rewriter.createClient(customContext, customOptions)

      expect(mockIOClientFactory.createClient).toHaveBeenCalledWith(Rewriter, customContext, customOptions)
      expect(result).toBe(mockClient)
    })
  })

  describe('exportRedirects method', () => {
    const mockExportResponse: ExportResponse = {
      routes: [
        { from: '/old1', to: '/new1', type: 'PERMANENT', endDate: '', binding: 'binding1' },
        { from: '/old2', to: '/new2', type: 'TEMPORARY', endDate: '2024-12-31', binding: 'binding2' },
      ],
      next: 'next-token',
    }

    beforeEach(() => {
      // Mock the http property through prototype
      Object.defineProperty(rewriter, 'http', {
        value: {
          post: jest.fn(),
        },
        writable: true,
        configurable: true,
      })
    })

    it('should export redirects without next token', async () => {
      ;(rewriter.http.post as jest.Mock).mockResolvedValue({
        data: {
          redirect: {
            listRedirects: mockExportResponse,
          },
        },
      })

      const result = await rewriter.exportRedirects()

      expect(rewriter.http.post).toHaveBeenCalledWith(
        '',
        {
          query: expect.stringContaining('query ListRedirects'),
          variables: { next: undefined },
        },
        {
          metric: 'rewriter-get-redirects',
        }
      )
      expect(result).toEqual(mockExportResponse)
    })

    it('should export redirects with next token', async () => {
      const nextToken = 'test-token'
      ;(rewriter.http.post as jest.Mock).mockResolvedValue({
        data: {
          redirect: {
            listRedirects: mockExportResponse,
          },
        },
      })

      const result = await rewriter.exportRedirects(nextToken)

      expect(rewriter.http.post).toHaveBeenCalledWith(
        '',
        {
          query: expect.stringContaining('query ListRedirects'),
          variables: { next: nextToken },
        },
        {
          metric: 'rewriter-get-redirects',
        }
      )
      expect(result).toEqual(mockExportResponse)
    })

    it('should handle empty response', async () => {
      ;(rewriter.http.post as jest.Mock).mockResolvedValue({
        data: {
          redirect: {
            listRedirects: {
              routes: [],
              next: undefined,
            },
          },
        },
      })

      const result = await rewriter.exportRedirects()

      expect(result).toEqual({
        routes: [],
        next: undefined,
      })
    })

    it('should handle missing redirect data', async () => {
      ;(rewriter.http.post as jest.Mock).mockResolvedValue({
        data: {
          redirect: null,
        },
      })

      const result = await rewriter.exportRedirects()

      expect(result).toBeUndefined()
    })

    it('should handle network errors', async () => {
      const networkError = new Error('Network failure')
      ;(rewriter.http.post as jest.Mock).mockRejectedValue(networkError)

      await expect(rewriter.exportRedirects()).rejects.toThrow('Network failure')
    })

    it('should use correct GraphQL query', async () => {
      ;(rewriter.http.post as jest.Mock).mockResolvedValue({
        data: { redirect: { listRedirects: mockExportResponse } },
      })

      await rewriter.exportRedirects()

      const call = (rewriter.http.post as jest.Mock).mock.calls[0]
      const query = call[1].query

      expect(query).toContain('query ListRedirects($next: String)')
      expect(query).toContain('redirect')
      expect(query).toContain('listRedirects(next: $next)')
      expect(query).toContain('next')
      expect(query).toContain('routes')
      expect(query).toContain('from')
      expect(query).toContain('to')
      expect(query).toContain('type')
      expect(query).toContain('endDate')
    })
  })

  describe('importRedirects method', () => {
    const mockRedirectInputs: RedirectInput[] = [
      { id: '1', from: '/old1', to: '/new1', type: 'PERMANENT', endDate: '', binding: 'binding1' },
      { id: '2', from: '/old2', to: '/new2', type: 'TEMPORARY', endDate: '2024-12-31', binding: 'binding2' },
    ]

    beforeEach(() => {
      // Mock the graphql property through prototype
      Object.defineProperty(rewriter, 'graphql', {
        value: {
          mutate: jest.fn(),
        },
        writable: true,
        configurable: true,
      })
    })

    it('should import redirects successfully', async () => {
      ;(rewriter.graphql.mutate as jest.Mock).mockResolvedValue({
        data: {
          redirect: {
            saveMany: true,
          },
        },
      })

      const result = await rewriter.importRedirects(mockRedirectInputs)

      expect(rewriter.graphql.mutate).toHaveBeenCalledWith(
        {
          mutate: expect.stringContaining('mutation SaveMany'),
          variables: { routes: mockRedirectInputs },
        },
        {
          metric: 'rewriter-import-redirects',
        }
      )
      expect(result).toBe(true)
    })

    it('should handle empty routes array', async () => {
      ;(rewriter.graphql.mutate as jest.Mock).mockResolvedValue({
        data: {
          redirect: {
            saveMany: true,
          },
        },
      })

      const result = await rewriter.importRedirects([])

      expect(rewriter.graphql.mutate).toHaveBeenCalledWith(
        {
          mutate: expect.stringContaining('mutation SaveMany'),
          variables: { routes: [] },
        },
        {
          metric: 'rewriter-import-redirects',
        }
      )
      expect(result).toBe(true)
    })

    it('should handle import failure', async () => {
      ;(rewriter.graphql.mutate as jest.Mock).mockResolvedValue({
        data: {
          redirect: {
            saveMany: false,
          },
        },
      })

      const result = await rewriter.importRedirects(mockRedirectInputs)

      expect(result).toBe(false)
    })

    it('should handle missing redirect data in response', async () => {
      ;(rewriter.graphql.mutate as jest.Mock).mockResolvedValue({
        data: {
          redirect: null,
        },
      })

      const result = await rewriter.importRedirects(mockRedirectInputs)

      expect(result).toBeUndefined()
    })

    it('should handle GraphQL errors', async () => {
      const graphqlError = new Error('GraphQL error')
      ;(rewriter.graphql.mutate as jest.Mock).mockRejectedValue(graphqlError)

      await expect(rewriter.importRedirects(mockRedirectInputs)).rejects.toThrow('GraphQL error')
    })

    it('should use correct GraphQL mutation', async () => {
      ;(rewriter.graphql.mutate as jest.Mock).mockResolvedValue({
        data: { redirect: { saveMany: true } },
      })

      await rewriter.importRedirects(mockRedirectInputs)

      const call = (rewriter.graphql.mutate as jest.Mock).mock.calls[0]
      const mutation = call[0].mutate

      expect(mutation).toContain('mutation SaveMany($routes: [RedirectInput!]!)')
      expect(mutation).toContain('redirect')
      expect(mutation).toContain('saveMany(routes: $routes)')
    })

    it('should handle large batches of redirects', async () => {
      const largeRedirectInputs = Array.from({ length: 100 }, (_, i) => ({
        id: i.toString(),
        from: `/old${i}`,
        to: `/new${i}`,
        type: 'PERMANENT' as const,
        endDate: '',
        binding: 'binding1',
      }))

      ;(rewriter.graphql.mutate as jest.Mock).mockResolvedValue({
        data: { redirect: { saveMany: true } },
      })

      const result = await rewriter.importRedirects(largeRedirectInputs)

      expect(rewriter.graphql.mutate).toHaveBeenCalledWith(
        {
          mutate: expect.stringContaining('mutation SaveMany'),
          variables: { routes: largeRedirectInputs },
        },
        {
          metric: 'rewriter-import-redirects',
        }
      )
      expect(result).toBe(true)
    })
  })

  describe('deleteRedirects method', () => {
    const mockPaths = ['/old1', '/old2', '/old3']

    beforeEach(() => {
      // Mock the graphql property through prototype
      Object.defineProperty(rewriter, 'graphql', {
        value: {
          mutate: jest.fn(),
        },
        writable: true,
        configurable: true,
      })
    })

    it('should delete redirects successfully', async () => {
      ;(rewriter.graphql.mutate as jest.Mock).mockResolvedValue({
        data: {
          redirect: {
            deleteMany: true,
          },
        },
      })

      const result = await rewriter.deleteRedirects(mockPaths)

      expect(rewriter.graphql.mutate).toHaveBeenCalledWith(
        {
          mutate: expect.stringContaining('mutation DeleteMany'),
          variables: { paths: mockPaths },
        },
        {
          metric: 'rewriter-delete-redirects',
        }
      )
      expect(result).toBe(true)
    })

    it('should handle empty paths array', async () => {
      ;(rewriter.graphql.mutate as jest.Mock).mockResolvedValue({
        data: {
          redirect: {
            deleteMany: true,
          },
        },
      })

      const result = await rewriter.deleteRedirects([])

      expect(rewriter.graphql.mutate).toHaveBeenCalledWith(
        {
          mutate: expect.stringContaining('mutation DeleteMany'),
          variables: { paths: [] },
        },
        {
          metric: 'rewriter-delete-redirects',
        }
      )
      expect(result).toBe(true)
    })

    it('should handle delete failure', async () => {
      ;(rewriter.graphql.mutate as jest.Mock).mockResolvedValue({
        data: {
          redirect: {
            deleteMany: false,
          },
        },
      })

      const result = await rewriter.deleteRedirects(mockPaths)

      expect(result).toBe(false)
    })

    it('should handle missing redirect data in response', async () => {
      ;(rewriter.graphql.mutate as jest.Mock).mockResolvedValue({
        data: {
          redirect: null,
        },
      })

      const result = await rewriter.deleteRedirects(mockPaths)

      expect(result).toBeUndefined()
    })

    it('should handle GraphQL errors', async () => {
      const graphqlError = new Error('GraphQL error')
      ;(rewriter.graphql.mutate as jest.Mock).mockRejectedValue(graphqlError)

      await expect(rewriter.deleteRedirects(mockPaths)).rejects.toThrow('GraphQL error')
    })

    it('should use correct GraphQL mutation', async () => {
      ;(rewriter.graphql.mutate as jest.Mock).mockResolvedValue({
        data: { redirect: { deleteMany: true } },
      })

      await rewriter.deleteRedirects(mockPaths)

      const call = (rewriter.graphql.mutate as jest.Mock).mock.calls[0]
      const mutation = call[0].mutate

      expect(mutation).toContain('mutation DeleteMany($paths: [String!]!)')
      expect(mutation).toContain('redirect')
      expect(mutation).toContain('deleteMany(paths: $paths)')
    })

    it('should handle large batches of paths', async () => {
      const largePaths = Array.from({ length: 100 }, (_, i) => `/path${i}`)

      ;(rewriter.graphql.mutate as jest.Mock).mockResolvedValue({
        data: { redirect: { deleteMany: true } },
      })

      const result = await rewriter.deleteRedirects(largePaths)

      expect(rewriter.graphql.mutate).toHaveBeenCalledWith(
        {
          mutate: expect.stringContaining('mutation DeleteMany'),
          variables: { paths: largePaths },
        },
        {
          metric: 'rewriter-delete-redirects',
        }
      )
      expect(result).toBe(true)
    })

    it('should handle paths with special characters', async () => {
      const specialPaths = [
        '/path with spaces',
        '/path-with-dashes',
        '/path_with_underscores',
        '/path/with/slashes',
        '/path?with=query&params=true',
        '/path#with-fragment',
      ]

      ;(rewriter.graphql.mutate as jest.Mock).mockResolvedValue({
        data: { redirect: { deleteMany: true } },
      })

      const result = await rewriter.deleteRedirects(specialPaths)

      expect(rewriter.graphql.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: { paths: specialPaths },
        }),
        expect.any(Object)
      )
      expect(result).toBe(true)
    })
  })

  describe('type definitions', () => {
    it('should have correct RedirectInput interface', () => {
      const redirectInput: RedirectInput = {
        id: 'test-id',
        from: '/old-path',
        to: '/new-path',
        endDate: '2024-12-31',
        type: 'PERMANENT',
        binding: 'test-binding',
      }

      expect(redirectInput.id).toBe('test-id')
      expect(redirectInput.from).toBe('/old-path')
      expect(redirectInput.to).toBe('/new-path')
      expect(redirectInput.endDate).toBe('2024-12-31')
      expect(redirectInput.type).toBe('PERMANENT')
      expect(redirectInput.binding).toBe('test-binding')
    })

    it('should have correct Redirect interface', () => {
      const redirect: Redirect = {
        from: '/old-path',
        to: '/new-path',
        endDate: '2024-12-31',
        type: 'TEMPORARY',
        binding: 'test-binding',
      }

      expect(redirect.from).toBe('/old-path')
      expect(redirect.to).toBe('/new-path')
      expect(redirect.endDate).toBe('2024-12-31')
      expect(redirect.type).toBe('TEMPORARY')
      expect(redirect.binding).toBe('test-binding')
    })

    it('should have correct ExportResponse interface', () => {
      const exportResponse: ExportResponse = {
        routes: [{ from: '/old', to: '/new', type: 'PERMANENT', endDate: '', binding: 'binding1' }],
        next: 'next-token',
      }

      expect(exportResponse.routes).toHaveLength(1)
      expect(exportResponse.next).toBe('next-token')
    })

    it('should support both PERMANENT and TEMPORARY redirect types', () => {
      const permanentRedirect: Redirect = {
        from: '/old',
        to: '/new',
        type: 'PERMANENT',
        endDate: '',
        binding: 'binding1',
      }

      const temporaryRedirect: Redirect = {
        from: '/old',
        to: '/new',
        type: 'TEMPORARY',
        endDate: '2024-12-31',
        binding: 'binding1',
      }

      expect(permanentRedirect.type).toBe('PERMANENT')
      expect(temporaryRedirect.type).toBe('TEMPORARY')
    })
  })
})
