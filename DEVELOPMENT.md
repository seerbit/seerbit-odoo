# Seerbit Odoo Module - Development Guide

## Version: 0.1.3

> **Note:** As of v0.1.3, this module uses Firebase Realtime Database for payment requests and reconciliation. The backend writes payment requests to the `transactions` collection, and the POS frontend listens for reconciliation events from the `reconciliations` collection. The webhook endpoint is now used only for processing reconciliation payloads sent from the frontend after Firebase events.

## Firebase Architecture (v0.1.3+)

- **Backend:**
  - Sends payment requests to Firebase `transactions` collection using a write-only service account.
  - Saves the request to `seerbit_latest_response` for tracking.
  - Processes reconciliation payloads via `/pos_seerbit/notification` endpoint, clears `seerbit_latest_response`, and logs events.
- **Frontend:**
  - Saves pending transactions to `localStorage` after payment request.
  - Listens for reconciliation events from Firebase `reconciliations` collection using a read-only service account.
  - On event, retrieves the pending transaction, POSTs to backend, updates UI, and clears `localStorage`.

## Quick Start

### 1. Setup Development Environment

```bash
# Windows
setup-dev.bat

# Or manually
python -m venv venv
venv\Scripts\activate.bat  # Windows
source venv/bin/activate   # Linux/Mac
pip install -r requirements-dev.txt
```

### 2. Verify Environment

```bash
python test-env.py
```

### 3. Run Development Tools

```bash
python dev-tools.py all
```

## Development Workflow

### Daily Development

1. **Activate environment**: `venv\Scripts\activate.bat`
2. **Make changes**: Edit files in `pos_seerbit/`
3. **Format code**: `python dev-tools.py format`
4. **Run tests**: `python dev-tools.py test`
5. **Check quality**: `python dev-tools.py lint`

### Before Committing

```bash
# Install pre-commit hooks
pre-commit install

# Run all checks
pre-commit run --all-files
```

## Project Structure

```
seerbit-odoo/
├── pos_seerbit/                 # Main Odoo module
│   ├── __manifest__.py         # Module configuration
│   ├── models/                 # Database models
│   ├── controllers/            # Web endpoints
│   ├── views/                  # UI definitions
│   ├── data/                   # Initial data
│   └── static/                 # Frontend assets
├── tests/                      # Unit tests
├── .vscode/                    # VS Code settings
├── requirements-dev.txt        # Development dependencies
├── dev-tools.py               # Development utilities
├── test-env.py                # Environment verification
├── setup-dev.bat              # Windows setup script
├── .pre-commit-config.yaml    # Pre-commit hooks
├── pytest.ini                # Test configuration
├── pyproject.toml            # Tool configuration
└── .gitignore                # Git ignore rules
```

## Development Tools

### Code Quality

- **Black**: Code formatting
- **isort**: Import sorting
- **flake8**: Style checking
- **pylint**: Code analysis
- **mypy**: Type checking

### Testing

- **pytest**: Test framework
- **pytest-mock**: Mocking utilities
- **pytest-cov**: Coverage reporting

### Security

- **bandit**: Security linting
- **safety**: Dependency vulnerability checking

### Pre-commit Hooks

Automated checks that run before each commit:

- Code formatting
- Import sorting
- Style checking
- XML/CSV validation
- Security checks

## Testing Without Odoo

### Testing Strategy

The test suite uses **simplified unit tests** that focus on business logic without requiring Odoo installation:

```python
def test_seerbit_public_key_validation_success(self):
    """Test successful validation of unique public key"""
    # Mock the search to return empty (no duplicate)
    self.mock_search.return_value = Mock()
    self.mock_search.return_value.__bool__ = lambda self: False

    # Test business logic without Odoo framework
    mock_payment_method = Mock()
    mock_payment_method.seerbit_public_key = "test_key_123"
    assert mock_payment_method.seerbit_public_key == "test_key_123"
```

**What we test:**

- ✅ Business logic (payment validation, status checking)
- ✅ Data processing (JSON parsing, field validation)
- ✅ Error handling (duplicate keys, missing responses)

**What we don't test:**

