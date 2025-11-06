# Load Testing Setup Guide (Phase 1 & 2)

## Quick Start

### 1. Run Setup (Creates Test User & Data)

```bash
# Create test user and workspace
k6 run tests/load/setup.js

# The setup will output environment variables - save them!
export K6_TEST_USER_EMAIL="loadtest-xxxxx@example.com"
export K6_TEST_ACCESS_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
export K6_TEST_WORKSPACE_ID="00000000-0000-0000-0000-000000000000"
```

### 2. Run Load Tests

```bash
# Run all tests with light load (recommended for first run)
bash run-load-tests.sh

# Or run individual tests
k6 run tests/load/auth-token.js
k6 run tests/load/planner-list.js
k6 run tests/load/generate-campaign.js
```

### 3. Cleanup (Optional)

```bash
# Remove test data after testing
k6 run tests/load/cleanup.js
```

## Load Levels

Tests now support three load levels:

### Light (Default)
- **Best for**: First-time testing, development, CI/CD
- **Load**: 10-50 concurrent users
- **Duration**: ~2 minutes per test
- **Use case**: Verify functionality, get baseline metrics

```bash
K6_LOAD_LEVEL=light bash run-load-tests.sh
```

### Medium
- **Best for**: Realistic production simulation
- **Load**: 50-200 concurrent users
- **Duration**: ~5 minutes per test
- **Use case**: Performance validation, bottleneck detection

```bash
K6_LOAD_LEVEL=medium bash run-load-tests.sh
```

### Heavy
- **Best for**: Stress testing, capacity planning
- **Load**: 100-5000 concurrent users
- **Duration**: ~7-10 minutes per test
- **Use case**: Find breaking points, infrastructure limits

```bash
K6_LOAD_LEVEL=heavy bash run-load-tests.sh
```

## What Changed (Phase 1 & 2)

### ✅ Fixed Issues

1. **Real Authentication**
   - Tests now use actual JWT tokens from real users
   - No more 401 errors from `generate-campaign`
   
2. **Real Workspace IDs**
   - Tests use actual workspace from database
   - No more empty responses from `planner-list`

3. **Realistic Load**
   - Default to light load (10-50 users)
   - Previous unrealistic 5000 concurrent users removed
   - Configurable load levels for different scenarios

4. **Automated Setup**
   - `setup.js` creates test user, workspace, and sample data
   - `run-load-tests.sh` automatically runs setup if needed
   - `cleanup.js` removes test data after completion

### 📁 New Files

- `tests/load/setup.js` - Creates test environment
- `tests/load/cleanup.js` - Removes test data
- `tests/load/config.example.json` - Example configuration
- `tests/load/README-SETUP.md` - This file

### 📝 Modified Files

- `tests/load/planner-list.js` - Uses real workspace_id and auth token
- `tests/load/generate-campaign.js` - Uses real auth token
- `run-load-tests.sh` - Auto-runs setup, supports load levels

## Environment Variables

### Required (Set by setup.js)

```bash
K6_TEST_USER_EMAIL         # Test user email
K6_TEST_ACCESS_TOKEN       # JWT token for authentication
K6_TEST_WORKSPACE_ID       # Test workspace UUID
```

### Optional

```bash
K6_LOAD_LEVEL              # light (default), medium, or heavy
SUPABASE_URL               # Supabase project URL (has default)
SUPABASE_ANON_KEY          # Anon key (has default)
SUPABASE_SERVICE_ROLE_KEY  # For cleanup only
```

## Troubleshooting

### "K6_TEST_ACCESS_TOKEN not set" Error

**Solution**: Run setup first
```bash
k6 run tests/load/setup.js
```

Then export the variables shown in the output.

### "K6_TEST_WORKSPACE_ID not set" Error

**Solution**: Same as above - setup.js creates the workspace

### "User creation failed" During Setup

**Possible causes**:
- Email confirmation is enabled (should be auto-confirm for testing)
- Rate limiting on auth endpoint
- Database connection issues

**Solution**: Check Supabase logs and ensure auth is configured for auto-confirm

### Tests Still Showing Errors

**Check**:
1. Are environment variables set correctly?
   ```bash
   echo $K6_TEST_ACCESS_TOKEN
   echo $K6_TEST_WORKSPACE_ID
   ```

2. Is the JWT token still valid? (Tokens expire after 1 hour)
   ```bash
   # Re-run setup to get fresh token
   k6 run tests/load/setup.js
   ```

3. Does the workspace have data?
   ```bash
   # Check in Supabase dashboard or run planner-list with light load
   K6_LOAD_LEVEL=light k6 run tests/load/planner-list.js
   ```

## Expected Results (Light Load)

### Auth Token Test
- **Requests**: ~500-1000
- **P95**: < 100ms
- **Error Rate**: < 0.1%

### Planner List Test
- **Requests**: ~100-200
- **P95**: < 500ms
- **Error Rate**: < 0.5%

### Generate Campaign Test
- **Requests**: ~20-50
- **P95**: < 15s (AI generation is slow)
- **Error Rate**: < 1%

## Next Steps

After Phase 1 & 2 implementation:

1. ✅ Run tests with light load to get baseline
2. ✅ Verify error rates are now low (< 1%)
3. ✅ Document actual performance numbers
4. 🔄 Implement Phase 3: Edge Function optimizations
5. 🔄 Implement Phase 4: Production-ready infrastructure

## CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Setup Load Test
  run: k6 run tests/load/setup.js

- name: Run Load Tests (Light)
  run: |
    export K6_LOAD_LEVEL=light
    bash run-load-tests.sh
  
- name: Cleanup
  run: k6 run tests/load/cleanup.js
  if: always()
```

## Questions?

Check the main README: `tests/load/README.md`
