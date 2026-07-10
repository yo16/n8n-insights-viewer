import { formatJstDateTime } from "@/shared/datetime";
import styles from "./DataCoverageNote.module.css";

export interface DataCoverageNoteProps {
  /** 全期間で直近のマシン負荷サンプル時刻（UTC ISO8601、期間フィルタ非依存）。データが無ければnull */
  latestSampleUtc: string | null;
  /** 選択中の期間（range）内にチャート表示可能なデータが1件でもあるか */
  inRangeHasData: boolean;
}

/**
 * 「データはここまで（最終サンプル: …）」注記（要件 §6.2 / frontend-design.md §7）。
 * 末尾以降は空白のまま今日まで表示するため、末尾がいつかを明示し同期実行へ誘導する。
 *
 * `latestSampleUtc`（全期間で直近）と `inRangeHasData`（選択期間内の有無）を分けて受け取り、
 * 「そもそも全期間で未収集」と「収集はされているが選択期間内に該当データが無い」を
 * 区別して案内する（前者はEmptyStateへの誘導、後者は期間を広げる/最終サンプル時刻の提示）。
 */
export function DataCoverageNote({ latestSampleUtc, inRangeHasData }: DataCoverageNoteProps) {
  if (!latestSampleUtc) {
    return (
      <p className={styles.note} role="note">
        マシン負荷データが全期間で未収集です。同期を実行すると取得できます。
      </p>
    );
  }

  if (!inRangeHasData) {
    return (
      <p className={styles.note} role="note">
        選択期間内にはマシン負荷データがありません（最終サンプル: {formatJstDateTime(latestSampleUtc)} JST）。
        期間を広げるか、同期画面から最新データを取得してください。
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
