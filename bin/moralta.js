#!/usr/bin/env node

/**
 * Moralta Claude — CLI AI Coding Assistant
 * Entry point
 */

// Global error handlers — keep the process from crashing on unhandled rejections
process.on('unhandledRejection', (reason) => {
  console.error('\n  [Unhandled Rejection]', reason?.message || reason || 'Unknown');
});
process.on('uncaughtException', (err) => {
  console.error('\n  [Uncaught Exception]', err?.message || err || 'Unknown');
  // Only exit on uncaught exceptions (these are truly fatal)
  process.exit(1);
});

// Load .env BEFORE importing the app — a static import would hoist above dotenv
// and config.js would read process.env before .env is applied.
try { await import('dotenv/config'); } catch {}

const { main } = await import('../src/index.js');

main().catch(err => {
  console.error('\n  ✗ Fatal error:', err?.message || err || 'Unknown');
  process.exit(1);
});
