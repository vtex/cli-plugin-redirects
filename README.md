# VTEX CLI Plugin - Redirects

> 🚀 High-performance redirect management for VTEX IO

A powerful VTEX CLI plugin for managing URL redirects in your VTEX account and workspace. Features optimized CSV operations, parallel processing, and memory-efficient file handling for large datasets.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
![npm](https://img.shields.io/npm/v/@vtex/cli-plugin-redirects)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- **Export** all redirects to CSV with streaming optimization
- **Import** redirects from CSV files with batch processing
- **Delete** redirects using CSV file input
- **Memory efficient** - handles large datasets without OOM issues
- **Parallel processing** - configurable concurrency for optimal performance
- **Resume support** - automatically recovers from interruptions
- **Progress tracking** - real-time progress indicators

## 📦 Installation

### Install the Plugin

```bash
# Install the plugin to your VTEX CLI
vtex plugins install @vtex/cli-plugin-redirects
```

### Development Setup

For development or local testing:

```bash
# Clone the repository
git clone https://github.com/vtex/cli-plugin-redirects.git
cd cli-plugin-redirects

# Install dependencies
yarn install

# Build the plugin
yarn build

# Link for local development
vtex plugins link
```

## 🚀 Commands

### `vtex redirects export [CSV_FILE]`

Exports all redirects from the current account and workspace to a CSV file.

**Features:**

- Memory-efficient streaming export
- Handles millions of redirects without OOM
- Configurable concurrency and batch processing
- Automatic resume on interruption

```bash
# Basic export
vtex redirects export my-redirects.csv

# With performance tuning
EXPORT_CONCURRENCY=10 EXPORT_BATCH_SIZE=200 vtex redirects export large-export.csv
```

**CSV Format:**

```csv
from,to,type,endDate,binding
/old-page,/new-page,PERMANENT,,
/temporary,/temp-new,TEMPORARY,2024-12-31,
```

**Environment Variables:**

- `EXPORT_CONCURRENCY` - Number of parallel processors (default: 5)
- `EXPORT_BATCH_SIZE` - CSV rows per write batch (default: 100)

### `vtex redirects import [CSV_FILE]`

Imports redirects from a CSV file to the current account and workspace.

```bash
# Import redirects
vtex redirects import my-redirects.csv

# Import with reset (removes all existing redirects first)
vtex redirects import my-redirects.csv --reset
```

**Options:**

- `-r, --reset` - Remove all existing redirects before importing
- `-v, --verbose` - Show debug level logs
- `--trace` - Trace all requests to VTEX IO

### `vtex redirects delete [CSV_FILE]`

Deletes redirects using paths specified in a CSV file.

```bash
# Delete specific redirects
vtex redirects delete redirects-to-delete.csv
```

**CSV Format for deletion:**

```csv
from
/page-to-remove
/another-old-page
```

## 🔧 Performance Configuration

### Optimizing Export Performance

For large datasets, tune these environment variables:

```bash
# High-performance setup for large exports
export EXPORT_CONCURRENCY=10      # More parallel processors
export EXPORT_BATCH_SIZE=500      # Larger write batches

# Memory-constrained setup
export EXPORT_CONCURRENCY=3       # Fewer parallel processors
export EXPORT_BATCH_SIZE=50       # Smaller write batches
```

### Memory Usage Guidelines

| Dataset Size        | Concurrency | Batch Size    | Memory Usage |
| ------------------- | ----------- | ------------- | ------------ |
| < 100K redirects    | 5 (default) | 100 (default) | ~50MB        |
| 100K - 1M redirects | 8           | 200           | ~100MB       |
| > 1M redirects      | 10          | 500           | ~200MB       |

## 📋 CSV File Format

### Export Format

The export command generates CSV files with these columns:

| Column    | Description                | Example                    |
| --------- | -------------------------- | -------------------------- |
| `from`    | Source URL path            | `/old-product`             |
| `to`      | Target URL path            | `/new-product`             |
| `type`    | Redirect type              | `PERMANENT` or `TEMPORARY` |
| `endDate` | Expiration date (optional) | `2024-12-31`               |
| `binding` | Store binding (optional)   | `store-1`                  |

### Import Requirements

- CSV files must include at minimum: `from`, `to` columns
- `type` defaults to `PERMANENT` if not specified
- Encoding should be UTF-8
- Maximum file size: No limit (streams processing)

## 🛠️ Development

### Setup

```bash
# Clone and setup
git clone https://github.com/vtex/cli-plugin-redirects.git
cd cli-plugin-redirects
yarn install

# Development workflow
yarn watch          # Auto-rebuild on changes
yarn test           # Run tests
yarn lint           # Check code style
yarn build          # Production build
```

### Testing

```bash
# Run all tests
yarn test

# Run with coverage
yarn test --coverage

# Test specific command
vtex redirects export test-export.csv --verbose
```

## 🐛 Troubleshooting

### Common Issues

**Out of Memory Errors**

```bash
# Reduce concurrency and batch size
export EXPORT_CONCURRENCY=3
export EXPORT_BATCH_SIZE=50
```

**Network Timeouts**

```bash
# Use verbose mode to see detailed logs
vtex redirects export file.csv --verbose
```

**CSV Format Errors**

- Ensure CSV has required columns (`from`, `to`)
- Check for proper UTF-8 encoding
- Validate no empty required fields

### Debug Mode

Enable verbose logging for detailed information:

```bash
vtex redirects export file.csv --verbose --trace
```

## 📊 Performance Benchmarks

| Operation | Dataset Size   | Time    | Memory |
| --------- | -------------- | ------- | ------ |
| Export    | 100K redirects | ~2 min  | ~50MB  |
| Export    | 1M redirects   | ~15 min | ~100MB |
| Import    | 100K redirects | ~5 min  | ~30MB  |
| Delete    | 10K redirects  | ~30 sec | ~20MB  |

_Benchmarks measured on standard cloud infrastructure_

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

This project uses:

- **ESLint** for code linting
- **Prettier** for code formatting
- **TypeScript** for type safety

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/vtex/cli-plugin-redirects/issues)
- **VTEX Help**: [VTEX Help Center](https://help.vtex.com)
- **Developer Docs**: [VTEX IO Documentation](https://developers.vtex.com)

---

Made with ❤️ by the VTEX team
