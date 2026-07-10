/**
 * crontabの冪等な更新ロジック（純粋関数）。
 *
 * docs/design/data-sync-design.md §4.1 準拠:
 * 「既存の同一行があれば追加しない」冪等な方式にする
 * （現行crontabを取得 → 目的行が無ければ追記 → 書き戻し）。
 *
 * **絶対厳守**: 既存のcrontab内容（他の行・コメント・空行）は一切変更しない。
 * collector.shを指す行（`markerPath` を含む行）だけを検出し、置換/追加する。
 */

/**
 * 既存crontab内容に、collector用の1行を冪等にマージする。
 *
 * - `markerPath`（VM上のcollector.shの絶対パス）を含む既存行は削除し、
 *   末尾に新しい `cronLine` を1行だけ追加する（重複防止・内容更新の両対応）
 * - `markerPath` を含まない行（他のcron・コメント・空行）はすべてそのまま保持する
 * - 返り値は末尾に改行を1つ持つテキスト（`crontab -` へそのまま渡せる形式）
 */
export function mergeCrontab(
  existingContent: string,
  cronLine: string,
  markerPath: string,
): string {
  const lines =
    existingContent.length > 0 ? existingContent.split(/\r?\n/) : [];

  const preserved = lines.filter((line) => !line.includes(markerPath));

  // split()によって生じる末尾の空文字列要素（末尾改行由来）だけを取り除く。
  // 既存内容の中間にある空行はそのまま保持する。
  while (
    preserved.length > 0 &&
    preserved[preserved.length - 1].trim() === ""
  ) {
    preserved.pop();
  }

  preserved.push(cronLine);

  return `${preserved.join("\n")}\n`;
}
