# Contributing to FUSE Native

We welcome contributions to FUSE Native! This document provides guidelines for contributing to the project, including development setup, coding standards, and the contribution process.

## 🎯 Ways to Contribute

- **Bug Reports**: Report issues you encounter
- **Feature Requests**: Suggest new functionality
- **Documentation**: Improve or add documentation
- **Code Contributions**: Fix bugs or implement features
- **Testing**: Add tests or improve test coverage
- **Performance**: Optimize performance-critical paths

## 🚀 Development Setup

### Prerequisites

Before you start, ensure you have the required system dependencies:

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install libfuse3-dev build-essential cmake pkg-config
```

**Fedora/CentOS/RHEL:**
```bash
sudo dnf install fuse3-devel gcc-c++ cmake pkg-config
```

**Node.js and Package Manager:**
- Node.js >= 18.0.0
- pnpm >= 8.0.0 (preferred) or npm/yarn

### Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/fuse-native.git
   cd fuse-native
   ```

3. **Install dependencies:**
   ```bash
   pnpm install
   ```

4. **Build the project:**
   ```bash
   pnpm run build
   ```

5. **Run tests:**
   ```bash
   pnpm test
   ```

### Project Structure

```
fuse-native/
├── src/                    # C++ N-API source code
│   ├── main.cc            # Module entry point
│   ├── fuse_bridge.cc     # FUSE operation bridge
│   ├── napi_helpers.cc    # N-API utilities
│   ├── timespec_codec.cc  # Timestamp conversions
│   └── *.h                # Header files
├── ts/                     # TypeScript API
│   ├── index.ts           # Main API entry point
│   ├── types.ts           # Type definitions
│   ├── errors.ts          # Error handling
│   └── *.ts               # Additional modules
├── test/                   # Test files
│   ├── setup.ts           # Test configuration
│   ├── smoke.test.ts      # Basic functionality tests
│   └── *.test.ts          # Additional test files
├── docs/                   # Documentation
├── examples/               # Example implementations
├── CMakeLists.txt         # CMake build configuration
├── tsconfig.json          # TypeScript configuration
└── package.json           # Node.js package configuration
```

## 🛠️ Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:

- `feat/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `perf/description` - Performance improvements
- `refactor/description` - Code refactoring
- `test/description` - Test additions/improvements

Example: `feat/add-readdir-pagination`

### Making Changes

1. **Create a feature branch:**
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** following the coding standards below

3. **Add tests** for new functionality

4. **Update documentation** as needed

5. **Run the development checks:**
   ```bash
   # Type checking
   pnpm run typecheck
   
   # Linting
   pnpm run lint
   
   # Testing
   pnpm test
   
   # Build verification
   pnpm run build
   ```

6. **Commit your changes** using conventional commits (see below)

7. **Push and create a Pull Request**

## 📝 Coding Standards

### TypeScript

- **Strict Mode**: Always use TypeScript strict mode
- **No `any`**: Avoid `any` type; use proper type annotations
- **BigInt for 64-bit**: Use `BigInt` for all 64-bit values (sizes, offsets, timestamps)
- **Branded Types**: Use branded types for type safety (`Fd`, `Ino`, `Mode`, etc.)
- **Promises**: Use `async/await` instead of callbacks
- **Error Handling**: Consistent errno-based error handling

**Example:**
```typescript
// Good
async function readFile(ino: Ino, offset: bigint, size: number): Promise<ArrayBuffer> {
  if (size < 0) {
    throw new FuseErrno('EINVAL');
  }
  
  const data = await performRead(ino, offset, size);
  return data.buffer;
}

// Bad
function readFile(ino: any, offset: number, size: number, callback: Function) {
  // Using any, number for 64-bit values, callbacks
}
```

### C++ (N-API)

- **C++17 Standard**: Use modern C++ features
- **RAII**: Resource Acquisition Is Initialization pattern
- **No Exceptions in Hot Path**: Handle errors via return codes
- **N-API Status Checking**: Always check `napi_status` return values
- **ThreadSafeFunction**: Use TSFN for all C++ → JS calls
- **BigInt**: Use `napi_create_bigint_uint64` for 64-bit values

**Example:**
```cpp
// Good
napi_value CreateTimespec(napi_env env, const struct timespec& ts) {
    napi_value result;
    uint64_t ns = ts.tv_sec * 1000000000ULL + ts.tv_nsec;
    
    napi_status status = napi_create_bigint_uint64(env, ns, &result);
    if (status != napi_ok) {
        napi_throw_error(env, nullptr, "Failed to create BigInt");
        return nullptr;
    }
    
    return result;
}

// Bad
napi_value CreateTimespec(napi_env env, const struct timespec& ts) {
    napi_value result;
    double seconds = ts.tv_sec + ts.tv_nsec / 1e9; // Loss of precision!
    napi_create_double(env, seconds, &result); // No error checking!
    return result;
}
```

### Testing

- **Comprehensive Coverage**: Aim for >90% code coverage
- **Unit Tests**: Test individual functions and modules
- **Integration Tests**: Test complete workflows
- **Mock Tests**: Test without requiring FUSE mount capabilities
- **Error Cases**: Test error conditions and edge cases

**Test Structure:**
```typescript
describe('Component Name', () => {
  describe('specific functionality', () => {
    it('should handle normal case', () => {
      // Test implementation
    });
    
    it('should handle error case', () => {
      // Test error handling
    });
    
    it('should validate input parameters', () => {
      // Test parameter validation
    });
  });
});
```

## 🏗️ Build System

### Native Build (C++)

The project uses CMake for building the native components:

```bash
# Debug build
pnpm run build:native

