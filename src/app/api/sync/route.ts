import { startSyncJob } from "@/lib/sync-process";

/**
 * POST /api/sync — 同期CLIの起動。
 *
 * `docs/design/api-design.md` §3.1 準拠:
 * - 実行中ジョブがあれば起動せず 409 Conflict + 既存jobIdを返す
 * - 起動成功時は 200 + jobId を返す（クライアントはこれで stream に接続する）
 *
 * Node の child_process を使うため Edge Runtime 指定は禁止。
 */
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const { job, alreadyRunning } = startSyncJob();

  if (alreadyRunning) {
    return Response.json(
      { jobId: job.id, status: job.status },
      { status: 409 },
    );
  }

  return Response.json({ jobId: job.id, status: job.status }, { status: 200 });
}
