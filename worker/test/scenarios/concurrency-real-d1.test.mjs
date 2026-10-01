// Scenario 11 on REAL local D1 (workerd through wrangler's getPlatformProxy, local mode, nothing persisted):
// the same engine and the same asynchronous round trips as production, so the races are real ones.
// Run: node --test worker/test/scenarios/concurrency-real-d1.test.mjs
import { startHarness } from '../harness/harness.mjs';
import { concurrencyScenarios } from './concurrency.scenarios.mjs';

await concurrencyScenarios(await startHarness({ realD1: true }));
