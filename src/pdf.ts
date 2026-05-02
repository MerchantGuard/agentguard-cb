/**
 * Subpath export: @merchantguard/agentguard-cb/pdf
 *
 * Re-exports the PDF generation + signed manifest primitives. Use this
 * subpath if you only need to render evidence PDFs and verify their
 * cryptographic manifest, without pulling in evidence schemas.
 */

export * from '../lib/pdf/generate';
