// Test setup file
import { jest } from '@jest/globals'

// Ensure this file is treated as a module, not a test
export {}

// Mock VTEX dependencies
jest.mock('vtex', () => ({
  SessionManager: {
    getSingleton: () => ({
      account: 'test-account',
      workspace: 'test-workspace',
    }),
  },
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
  isVerbose: false,
  IOClientFactory: {
    createClient: jest.fn(),
  },
  CustomCommand: class CustomCommand {
    static globalFlags: any = {}
    parse(_Class: any) {
      return {
        args: {},
        flags: {},
      }
    }
    async run() {
      // Mock implementation
    }
  },
  ColorifyConstants: {
    ID: (str: string) => str,
    COMMAND_OR_VTEX_REF: (str: string) => str,
  },
}))

// Mock fs-extra
jest.mock('fs-extra', () => ({
  readJson: jest.fn(),
  writeFile: jest.fn(),
  writeJsonSync: jest.fn(),
}))

// Mock fs
jest.mock('fs', () => ({
  createWriteStream: jest.fn(),
}))

// Mock ora (spinner)
jest.mock('ora', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    start: jest.fn().mockReturnThis(),
    stop: jest.fn().mockReturnThis(),
    succeed: jest.fn().mockReturnThis(),
    fail: jest.fn().mockReturnThis(),
    text: '',
    color: 'cyan',
  })),
}))

// Mock readline
jest.mock('readline', () => ({
  createInterface: jest.fn(() => ({
    on: jest.fn().mockReturnThis(),
    close: jest.fn(),
  })),
}))

// Global test timeout
jest.setTimeout(10000)
