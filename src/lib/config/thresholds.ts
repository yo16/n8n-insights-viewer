// NOTE: 本来は Next.js 規約に合わせて `import "server-only";` を先頭に置きたいが、
// "server-only" パッケージは現時点で package.json に未導入であり、
// 本タスクの制約（package.jsonへの依存追加はしない）により追加できない。
// fsを使う本モジュールはNext.jsのServer専用コード（src/lib配下）にのみ配置しており、
// クライアントバンドルからimportされない運用を前提とする。
// 依存追加は別タスクで検討し、追加され次第 `import "server-only";` を有効化すること。
import fs from "fs";
import path from "path";
import { z } from "zod";

/**
 * config/thresholds.json のスキーマ（api-design.md §5 / db-design.md参照）。
 */
const ThresholdRangeSchema = z.object({
  warning: z.number().positive(),
  danger: z.number().positive(),
});

const DbSizeThresholdSchema = z.object({
  warning: z.number().positive(),
});

export const ThresholdsSchema = z.object({
  memAvailableKb: ThresholdRangeSchema,
  swapUsedKb: ThresholdRangeSchema,
  dbSizeBytes: DbSizeThresholdSchema,
  trendSampleMin: z.number().int().positive(),
});

export type Thresholds = z.infer<typeof ThresholdsSchema>;

const DEFAULT_THRESHOLDS_PATH = path.join(process.cwd(), "config", "thresholds.json");

/**
 * config/thresholds.json を読み込み、zodで検証して返す。
 *
 * - **毎回読み込み、キャッシュしない**（force-dynamicのため毎リクエストでファイルを読み、
 *   リロードでの変更即時反映を優先する。api-design.md §5 / §8）
 * - filePath はテスト用に上書き可能（既定は `config/thresholds.json`）
 */
export function loadThresholds(filePath: string = DEFAULT_THRESHOLDS_PATH): Thresholds {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    throw new Error(
      `thresholds設定ファイルの読み込みに失敗しました (${filePath}): ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `thresholds設定ファイルが不正なJSONです (${filePath}): ${(err as Error).message}`,
    );
  }

  const result = ThresholdsSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `thresholds設定ファイルのスキーマ検証に失敗しました (${filePath}): ${result.error.message}`,
    );
  }
  return result.data;
}
