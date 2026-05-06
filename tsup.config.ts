import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    evidence: 'src/evidence.ts',
    audit: 'src/audit.ts',
    pdf: 'src/pdf.ts',
    adapters: 'src/adapters.ts',
    'event-log': 'src/event-log.ts',
    'mcp-server': 'src/mcp-server.ts',
    outcomes: 'src/outcomes.ts',
  },
  format: ['esm', 'cjs'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  target: 'node20',
  // Mark heavy/peer-style deps as external so consumers control versions.
  external: [
    'stripe',
    'pdf-lib',
    'zod',
    '@noble/ed25519',
    'drizzle-orm',
    'postgres',
    'next',
    'react',
    'react-dom',
  ],
  // The mcp-server entry needs a shebang so it runs as a CLI binary.
  banner: ({ format }) => {
    return { js: '' };
  },
});
