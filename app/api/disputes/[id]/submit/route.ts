/**
 * POST /api/disputes/[id]/submit
 *
 * Final-submit gate. Requires:
 * - Authorization: Bearer ${ADMIN_TOKEN}
 * - The dispute has a generated PDF + evidence snapshot recorded
 * - Body: { humanReviewApproved: true } — operator MUST explicitly affirm review
 *
 * If any of these fail, the route returns 403 / 409 and does NOT submit.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { disputes, evidenceSnapshots, pdfArtifacts } from '@/lib/db/schema';
import { submitDisputeEvidence } from '@/lib/stripe/submit';
import type { CustomerEvidenceBundle } from '@/lib/evidence/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: { id: string } }): Promise<NextResponse> {
  // 1. Admin auth
  const auth = req.headers.get('authorization') ?? '';
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || !auth.startsWith('Bearer ') || auth.slice(7) !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 2. Body parse
  const body = await req.json().catch(() => ({}));
  if (body.humanReviewApproved !== true) {
    return NextResponse.json({ error: 'humanReviewApproved must be true' }, { status: 400 });
  }

  const db = getDb();
  const disputeRows = await db.select().from(disputes).where(eq(disputes.id, ctx.params.id)).limit(1);
  const dispute = disputeRows[0];
  if (!dispute) return NextResponse.json({ error: 'dispute not found' }, { status: 404 });

  // 3. Find latest evidence snapshot + PDF
  const [snapshot] = await db
    .select()
    .from(evidenceSnapshots)
    .where(eq(evidenceSnapshots.disputeId, dispute.id))
    .limit(1);
  if (!snapshot) return NextResponse.json({ error: 'no evidence snapshot' }, { status: 409 });

  const [pdf] = await db
    .select()
    .from(pdfArtifacts)
    .where(eq(pdfArtifacts.evidenceSnapshotId, snapshot.id))
    .limit(1);
  if (!pdf) return NextResponse.json({ error: 'no PDF generated' }, { status: 409 });

  // 4. Reconstruct PDF buffer from storage (impl detail — TODO: wire to actual storage)
  // For v0.2 the storage layer is a stub. The job processor that generates the PDF
  // should write the bytes to disk or S3 and store the path in pdfArtifacts.storagePath.
  if (!pdf.storagePath) {
    return NextResponse.json({ error: 'PDF storage path missing — job processor must persist bytes' }, { status: 501 });
  }
  const fs = await import('node:fs/promises');
  const pdfBuffer = await fs.readFile(pdf.storagePath);

  const result = await submitDisputeEvidence({
    disputeId: dispute.id,
    stripeDisputeId: dispute.stripeDisputeId,
    bundle: snapshot.bundleJson as CustomerEvidenceBundle,
    pdfBuffer,
    pdfSha256: pdf.pdfSha256,
    humanReviewApproved: true,
  });

  return NextResponse.json(result);
}
