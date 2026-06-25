# Contributing to GitHub Auto Sync

Thank you for your interest in contributing! This document provides guidelines and instructions.

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback

## Development Setup

### Prerequisites

```bash
# Check dependencies
which age          # age encryption
which git          # Git
which git-lfs      # Git LFS (optional)
which rsync        # rsync

# Verify versions
age --version
git --version
git lfs version
```

### Clone and Setup

```bash
cd ~/logseq-graph
cd logseq/plugins/logseq-github-auto-sync
npm install
npm test
```

### Project Structure

```
.
├── dist/                    # Built plugin (load by Logseq)
├── scripts/                 # CLI utilities
├── src/                     # New modular source (WIP)
│   ├── config/
│   ├── crypto/
│   ├── file/
│   ├── git/
│   └── scanner/
├── test/                    # Test suites
└── README.md               # User documentation
```

## Running Tests

```bash
# All tests
npm test

# Individual test files
node test/sync-core.test.js
node test/sync-helper.test.js
node test/main-plugin-root.test.js
```

### Test Coverage

```bash
# Run with coverage (requires nyc)
npm install -g nyc
nyc npm test
```

## Making Changes

### Workflow

1. **Create a branch**:
   ```bash
   git checkout -b feature/my-improvement
   ```

2. **Make changes**:
   - Edit `dist/` files for plugin changes
   - Edit `src/` files for new modular code
   - Edit `scripts/` for CLI changes
   - Add tests in `test/`

3. **Run tests**:
   ```bash
   npm test
   ```

4. **Manual testing**:
   ```bash
   # Test scan
   node scripts/sync-helper.js scan

   # Test sync (in a test repo!)
   node scripts/sync-helper.js sync --repo-url /tmp/test-repo
   ```

5. **Commit**:
   ```bash
   git add .
   git commit -m "feat: add progress reporting"
   ```

6. **Push and PR**:
   ```bash
   git push origin feature/my-improvement
   # Open PR on GitHub
   ```

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `test`: Tests
- `refactor`: Code refactoring
- `perf`: Performance improvement
- `chore`: Maintenance

**Examples**:
```
fix: prevent temp file leaks on encryption failure
feat: add multi-line secret detection
docs: add architecture diagram
test: add test for LFS threshold edge case
```

### Code Style

**JavaScript**:
- Use strict mode (`"use strict"`)
- 2-space indentation
- Single quotes for strings
- Semicolons required
- Descriptive variable names

**Good**:
```javascript
function encryptFile(agePath, recipientsPath, inputFile, outputFile) {
  const tmpFile = `${outputFile}.age-tmp-${generateTempSuffix()}`;
  try {
    // ... encryption logic
  } catch (error) {
    cleanupTempFiles(tmpFile);
    throw new Error(`Encryption failed: ${error.message}`);
  }
}
```

**Bad**:
```javascript
function enc(a,b,c,d){var t=c+".tmp";try{}catch(e){rm(t);throw"fail"}}
```

### Testing Guidelines

**Write tests for**:
- Bug fixes (regression test)
- New features
- Edge cases (empty files, large files, permissions)

**Test structure**:
```javascript
const assert = require("assert");

// Unit test
assert.strictEqual(
  core.contentHasEncryptedTag("tags:: encrypted", "encrypted"),
  true
);

// Integration test
const result = run("node", [helper, "scan"], { cwd: graph });
assert.strictEqual(result.status, 0);
```

## Reporting Bugs

### Before Reporting

1. **Check existing issues**: Search GitHub issues for similar reports
2. **Update to latest version**: Ensure you're on the latest commit
3. **Reproduce**: Try to reproduce the bug consistently

### Bug Report Template

```markdown
## Description
Brief description of the bug

## Steps to Reproduce
1. Go to '...'
2. Click on '...'
3. See error

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Environment
- Logseq version: X.Y.Z
- Plugin version: 0.1.0
- OS: macOS 14.0
- age version: X.Y.Z

## Logs
```
Paste relevant logs here (redact secrets!)
```

## Screenshots
If applicable
```

## Suggesting Features

### Feature Request Template

```markdown
## Problem
What problem does this solve?

## Solution
How would you implement it?

## Alternatives
Other approaches you've considered

## Additional Context
Screenshots, mockups, etc.
```

### Before Suggesting

1. Check if the feature fits the plugin's scope
2. Consider if it can be achieved with existing features
3. Think about security implications (encryption, secret scanning)

## Pull Request Process

1. **Update documentation**:
   - Update README.md if user-facing
   - Update ARCHITECTURE.md if architecture changes

2. **Ensure tests pass**:
   ```bash
   npm test
   ```

3. **Request review**:
   - Tag maintainers in PR
   - Be responsive to feedback

4. **Merge**:
   - Maintainers will merge when ready
   - Squash commits if requested

## Security

### Reporting Security Issues

**Do not open public issues for security vulnerabilities.**

Email: security@example.com (update with actual contact)

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Security Guidelines

**Never**:
- Commit private keys or secrets
- Disable secret scanning without discussion
- Weaken encryption without team approval

**Always**:
- Scan for secrets before committing
- Use `generateTempSuffix()` for temp files
- Redact logs (use `redactGitOutput()`)
- Test with real age keys (not dummy data)

## Questions?

- Open a GitHub Discussion for general questions
- Join the Logseq Discord for real-time chat
- Check existing docs before asking

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
