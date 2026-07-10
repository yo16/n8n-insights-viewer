import { formatJstDateTime } from "@/shared/datetime";
import styles from "./DataCoverageNote.module.css";

export interface DataCoverageNoteProps {
  /** 直近のマシン負荷サンプル時刻（UTC ISO8601）。データが無ければnull */
  latestSampleUtc: string | null;
}

/**
 * 「データはここまで（最終サンプル: …）」注記（要件 §6.2 / frontend-design.md §7）。
 * 末尾以降は空白のまま今日まで表示するため、末尾がいつかを明示し同期実行へ誘導する。
 */
export function DataCoverageNote({ latestSampleUtc }: DataCoverageNoteProps) {
  if (!latestSampleUtc) {
    return (
      <p className={styles.note} role="note">
        マシン負荷データがまだ収集されていません。同期を実行すると取得できます。
      </p>
    );
  }

  return (
    <p className={styles.note} role="note">
      データはここまで（最終サンプル: {formatJstDateTime(latestSampleUtc)} JST）。
      最新の状況を確認するには同期画面から同期を実行してください。
    </p>
  );
}
