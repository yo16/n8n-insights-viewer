import { getCurrentJob, subscribeToSyncJob } from "@/lib/sync-process";
import type { SyncJob } from "@/lib/sync-process";

/**
 * GET /api/sync/stream — 同期進捗のSSE配信。
 *
 * `docs/design/api-design.md` §3.2 準拠:
 * - 現在のジョブの進捗イベント（JSON Lines）を `data: <JSON>\n\n` 形式で配信する
 * - 接続時点までの履歴（`job.events`）をまず flush し、以降は購読して逐次配信する
 * - ジョブ完了時（`__result__` 相当）は終了イベントを送ってストリームをcloseする
 * - 実行中ジョブが無ければ、直近のジョブ結果 or `idle` を1件送ってすぐcloseする
 *   （ページ初回表示・実行中ジョブが既に無いケース）
 *
 * Node の child_process を使うため Edge Runtime 指定は禁止。
 */
export const dynamic = "force-dynamic";

const SSE_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

function toSseEvent(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(): Promise<Response> {
  const job = getCurrentJob();

  if (!job) {
    return new Response(toSseEvent({ type: "idle" }), { headers: SSE_HEADERS });
  }

  if (job.status !== "running") {
    return new Response(toSseEvent({ type: "result", job }), {
      headers: SSE_HEADERS,
    });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // 接続時点までの履歴をflushする（再接続時に途中経過から表示できるように）
      for (const event of job.events) {
        controller.enqueue(encoder.encode(toSseEvent(event)));
      }

      // 履歴flush後すでにジョブが完了していた場合は、そのまま結果を送ってclose
      if (job.status !== "running") {
        controller.enqueue(encoder.encode(toSseEvent({ type: "result", job })));
        controller.close();
        return;
      }

      unsubscribe = subscribeToSyncJob((update) => {
        if (update.type === "progress") {
          controller.enqueue(encoder.encode(toSseEvent(update.event)));
          return;
        }

        const finished: SyncJob = update.job;
        controller.enqueue(
          encoder.encode(toSseEvent({ type: "result", job: finished })),
        );
        controller.close();
        unsubscribe?.();
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