# Release build  
CMAKE_BUILD_TYPE=Release pnpm run build:native

# Clean build
pnpm run clean:build
pnpm run build:native
```

### TypeScript Build

```bash
# Build TypeScript
pnpm run build:ts

# Watch mode for development
pnpm run dev

# Type checking only
pnpm run typecheck
```

## ✅ Commit Guidelines

We use [Conventional Commits](https://www.conventionalcommits.org/) for consistent commit messages:

### Format
```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code changes that neither fix bugs nor add features
- `perf`: Performance improvements
- `test`: Adding or modifying tests
- `chore`: Changes to build process, auxiliary tools, etc.

### Examples
```bash
feat(api): add readdir pagination support

Add offset-based pagination to readdir operations for handling
large directories efficiently.

Closes #123

---

fix(bridge): handle null pointer in fuse_req_userdata

Check for null pointer before dereferencing to prevent segfault
when FUSE request has no user data.

---

docs: update API documentation for BigInt usage

Clarify that all 64-bit values use BigInt instead of number
to prevent precision loss.
```

## 🧪 Testing Guidelines

### Running Tests

```bash
# All tests
pnpm test

# Specific test file
pnpm test test/smoke.test.ts

# Watch mode
pnpm run test:watch

# Coverage report
pnpm run test:coverage
```

### Writing Tests

1. **Test Structure**: Follow AAA pattern (Arrange, Act, Assert)
2. **Descriptive Names**: Use clear, descriptive test names
3. **Edge Cases**: Test boundary conditions and error cases
4. **Mocking**: Use mocks for external dependencies
5. **Async/Await**: Use async/await for asynchronous tests

### Test Categories

- **Unit Tests**: Test individual functions (`*.test.ts`)
- **Integration Tests**: Test complete workflows (`integration/*.test.ts`)
- **Performance Tests**: Benchmark performance (`bench/*.bench.ts`)

## 📋 Pull Request Process

### Before Submitting

- [ ] Code follows project style guidelines
- [ ] Tests are added for new functionality
- [ ] All tests pass locally
- [ ] Documentation is updated
- [ ] Commit messages follow conventional format
- [ ] No merge conflicts with main branch

### PR Template

When creating a PR, include:

1. **Description**: Clear description of changes
2. **Motivation**: Why is this change needed?
3. **Testing**: How was this tested?
4. **Breaking Changes**: Any breaking changes?
5. **Related Issues**: Link to related issues

### Review Process

1. **Automated Checks**: CI must pass
2. **Code Review**: At least one maintainer review required
3. **Testing**: Verify tests cover new functionality
4. **Documentation**: Check documentation updates
5. **Breaking Changes**: Special attention for breaking changes

## 🚀 Release Process

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR**: Incompatible API changes
- **MINOR**: Backwards-compatible functionality additions
- **PATCH**: Backwards-compatible bug fixes
- **Pre-release**: Alpha/beta/rc versions for testing

### Release Checklist

- [ ] All tests pass
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped in package.json
- [ ] Git tag created
- [ ] npm package published
- [ ] GitHub release created

## 🔍 Code Review Guidelines

### For Authors

- Keep PRs focused and reasonably sized
- Provide clear description and context
- Respond to feedback constructively
- Update PR based on review comments

### For Reviewers

- Be constructive and respectful
- Focus on code quality and correctness
- Check for proper error handling
- Verify test coverage
- Consider performance implications

### Review Checklist

- [ ] Code follows project standards
- [ ] Proper error handling
- [ ] Memory management (C++ code)
- [ ] Type safety (TypeScript code)
- [ ] Test coverage adequate
- [ ] Documentation updated
- [ ] No obvious performance issues

## 🐛 Bug Reports

### Before Reporting

1. **Search existing issues** for similar problems
2. **Test with latest version** to see if already fixed
3. **Minimal reproduction** case

### Bug Report Template

**Environment:**
- OS: [e.g., Ubuntu 22.04]
- Node.js version: [e.g., 18.17.0]
- Package version: [e.g., 3.0.0-alpha.1]

**Description:**
Clear description of the bug

**Reproduction Steps:**
1. Step one
2. Step two
3. Step three

**Expected Behavior:**
What should happen

**Actual Behavior:**
What actually happens

**Additional Context:**
Logs, screenshots, etc.

## 💡 Feature Requests

### Before Requesting

1. **Check existing issues** and discussions
2. **Consider if it fits** the project scope
3. **Think about implementation** complexity

### Feature Request Template

**Problem:**
What problem does this solve?

**Proposed Solution:**
Describe your proposed solution

**Alternatives:**
Alternative approaches considered

**Additional Context:**
Use cases, examples, etc.

## 📞 Getting Help

- **GitHub Discussions**: General questions and discussion
- **GitHub Issues**: Bug reports and feature requests
- **Code Review**: Ask questions in PR comments
- **Documentation**: Check existing docs first

## 🙏 Recognition

Contributors are recognized in:

- **CONTRIBUTORS.md**: All contributors listed
- **GitHub Contributors**: Automatic GitHub recognition
- **Release Notes**: Major contributions highlighted
- **Documentation**: Author attribution where appropriate

## 📄 License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT License).

---

Thank you for contributing to FUSE Native! 🚀