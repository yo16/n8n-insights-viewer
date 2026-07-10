/**
 * コマンド実行層の抽象化（CommandRunner）。
 *
 * gcloudコマンドの「組み立て」（`gcloudCommands.ts`）と「実行」を分離するための
 * インターフェース。実装は本ファイルの `GcloudCommandRunner`
 * （実際に子プロセスを起動する）のみで、**単体テストでは決してこれを使わず**、
 * フェイク実装（`tests/scripts/sync/fakes/fakeCommandRunner.ts`）を用いる
 * （本番サーバー保護のため、テスト中に実gcloudコマンドを実行しない）。
 */

import { spawn } from "child_process";

/** コマンド実行結果。 */
export interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * コマンド実行の抽象インターフェース。
 * 実装差し替え（実行 / フェイク）により、gcloud呼び出しをテスト可能にする。
 */
export interface CommandRunner {
  run(command: string, args: string[]): Promise<CommandExecutionResult>;
}

/**
 * 実際に子プロセスとしてコマンドを実行する実装。
 * Windows環境で `gcloud`（`gcloud.cmd`）を解決できるよう `shell: true` を使う。
 *
 * このクラスは同期CLIの実行時にのみ使用し、単体テストでは絶対に使用しない。
 */
export class GcloudCommandRunner implements CommandRunner {
  run(command: string, args: string[]): Promise<CommandExecutionResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { shell: true });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (err) => {
        reject(err);
      });

      child.on("close", (code) => {
        resolve({ stdout, stderr, exitCode: code ?? 0 });
      });
    });
  }
}
