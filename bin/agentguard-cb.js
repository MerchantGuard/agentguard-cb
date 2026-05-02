#!/usr/bin/env node
/**
 * AgentGuard CB CLI entry.
 *
 * Currently routes a single subcommand:
 *   agentguard-cb mcp   → starts the stdio MCP server (dist/mcp-server.js)
 *
 * Lives in bin/ rather than src/ so the shebang is preserved without
 * tsup banner gymnastics. Kept tiny so tsup never has to touch it.
 *
 * The package is "type": "module" but this file uses .js with dynamic
 * import() because we want the shebang to be the literal first byte.
 * Everything is wrapped in an async IIFE so top-level await + import()
 * are usable, and we never use top-level `return`.
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
        'AgentGuard CB — anti-fabrication chargeback evidence library',
        '',
        'Subcommands:',
        '  mcp        Start the stdio MCP server (for Claude Desktop, Cursor, Cline, etc.)',
        '  help       Show this help',
        '',
        'Library use: import { ... } from "@merchantguard/agentguard-cb"',
        'Docs:        https://github.com/MerchantGuard/agentguard-cb',
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
    `agentguard-cb: unknown subcommand "${subcommand}". Try "agentguard-cb help".\n`,
  );
  process.exit(1);
})();
