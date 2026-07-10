/**
 * 同期CLIのエントリポイント（`npm run sync`）。
 *
 * 本実装は後続タスクで追加する（docs/design/data-sync-design.md参照）。
 * 現時点では雛形（tz8）のため未実装であることを明示して終了する。
 */
function main(): void {
  console.error(
    "[sync] 未実装です。同期CLIの本実装は後続タスクで追加されます。" +
      "（docs/design/data-sync-design.md 参照）",
  );
  process.exit(1);
}

main();

export {};
