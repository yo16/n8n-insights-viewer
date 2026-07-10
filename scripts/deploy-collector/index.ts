/**
 * マシン負荷収集スクリプトの設置CLI（`npm run deploy-collector`）。
 *
 * 本実装は後続タスクで追加する（docs/requirements.md §5.3、
 * docs/design/data-sync-design.md §4 参照）。
 * 現時点では雛形（tz8）のため未実装であることを明示して終了する。
 */
function main(): void {
  console.error(
    "[deploy-collector] 未実装です。設置CLIの本実装は後続タスクで追加されます。" +
      "（docs/requirements.md §5.3 参照）",
  );
  process.exit(1);
}

main();

export {};
