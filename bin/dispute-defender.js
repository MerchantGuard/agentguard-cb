#!/usr/bin/env node
/**
 * dispute-defender CLI entry.
 *
 * Currently routes a single subcommand:
 *   dispute-defender mcp   → starts the stdio MCP server (dist/mcp-server.cjs)
 *
 * Lives in bin/ rather than src/ so the shebang is preserved without
 * tsup banner gymnastics. Kept tiny so tsup never has to touch it.
 *
 * The package is "type": "module" but this file uses .js with CommonJS
 * require() because we want the shebang to be the literal first byte.
 * To make that work in an ESM package we wrap everything in an async
 * IIFE so top-level await + import() are usable, and we never use
 * top-level `return`.
 */

(async () => {
  const subcommand = process.argv[2];
  const isHelp =
    !subcommand ||
    subcommand === 'help' ||
    subcommand === '--help' ||
    subcommand === '-h';

  if (isHelp) {
    process.stderr.write(
      [
        'dispute-defender — anti-fabrication chargeback evidence library',
        '',
        'Subcommands:',
        '  mcp        Start the stdio MCP server (for Claude Desktop, Cursor, Cline, etc.)',
        '  help       Show this help',
        '',
        'Library use: import { ... } from "@merchantguard/dispute-defender"',
        'Docs:        https://github.com/MerchantGuard/dispute-defender',
        '',
      ].join('\n'),
    );
    process.exit(subcommand && !['help', '--help', '-h'].includes(subcommand) ? 1 : 0);
  }

  if (subcommand === 'mcp') {
    // Defer to the bundled ESM MCP server so it stays in the same module graph
    // as @modelcontextprotocol/sdk (which is ESM-only above v1).
    await import('../dist/mcp-server.js');
    return;
  }

  process.stderr.write(
    `dispute-defender: unknown subcommand "${subcommand}". Try "dispute-defender help".\n`,
  );
  process.exit(1);
})();
