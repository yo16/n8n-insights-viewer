/**
 * 方式C: Cloud Monitoring REST API経由でのCPU使用率取得のオーケストレーション。
 *
 * docs/design/data-sync-design.md §5 Phase 5 / §3.4準拠。
 *
 * `gcloud monitoring time-series list` は実在しないサブコマンドのため、
 * 1) `gcloud auth print-access-token`（CommandRunner経由・読み取り専用）でアクセストークンを取得し、
 * 2) Node組み込みの `fetch` でCloud Monitoring REST API（`timeSeries.list`）をHTTP呼び出しする、
 * という2段階の方式に変更した。
 *
 * テストで実HTTP/実gcloudを一切実行しないよう、`CommandRunner` と `fetch` の
 * 両方を呼び出し側から注入可能にしている（既定の `fetch` は `globalThis.fetch`）。
 */

import type { CommandRunner } from "./commandRunner";
import {
  buildAccessTokenCommand,
  buildCpuMetricsRequestUrl,
} from "./collectMetricsCommands";
import {
  parseCpuMetricsRestPage,
  type ParsedCpuMetricPoint,
} from "./collectMetricsParsers";
import type { GcloudSyncConfig } from "./config";

/** `fetch` と互換の関数シグネチャ（テストではモック関数を注入する）。 */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

/** `fetchCpuMetricsViaRestApi` のオプション。 */
export interface FetchCpuMetricsOptions {
  /** アクセストークン取得（`gcloud auth print-access-token`）に使うCommandRunner。 */
  runner: CommandRunner;
  gcloudConfig: GcloudSyncConfig;
  /** 取得区間の開始時刻（ISO 8601、UTC）。 */
  intervalStartTimeIso: string;
  /** 取得区間の終了時刻（ISO 8601、UTC）。 */
  intervalEndTimeIso: string;
  /** HTTP呼び出しに使う関数。省略時は `globalThis.fetch`。 */
  fetchFn?: FetchLike;
  /** 1リクエストあたりのタイムアウト（ミリ秒）。省略時は15秒。 */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * ページネーションの安全弁。想定される取得期間（最大過去6週間・数分間隔）でも
 * 数百ページには到達しない見込みだが、`nextPageToken` が誤って循環した場合に
 * 無限ループへ陥らないよう上限を設ける（**独自判断**）。
 */
const MAX_PAGES = 100;

/**
 * Cloud Monitoring REST API経由でCPU使用率の時系列を取得する。
 *
 * アクセストークン取得失敗・HTTPエラー（非2xx）・タイムアウト・不正なレスポンスは
 * いずれも例外として投げる。呼び出し側（collectMetricsPhase.ts）がこれを
 * catchしてwarningsへ集約し、同期全体を失敗させない設計に合わせる。
 */
export async function fetchCpuMetricsViaRestApi(
  options: FetchCpuMetricsOptions,
): Promise<ParsedCpuMetricPoint[]> {
  const { runner, gcloudConfig, intervalStartTimeIso, intervalEndTimeIso } =
    options;
  const fetchFn = options.fetchFn ?? (globalThis.fetch as FetchLike | undefined);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (!fetchFn) {
    throw new Error("fetchが利用できない実行環境です");
  }

  const tokenPlan = buildAccessTokenCommand();
  const tokenResult = await runner.run(tokenPlan.command, tokenPlan.args);
  if (tokenResult.exitCode !== 0) {
    throw new Error(
      `アクセストークンの取得に失敗しました: ${
        tokenResult.stderr || tokenResult.stdout || "unknown error"
      }`,
    );
  }
  const accessToken = tokenResult.stdout.trim();
  if (!accessToken) {
    throw new Error("アクセストークンが空でした");
  }

  const pointsByTs = new Map<string, number>();
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const url = buildCpuMetricsRequestUrl(
      gcloudConfig,
      intervalStartTimeIso,
      intervalEndTimeIso,
      pageToken,
    );

    const response = await fetchFn(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Cloud Monitoring REST APIの呼び出しに失敗しました (HTTP ${response.status}): ${body}`,
      );
    }

    const text = await response.text();
    const { points, nextPageToken } = parseCpuMetricsRestPage(text);
    for (const point of points) {
      pointsByTs.set(point.tsUtc, point.cpuUtil);
    }

    pageToken = nextPageToken;
    pageCount += 1;
  } while (pageToken && pageCount < MAX_PAGES);

  return Array.from(pointsByTs.entries())
    .map(([tsUtc, cpuUtil]) => ({ tsUtc, cpuUtil }))
    .sort((a, b) => a.tsUtc.localeCompare(b.tsUtc));
}
