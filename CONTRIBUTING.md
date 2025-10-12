# Contributing to CaptionGenie

Thank you for your interest in contributing to CaptionGenie! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Feature Requests](#feature-requests)
- [Bug Reports](#bug-reports)

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/caption-genie.git`
3. Create a feature branch: `git checkout -b feature/my-new-feature`
4. Make your changes
5. Run tests: `npm test`
6. Commit your changes: `git commit -am 'Add new feature'`
7. Push to the branch: `git push origin feature/my-new-feature`
8. Submit a pull request

## Development Setup

### Prerequisites

- Node.js 18+ 
- npm or bun package manager
- Lovable Cloud account (for backend features)

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## Project Structure

```
caption-genie/
├── src/
│   ├── components/     # React components
│   ├── pages/          # Page components
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility functions
│   ├── integrations/   # External integrations (Supabase)
│   └── test/           # Test utilities and setup
├── supabase/
│   ├── functions/      # Edge functions
│   └── migrations/     # Database migrations
└── public/             # Static assets
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Prefer interfaces over types for object shapes
- Use meaningful variable and function names
- Add JSDoc comments for complex functions

### React

- Use functional components with hooks
- Follow React best practices (composition, single responsibility)
- Use semantic HTML elements
- Ensure accessibility (ARIA labels, keyboard navigation)

### Styling

- Use Tailwind CSS utility classes
- Use semantic tokens from `index.css` and `tailwind.config.ts`
- Never use direct colors (e.g., `text-white`, `bg-blue-500`)
- All colors must be HSL format
- Support both light and dark modes

### Code Style

- Use 2 spaces for indentation
- Use single quotes for strings
- Add trailing commas in objects and arrays
- Keep functions small and focused
- Extract reusable logic into custom hooks

## Testing

### Writing Tests

- Write tests for all new features
- Test edge cases and error conditions
- Use meaningful test descriptions
- Mock external dependencies (Supabase, APIs)

### Test Structure

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils/test-utils';

describe('ComponentName', () => {
  it('should render correctly', () => {
    render(<ComponentName />);
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });

  it('should handle user interaction', async () => {
    const { user } = render(<ComponentName />);
    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Updated Text')).toBeInTheDocument();
  });
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- Header.test.tsx

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage
```

## Submitting Changes

### Pull Request Process

1. Update documentation for any changed functionality
2. Add tests for new features
3. Ensure all tests pass
4. Update CHANGELOG.md if applicable
5. Write a clear PR description explaining:
   - What changed
   - Why it changed
   - How to test it

### PR Guidelines

- Keep PRs focused on a single feature or fix
- Write clear, concise commit messages
- Reference related issues in PR description
- Request review from maintainers
- Address review feedback promptly

### Commit Messages

Follow conventional commits format:

```
feat: add new feature
fix: resolve bug in component
docs: update README
style: format code
refactor: restructure component
test: add missing tests
chore: update dependencies
```

## Feature Requests

To request a new feature:

1. Check if feature already exists or is requested
2. Open a new issue with `[Feature Request]` prefix
3. Describe the feature and its benefits
4. Provide use cases and examples
5. Discuss implementation approach

## Bug Reports

To report a bug:

1. Check if bug is already reported
2. Open a new issue with `[Bug]` prefix
3. Provide:
   - Clear description of the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable
   - Browser/environment details
   - Console errors if any

## Code Review

All submissions require review. We use GitHub pull requests for this purpose. Reviewers will check:

- Code quality and style
- Test coverage
- Documentation
- Performance implications
- Security considerations
- Accessibility

## Questions?

Feel free to open an issue or reach out to the maintainers if you have questions about contributing.

Thank you for contributing to CaptionGenie! 🎉
