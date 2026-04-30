/**
 * POST /api/jobs/process
 *
 * Background job processor entry point. Configure Vercel Cron to POST here
 * every 30 seconds with `Authorization: Bearer ${JOB_PROCESSOR_SECRET}`.
 *
 * Claims a small batch atomically and processes:
 * - collect_evidence : run adapter, snapshot bundle, hash
 * - generate_pdf     : build PDF from snapshot, sign manifest, hash
 * - stage_evidence   : upload PDF + stage with submit:false
 * - submit_evidence  : final submit (only if human review approved or DD_AUTO_SUBMIT=true)
 */
import { NextResponse, type NextRequest } from 'next/server';
import { processJobBatch } from '@/lib/jobs/processor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization') ?? '';
  const expected = process.env.JOB_PROCESSOR_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const result = await processJobBatch();
  return NextResponse.json(result);
}
