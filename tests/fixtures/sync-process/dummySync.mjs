// テスト専用のダミー同期スクリプト。
//
// src/lib/sync-process のテストで「実際に npm run sync（gcloud経由の本番同期）を
// 起動しない」ため、spawnするコマンドをこのファイルに差し替える。
// scripts/sync/progress.ts と同形式のJSON LinesをstdoutへEmitするだけで、
// gcloud等の外部コマンドには一切触れない。
//
// 使い方: `node tests/fixtures/sync-process/dummySync.mjs [mode]`
//   mode 省略時 or "success": fetch開始→完了→__result__ success を出力して正常終了(exit 0)
//   mode "failed": __result__ failed を出力して異常終了(exit 1)
//   mode "crash": 何も出力せず非0で終了(exit 3)
//   mode "slow": イベント間に間隔を空けて出力する（購読タイミングの確認用）

const mode = process.argv[2] ?? "success";

function emit(obj) {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (mode === "crash") {
    process.exitCode = 3;
    return;
  }

  emit({ phase: "fetch", status: "start", ts: new Date().toISOString() });

  if (mode === "slow") {
    await sleep(50);
  }

  emit({ phase: "fetch", status: "done", ts: new Date().toISOString() });

  if (mode === "failed") {
    emit({ phase: "__result__", status: "failed", error: "dummy failure" });
    process.exitCode = 1;
    return;
  }

  emit({
    phase: "__result__",
    status: "success",
    rowsIngested: { workflow_entity: 3 },
  });
  process.exitCode = 0;
}

main();