- ❌ Odoo framework integration
- ❌ Database operations
- ❌ Webhook functionality
- ❌ Frontend JavaScript

**Note:** These tests provide ~30% production confidence. Real Odoo integration testing is needed for full production readiness.

### Running Tests

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=pos_seerbit

# Run specific test file
pytest tests/test_models.py

# Run with verbose output
pytest -v
```

## Code Standards

### Python

- **Line length**: 120 characters
- **Formatting**: Black
- **Imports**: isort with Black profile
- **Type hints**: Recommended for new code

### XML

- **Validation**: Automatic XML parsing check
- **Formatting**: Consistent indentation
- **Comments**: Use for complex structures

### JavaScript

- **ES6+**: Use modern JavaScript features
- **Odoo patterns**: Follow Odoo's module system
- **Comments**: Document complex logic

## Common Tasks

### Adding New Model

1. Create file: `pos_seerbit/models/new_model.py`
2. Define class extending `models.Model`
3. Add to `pos_seerbit/models/__init__.py`
4. Create tests in `tests/test_models.py`

### Adding New View

1. Create file: `pos_seerbit/views/new_view.xml`
2. Define view record
3. Add to `pos_seerbit/__manifest__.py` data list

### Adding New Controller

1. Create file: `pos_seerbit/controllers/new_controller.py`
2. Define controller class
3. Add to `pos_seerbit/controllers/__init__.py`

### Adding Frontend Assets

1. Create JS file: `pos_seerbit/static/src/js/new_file.js`
2. Create XML template: `pos_seerbit/static/src/xml/new_template.xml`
3. Assets are automatically loaded via manifest

## Troubleshooting

### Common Issues

#### Import Errors

```bash
# Reinstall dependencies
pip install -r requirements-dev.txt --force-reinstall
```

#### Test Failures

```bash
# Clear pytest cache
pytest --cache-clear

# Run with debug output
pytest -v -s
```

#### Linting Errors

```bash
# Auto-fix what can be fixed
black pos_seerbit/
isort pos_seerbit/

# Check specific files
pylint pos_seerbit/models/pos_payment_method.py
```

#### Pre-commit Failures

```bash
# Skip pre-commit (emergency only)
git commit --no-verify

# Run pre-commit manually
pre-commit run --all-files
```

### Environment Issues

#### Virtual Environment

```bash
# Recreate virtual environment
rmdir /s venv
python -m venv venv
venv\Scripts\activate.bat
pip install -r requirements-dev.txt
```

#### VS Code Issues

- Ensure Python interpreter is set to `./venv/Scripts/python.exe`
- Reload VS Code window
- Check Python extension is installed

## Deployment Preparation

### Before Release

1. **Update version** in `__manifest__.py`
2. **Run all tests**: `python dev-tools.py all`
3. **Check security**: `bandit -r pos_seerbit/`
4. **Update documentation**: Update README.md
5. **Create release notes**: Document changes

### Testing with Real Odoo

1. Install Odoo (Community or Enterprise)
2. Copy module to addons path
3. Update module list in Odoo
4. Install module
5. Test functionality

## Contributing

### Code Review Checklist

- [ ] Code follows style guidelines
- [ ] Tests pass
- [ ] No linting errors
- [ ] Documentation updated
- [ ] Security considerations addressed

### Commit Message Format

```
type(scope): description

- type: feat, fix, docs, style, refactor, test, chore
- scope: models, controllers, views, tests, etc.
- description: brief description of changes

Example:
feat(models): add new payment validation method
fix(controllers): handle webhook timeout properly
```

## Resources

### Odoo Development

- [Odoo Developer Documentation](https://www.odoo.com/documentation/16.0/developer/)
- [Odoo API Reference](https://www.odoo.com/documentation/16.0/reference/)
- [Odoo Community Association](https://odoo-community.org/)

### Python Development

- [Python Documentation](https://docs.python.org/3/)
- [Black Documentation](https://black.readthedocs.io/)
- [pytest Documentation](https://docs.pytest.org/)

### Tools

- [VS Code Python Extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python)
- [Pre-commit Documentation](https://pre-commit.com/)
- [Git Documentation](https://git-scm.com/doc)
