import "server-only";

import type Database from "better-sqlite3";

/**
 * 画面6（同期ステータス）専用: データのカバー範囲（最古〜最新）の算出。
 *
 * `docs/design/frontend-design.md` 画面6は「データのカバー範囲」の表示を要求するが、
 * `docs/design/api-design.md` §6 のクエリ一覧（`queries/sync.ts`）は
 * `getLatestSyncHistory`/`getSyncHistoryList` のみを定義しており、カバー範囲用の
 * クエリは含まれていない。本タスクの担当領域は `src/app/sync/**` /
 * `src/components/sync/**` に限定されているため、`src/lib/db/queries` への追加は行わず、
 * 本ページ専用のヘルパとしてここに置く（実装完了報告の「独自判断点」参照）。
 *
 * 既存クエリ（`queries/sync.ts`）と同様に、呼び出し側から渡された
 * `Database.Database`（read-only接続）に対してSQLを発行するだけの薄い関数とする。
 */

/** ある期間データの最古〜最新（ISO8601, UTC）。データが1件も無ければ両方 `null`。 */
export interface DateRange {
  min: string | null;
  max: string | null;
}

/** 画面6で表示するデータのカバー範囲。 */
export interface CoverageRange {
  /** insights_by_period.periodStart の範囲（Insights推移・ワークフロー別集計の元データ）。 */
  insights: DateRange;
  /** execution_entity.startedAt の範囲（実行明細。ローカル蓄積分）。 */
  executions: DateRange;
}

interface MinMaxRow {
  minValue: string | null;
  maxValue: string | null;
}

function getRange(db: Database.Database, table: string, column: string): DateRange {
  // テーブル名・カラム名は固定文字列（呼び出し元定数）のみを渡す想定で、
  // ユーザー入力を連結しないためSQLインジェクションの懸念はない。
  const row = db
    .prepare<[], MinMaxRow>(
      `SELECT MIN(${column}) as minValue, MAX(${column}) as maxValue FROM ${table}`,
    )
    .get();

  return {
    min: row?.minValue ?? null,
    max: row?.maxValue ?? null,
  };
}

/**
 * データのカバー範囲（Insights・実行明細それぞれの最古〜最新）を取得する。
 * 蓄積DBは初期化時に全テーブルのDDLを実行済み（`src/shared/db/init.ts`）のため、
 * 同期が一度も成功していない場合でもテーブル自体は存在し、結果は `{ min: null, max: null }` になる。
 */
export function getCoverageRange(db: Database.Database): CoverageRange {
  return {
    insights: getRange(db, "insights_by_period", "periodStart"),
    executions: getRange(db, "execution_entity", "startedAt"),
  };
}
