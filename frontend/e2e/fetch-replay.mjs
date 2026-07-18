#!/usr/bin/env node
// E2E verification actually run this session (Prompt 11).
//
// No Playwright skill/tool was available (checked via ToolSearch for
// "playwright e2e browser test"; no match), so per this prompt's own
// fallback clause this script replicates each page's exact fetch calls
// against the LIVE backend and asserts on the real response shape/values --
// the same method proven to work in Prompt 10. See dashboard.spec.ts
// alongside this file for the full Playwright suite written for when a
// runner IS available.
//
// Requires: the FastAPI backend running with trained artifacts, reachable
// at API_URL (default http://localhost:8000), and ANTHROPIC_API_KEY UNSET
// so the assistant path exercises the no-key fallback (as it will in
// CI/demo conditions).
//
// Usage: node e2e/fetch-replay.mjs
// Exits 0 if every check passes, 1 otherwise.

import assert from "node:assert/strict";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  FAIL  ${name}`);
    console.error(`        ${err.message}`);
  }
}

async function main() {
  console.log(`E2E fetch-replay against ${API_URL}\n`);

  await check("GET /health returns ok", async () => {
    const r = await fetch(`${API_URL}/health`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.status, "ok");
  });

  await check("GET /heatmap returns real grid data (as the / page consumes it)", async () => {
    const r = await fetch(`${API_URL}/heatmap?date=2023-12-31`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.type, "FeatureCollection");
    assert.ok(body.features.length > 0, "expected at least one grid cell");
    const props = body.features[0].properties;
    assert.ok("node_id" in props && "heat_index" in props && "mu_tevi" in props);
    assert.equal(typeof props.heat_index, "number");
  });

  let coveredPolicyId;
  await check(
    "POST /simulate-policy (covered location) returns positive premiums + basis_risk in income-smoothing framing",
    async () => {
      const r = await fetch(`${API_URL}/simulate-policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          occupation: "vendor",
          date_range: { start: "2019-06-01", end: "2019-06-14" },
          lat: 23.03,
          lon: 72.58,
        }),
      });
      assert.equal(r.status, 200);
      const body = await r.json();
      assert.equal(body.coverage_mode, "configured");
      assert.equal(body.product_type, "income_smoothing");
      assert.ok(body.premium_lsmc > 0, "expected a positive LSMC premium");
      assert.ok(body.premium_wang > 0, "expected a positive Wang-loaded premium");
      assert.ok(body.basis_risk, "expected a basis_risk block");
      for (const key of ["basis_risk_rmse", "shortfall_rate", "overpay_rate", "correlation"]) {
        assert.ok(key in body.basis_risk, `basis_risk missing ${key}`);
      }
      assert.ok(!body.note.toLowerCase().includes("catastrophe"), "note must never say catastrophe");
      coveredPolicyId = body.policy_id;
    },
  );

  await check("GET /explain/{policy_id} shows the single-dominant-feature contribution honestly", async () => {
    assert.ok(coveredPolicyId, "requires a priced policy from the previous check");
    const r = await fetch(`${API_URL}/explain/${coveredPolicyId}`);
    assert.equal(r.status, 200);
    const body = await r.json();
    const values = Object.values(body.feature_contributions_normalized);
    const max = Math.max(...values);
    assert.ok(max > 0.9, `expected one dominant feature (>90%), got max=${max}`);
    const sum = values.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-6, "normalized contributions must sum to 1");
  });

  await check("POST /assistant/ask (no key) returns a grounded fallback answer within a timeout", async () => {
    assert.ok(coveredPolicyId, "requires a priced policy from a previous check");
    const started = Date.now();
    const r = await fetch(`${API_URL}/assistant/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy_id: coveredPolicyId, question: "What is my premium?" }),
    });
    const elapsedMs = Date.now() - started;
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.source, "fallback_no_key");
    assert.ok(!body.answer.toLowerCase().includes("catastrophe"));
    assert.ok(body.answer.toLowerCase().includes("income smoothing"));
    assert.ok(elapsedMs < 5000, `assistant fallback took ${elapsedMs}ms, expected < 5000ms`);
  });

  await check("POST /simulate-policy (out-of-coverage) returns the honest message with null premiums", async () => {
    const r = await fetch(`${API_URL}/simulate-policy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        occupation: "vendor",
        date_range: { start: "2019-06-01", end: "2019-06-14" },
        lat: 0.0,
        lon: 0.0,
      }),
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.coverage_mode, "out_of_coverage");
    assert.equal(body.premium_lsmc, null);
    assert.equal(body.premium_wang, null);
    assert.equal(body.basis_risk, null);
    assert.ok(body.message, "expected an honest out-of-coverage message");
    assert.ok(body.note.toLowerCase().includes("no data was fabricated"));
  });

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    console.error("E2E fetch-replay FAILED.");
    process.exit(1);
  }
  console.log("E2E fetch-replay OK.");
}

main();
