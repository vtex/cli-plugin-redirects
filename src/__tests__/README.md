# Test Suite Documentation

This directory contains comprehensive unit and integration tests for the VTEX CLI Redirects Plugin export functionality.

## 🧪 Test Structure

```
src/__tests__/
├── setup.ts                           # Global test setup and mocks
├── utils/
│   └── test-helpers.ts                # Test utilities and helper functions
├── modules/
│   └── rewriter/
│       ├── FileWriteQueue.test.ts     # Unit tests for FileWriteQueue class
│       ├── export.test.ts             # Unit tests for export module
│       └── utils.test.ts              # Unit tests for utility functions
├── commands/
│   └── redirects/
│       └── export.test.ts             # Unit tests for export command
├── integration/
│   └── export.integration.test.ts    # End-to-end integration tests
└── README.md                          # This file
```

## 🚀 Running Tests

### All Tests

```bash
yarn test
```

### Unit Tests Only

```bash
yarn test:unit
```

### Integration Tests Only

```bash
yarn test:integration
```

### Export-specific Tests

```bash
yarn test:export
```

### With Coverage

```bash
yarn test:coverage
```

### Watch Mode (for development)

```bash
yarn test:watch
```

## 📋 Test Categories

### **Unit Tests**

#### **FileWriteQueue Tests** (`FileWriteQueue.test.ts`)

- **Queue Management**: Tests ordering, concurrent processing, and queue size tracking
- **File Writing**: Tests CSV generation, encoding, and batch writing
- **Error Handling**: Tests error recovery and resource cleanup
- **Performance**: Tests large dataset handling and memory efficiency

#### **Export Module Tests** (`export.test.ts`)

- **Core Functionality**: Tests main export workflow with pagination
- **Concurrency**: Tests parallel processing and queue management
- **Configuration**: Tests environment variable handling
- **Error Recovery**: Tests retry mechanisms and graceful failure
- **Memory Management**: Tests streaming and memory-efficient processing

#### **Utils Tests** (`utils.test.ts`)

- **CSV Processing**: Tests CSV reading, parsing, and validation
- **Data Transformation**: Tests encoding, sorting, and formatting
- **Metadata Management**: Tests save/load/delete operations
- **Error Handling**: Tests GraphQL error display and file error handling

#### **Command Tests** (`export.test.ts`)

- **CLI Interface**: Tests argument parsing and flag handling
- **Error Propagation**: Tests error handling from module to command
- **Integration**: Tests command-to-module integration

### **Integration Tests**

#### **End-to-End Workflow** (`export.integration.test.ts`)

- **Complete Export**: Tests full export workflow with multiple pages
- **Large Datasets**: Tests performance with 10k+ redirects
- **Resume Functionality**: Tests interruption recovery
- **Concurrent Processing**: Tests parallel page processing
- **Error Scenarios**: Tests network errors, disk errors, and recovery
- **Special Characters**: Tests CSV handling with special characters

## 🛠️ Test Utilities

### **Test Helpers** (`test-helpers.ts`)

#### **MockWriteStream**

- Simulates file write operations
- Tracks written data for verification
- Provides state management (destroyed, ended)

#### **Mock Data Generation**

- `generateMockRedirects(count, startIndex)`: Creates test redirect data
- `mockExportResponse(routes, next)`: Creates API response objects
- `createMockRewriter()`: Creates mocked Rewriter client

#### **Async Utilities**

- `waitForNextTick()`: Waits for next event loop tick
- `waitFor(ms)`: Waits for specified time
- `setupMockProcessExit()`: Safely mocks process.exit

#### **CSV Utilities**

- `getWrittenCsvContent(stream)`: Extracts CSV content from mock stream
- `parseCsvContent(content)`: Parses CSV into structured data

## 🎯 Coverage Goals

The test suite aims for comprehensive coverage across:

| Component      | Target Coverage | Current Focus                           |
| -------------- | --------------- | --------------------------------------- |
| Export Module  | 95%+            | Core logic, error handling, concurrency |
| FileWriteQueue | 90%+            | Queue management, file operations       |
| Utils          | 85%+            | Data transformation, validation         |
| Commands       | 80%+            | CLI interface, error propagation        |

## 🔧 Mocking Strategy

### **External Dependencies**

- **VTEX SDK**: Mocked to simulate API responses and errors
- **File System**: Mocked to control I/O operations and simulate errors
- **Network**: Mocked to test timeout and failure scenarios

### **Internal Modules**

- **Rewriter Client**: Mocked to return predictable test data
- **File Streams**: Mocked to capture and verify written content
- **Process Controls**: Safely mocked to test exit conditions

## 🐛 Testing Error Scenarios

### **Network Errors**

- Connection timeouts
- GraphQL errors
- Authentication failures
- Rate limiting

### **File System Errors**

- Permission denied
- Disk space exhaustion
- File corruption
- Path not found

### **Data Errors**

- Invalid CSV format
- Encoding issues
- Large dataset handling
- Empty datasets

### **System Errors**

- Memory limitations
- Process interruption
- Concurrent access
- Resource cleanup

## 📊 Performance Testing

### **Memory Efficiency**

- Tests confirm memory usage remains constant regardless of dataset size
- Validates no memory leaks in long-running operations
- Verifies proper cleanup of resources

### **Throughput Testing**

- Tests processing speed with various dataset sizes
- Validates concurrency benefits
- Confirms optimal batch sizes

### **Scalability Testing**

- Tests with 10k+ redirects
- Validates parallel processing efficiency
- Confirms queue management under load

## 🔍 Test Data

### **Standard Test Cases**

- Small datasets (1-10 redirects)
- Medium datasets (100-1000 redirects)
- Large datasets (10k+ redirects)
- Empty datasets
- Single item datasets

### **Edge Cases**

- Special characters in URLs
- Unicode characters
- Very long URLs
- Malformed data
- Missing required fields

### **Error Conditions**

- Network failures
- Disk space issues
- Permission problems
- Process interruption
- Resource exhaustion

## 🚦 Continuous Integration

### **Pre-commit Hooks**

Tests are automatically run before commits to ensure:

- All tests pass
- Code coverage meets targets
- No linting errors
- Proper formatting

### **CI Pipeline**

- Tests run on multiple Node.js versions
- Coverage reports generated
- Integration tests with real API (staging)
- Performance benchmarks

## 📝 Writing New Tests

### **Unit Test Guidelines**

1. **Arrange**: Set up test data and mocks
2. **Act**: Execute the function under test
3. **Assert**: Verify expected outcomes
4. **Cleanup**: Reset mocks and state

### **Integration Test Guidelines**

1. **End-to-End**: Test complete workflows
2. **Real Scenarios**: Use realistic data sizes
3. **Error Paths**: Test failure and recovery
4. **Performance**: Validate efficiency

### **Test Naming Convention**

```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should perform expected behavior when given valid input', () => {
      // Test implementation
    })

    it('should handle error gracefully when invalid input provided', () => {
      // Error test implementation
    })
  })
})
```

## 🎪 Mock Environment Variables

Tests can override environment variables for configuration testing:

```typescript
// Set custom concurrency
process.env.EXPORT_CONCURRENCY = '10'

// Set custom batch size
process.env.EXPORT_BATCH_SIZE = '200'

// Don't forget to restore
delete process.env.EXPORT_CONCURRENCY
delete process.env.EXPORT_BATCH_SIZE
```

## 📚 Additional Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [VTEX IO Testing Guide](https://developers.vtex.com/vtex-developer-docs/docs/vtex-io-documentation-testing)

---

**Happy Testing!** 🧪✨
