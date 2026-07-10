"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";
import {
  buildExecutionsHref,
  type ExecutionsFilterState,
} from "./queryParams";
import styles from "./ExecutionFilters.module.css";

/**
 * 画面4（実行明細）のフィルタUI。
 *
 * `docs/design/frontend-design.md` 画面4 / `docs/design/app-architecture.md` §4:
 * フィルタ操作はURL searchParamsを更新し、Server Component（page.tsx）に再クエリさせる。
 * ここではURLの組み立てとナビゲーションのみを担い、データ取得ロジックは持たない。
 */

const STATUS_OPTIONS = [
  "success",
  "error",
  "crashed",
  "waiting",
  "running",
  "canceled",
] as const;

const MODE_OPTIONS = [
  "manual",
  "trigger",
  "webhook",
  "retry",
  "internal",
  "cli",
  "integrated",
  "error",
] as const;

export type ExecutionFiltersProps = {
  current: ExecutionsFilterState;
  /** ワークフロー絞り込みの選択肢（`queries/workflows.ts` 由来） */
  workflowOptions: { id: string; name: string }[];
};

export function ExecutionFilters({
  current,
  workflowOptions,
}: ExecutionFiltersProps) {
  const router = useRouter();

  const navigate = (overrides: Partial<ExecutionsFilterState>) => {
    router.push(
      buildExecutionsHref("/executions", current, { ...overrides, page: 1 }),
    );
  };

  const handleSelectChange =
    (key: "status" | "mode" | "workflowId") =>
    (e: ChangeEvent<HTMLSelectElement>) => {
      navigate({ [key]: e.target.value || undefined });
    };

  const handleDateChange =
    (key: "since" | "until") => (e: ChangeEvent<HTMLInputElement>) => {
      navigate({ [key]: e.target.value || undefined });
    };

  const hasFilter = Boolean(
    current.status ||
      current.mode ||
      current.workflowId ||
      current.since ||
      current.until,
  );

  return (
    <form
      className={styles.form}
      aria-label="実行明細の絞り込み"
      onSubmit={(e) => e.preventDefault()}
    >
      <label className={styles.field}>
        <span className={styles.label}>状態</span>
        <select
          className={styles.control}
          value={current.status ?? ""}
          onChange={handleSelectChange("status")}
        >
          <option value="">すべて</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>モード</span>
        <select
          className={styles.control}
          value={current.mode ?? ""}
          onChange={handleSelectChange("mode")}
        >
          <option value="">すべて</option>
          {MODE_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>ワークフロー</span>
        <select
          className={styles.control}
          value={current.workflowId ?? ""}
          onChange={handleSelectChange("workflowId")}
        >
          <option value="">すべて</option>
          {workflowOptions.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span className={styles.label}>開始日（以降・JST）</span>
        <input
          type="date"
          className={styles.control}
          value={current.since ?? ""}
          onChange={handleDateChange("since")}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>開始日（以前・JST）</span>
        <input
          type="date"
          className={styles.control}
          value={current.until ?? ""}
          onChange={handleDateChange("until")}
        />
      </label>

      {hasFilter ? (
        <button
          type="button"
          className={styles.reset}
          onClick={() => router.push("/executions")}
        >
          フィルタ解除
        </button>
      ) : null}
    </form>
  );
}
