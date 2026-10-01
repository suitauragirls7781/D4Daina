// Scenario 11 on the node:sqlite stand-in for D1 (fast; it yields between statements, so requests interleave).
// Run: node --test worker/test/scenarios/concurrency.test.mjs
import { startHarness } from '../harness/harness.mjs';
import { concurrencyScenarios } from './concurrency.scenarios.mjs';

await concurrencyScenarios(await startHarness());
