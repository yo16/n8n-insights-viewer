import Link from "next/link";
import styles from "./DataCoverageNotice.module.css";

export interface DataCoverageNoticeProps {
  /** データの末尾日（JST日付キー、YYYY-MM-DD） */
  lastDataDayKey: string;
  /** 今日のJST日付キー（YYYY-MM-DD） */
  todayDayKey: string;
}

/**
 * 「データはここまで」注記（要件 §6.2 / frontend-design.md §7 空状態・エラー状態）。
 *
 * データの末尾が今日より前の場合のみ表示し、同期画面への導線を示す。
 * Server Component（データの新旧比較はServer側で確定済みの日付キーの文字列比較のみ）。
 */
export function DataCoverageNotice({ lastDataDayKey, todayDayKey }: DataCoverageNoticeProps) {
  if (lastDataDayKey >= todayDayKey) return null;

  return (
    <p className={styles.notice} role="status">
      データはここまで（最終データ日: {lastDataDayKey}）。それ以降は同期未実行のため空白です。
      <Link href="/sync" className={styles.link}>
        同期状況を確認する
      </Link>
    </p>
  );
}
