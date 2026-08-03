import { CoverageReport } from 'monocart-coverage-reports';
import { coverageOptions } from '../../coverage.config.js';

// Runs once before the whole Playwright run. Clears any stale coverage cache
// left behind by a previous run so this run's monocart report only reflects
// this run's tests. See the note in coverage.config.js for why this can't be
// done via the `cleanCache: true` option on the shared, per-instance config.
export default async function globalSetup() {
  const report = new CoverageReport(coverageOptions);
  report.cleanCache();
}
