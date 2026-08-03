import { CoverageReport } from 'monocart-coverage-reports';
import { coverageOptions } from '../../coverage.config.js';

export default async function globalTeardown() {
  const report = new CoverageReport(coverageOptions);
  await report.generate();
}
