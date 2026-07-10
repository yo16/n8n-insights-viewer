import "server-only";

import { SyncProgressEventSchema } from "../../../scripts/sync/progress";
import type { SyncProgressEvent } from "./types";

/**
 * 子プロセスのstdoutから受信したチャンクを行単位（JSON Lines）に分割し、
 * 進捗イベントへパースする純粋関数。
 *
 * `docs/design/data-sync-design.md` §2.1 準拠:
 * - 1行1JSONで出力される
 * - 改行がチャンク境界をまたぐ場合があるため、末尾の未確定行は `remainder` として
 *   呼び出し側に返し、次のチャンクの先頭に連結して再度渡す
 * - JSONとしてパースできない行・スキーマに合致しない行は無視する
 *   （人間可読ログ等がstdoutに紛れても進捗配信全体を壊さないため）
 */
export interface ParseProgressLinesResult {
  events: SyncProgressEvent[];
  remainder: string;
}

export function parseProgressLines(
  buffered: string,
  chunk: string,
): ParseProgressLinesResult {
  const combined = buffered + chunk;
  const lines = combined.split("\n");
  // 最後の要素は改行で終わっていない未確定行（もしくは空文字）
  const remainder = lines.pop() ?? "";

  const events: SyncProgressEvent[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") continue;

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(line);
    } catch {
      // JSONでない行（人間可読ログ等）は無視する
      continue;
    }

    const result = SyncProgressEventSchema.safeParse(parsedJson);
    if (result.success) {
      events.push(result.data);
    }
    // スキーマ不一致の行も無視する（進捗配信全体を壊さない）
  }

  return { events, remainder };
}
