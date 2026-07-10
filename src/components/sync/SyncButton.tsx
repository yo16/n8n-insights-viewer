"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./SyncButton.module.css";

/**
 * 同期実行ボタン（画面6, Client Component）。
 *
 * `docs/design/frontend-design.md` 画面6 / `docs/design/api-design.md` §3 準拠:
 * - クリック → `POST /api/sync`。実行中なら409（「実行中」表示 + 進捗購読は継続する）
 * - `GET /api/sync/stream`（SSE）を購読し、フェーズ進捗をリアルタイム表示
 * - 完了/失敗を表示し、`router.refresh()` でサーバー側データ（最終同期・履歴・
 *   カバー範囲）を再取得する
 * - 実行中は多重クリックを防止する（`disabled`）
 *
 * ---
 * 進捗イベントの型について（独自判断）:
 * `src/lib/sync-process` はモジュール先頭に `import "server-only"` があり、
 * Client Componentからimportするとビルドエラーになる。そのため、SSEで流れてくる
 * JSONの形（`scripts/sync/progress.ts` の `SyncProgressEvent` /
 * `src/lib/sync-process/types.ts` の `SyncJob`）と同一形状の型をこのファイル内に
 * 最小限だけ複製して定義する（担当領域が `src/components/sync/**` に限定されており
 * `src/lib/sync-process` 側を「server-onlyを外す」形に変更するのは領域外のため）。
 */

type SyncPhase =
  | "fetch"
  | "validate"
  | "extract"
  | "ingest"
  | "collect-metrics"
  | "cleanup";

type ResultStatus = "success" | "failed" | "aborted";

interface PhaseProgressMsg {
  phase: SyncPhase;
  status: "start" | "progress" | "done" | "error";
  ts?: string;
  message?: string;
  pct?: number;
}

interface ResultProgressMsg {
  phase: "__result__";
  status: ResultStatus;
  ts?: string;
  rowsIngested?: Record<string, number>;
  error?: string;
}

type ProgressMsg = PhaseProgressMsg | ResultProgressMsg;

interface JobSnapshot {
  id: string;
  status: "running" | "success" | "failed" | "aborted";
  error?: string;
}

type StreamMessage =
  | { type: "idle" }
  | { type: "result"; job: JobSnapshot }
  | ProgressMsg;

const PHASE_LABELS: Record<SyncPhase, string> = {
  fetch: "取得",
  validate: "検証",
  extract: "抽出",
  ingest: "取り込み",
  "collect-metrics": "負荷収集",
  cleanup: "後片付け",
};

type ViewState =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "already-running" }
  | { kind: "running"; phase?: SyncPhase; message?: string }
  | { kind: "done"; status: ResultStatus; error?: string };

function isProgressMsg(data: StreamMessage): data is ProgressMsg {
  return !("type" in data);
}

export function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<ViewState>({ kind: "idle" });
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  const subscribeToStream = useCallback(() => {
    esRef.current?.close();
    const es = new EventSource("/api/sync/stream");
    esRef.current = es;

    es.onmessage = (ev: MessageEvent<string>) => {
      let data: StreamMessage;
      try {
        data = JSON.parse(ev.data) as StreamMessage;
      } catch {
        return;
      }

      if (!isProgressMsg(data)) {
        if (data.type === "idle") {
          setState({ kind: "idle" });
          es.close();
          return;
        }
        // data.type === "result"
        const finished = data.job.status === "running" ? "aborted" : data.job.status;
        setState({ kind: "done", status: finished, error: data.job.error });
        es.close();
        router.refresh();
        return;
      }

      if (data.phase === "__result__") {
        setState({ kind: "done", status: data.status, error: data.error });
        return;
      }

      setState({ kind: "running", phase: data.phase, message: data.message });
    };

    es.onerror = () => {
      es.close();
    };
  }, [router]);

  const handleClick = useCallback(async () => {
    if (state.kind === "starting" || state.kind === "running" || state.kind === "already-running") {
      return;
    }

    setState({ kind: "starting" });

    try {
      const res = await fetch("/api/sync", { method: "POST" });

      if (res.status === 409) {
        setState({ kind: "already-running" });
        subscribeToStream();
        return;
      }

      if (!res.ok) {
        setState({
          kind: "done",
          status: "failed",
          error: `同期の起動に失敗しました（status ${res.status}）`,
        });
        return;
      }

      setState({ kind: "running" });
      subscribeToStream();
    } catch (err) {
      setState({
        kind: "done",
        status: "failed",
        error: err instanceof Error ? err.message : "同期の起動に失敗しました",
      });
    }
  }, [state.kind, subscribeToStream]);

  const isBusy =
    state.kind === "starting" ||
    state.kind === "running" ||
    state.kind === "already-running";

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.button}
        onClick={() => {
          void handleClick();
        }}
        disabled={isBusy}
      >
        {isBusy ? "同期実行中…" : "同期を実行"}
      </button>

      <div className={styles.status} role="status" aria-live="polite">
        {state.kind === "already-running" && (
          <p>他の同期が既に実行中です。進捗を表示します。</p>
        )}
        {state.kind === "running" && (
          <p>
            進行中
            {state.phase ? `: ${PHASE_LABELS[state.phase]}` : ""}
            {state.message ? ` — ${state.message}` : ""}
          </p>
        )}
        {state.kind === "done" && state.status === "success" && (
          <p className={styles.success}>同期が完了しました。</p>
        )}
        {state.kind === "done" && state.status !== "success" && (
          <p className={styles.error}>
            同期に失敗しました{state.error ? `: ${state.error}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}
