export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.{js,jsx,ts,tsx}', '<rootDir>/src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          target: 'es2022',
          module: 'esnext',
          moduleResolution: 'bundler',
          allowSyntheticDefaultImports: true,
          esModuleInterop: true,
          verbatimModuleSyntax: false,
        },
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/__tests__/**/*', '!src/typings/**/*'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testTimeout: 10000,
  verbose: true,
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  globals: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
}
