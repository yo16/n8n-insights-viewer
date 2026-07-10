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
 * 空白・シェル特殊文字を含む、もしくは空文字の引数か判定する。
 * これらはダブルクォートで囲まないと `shell: true` 経由で壊れる。
 */
function needsQuoting(arg: string): boolean {
  if (arg.length === 0) {
    return true;
  }
  return /[\s&|<>^'()]/.test(arg);
}

/**
 * `command` と `args` から、`spawn(commandLine, { shell: true })` に渡す
 * 単一のコマンドライン文字列を組み立てる（純粋関数）。
 *
 * Node は `spawn(command, args, { shell: true })` の場合、args配列を
 * エスケープせず空白連結してシェルに渡す（DEP0190）。Windowsではこれが
 * cmd.exe側で再分解され、スペースを含む引数（例:
 * `--command="mkdir -p '/tmp/x' && ..."`）が壊れる。
 * これを避けるため、空白等の特殊文字を含む引数のみを自前でダブルクォート
 * 囲みしてから単一のコマンドライン文字列にまとめる。
 *
 * @throws {Error} `command` または `args` の要素にダブルクォートが含まれる場合。
 *   cmd.exeとPOSIX shellでエスケープ方法が異なり安全に両対応できないため
 *   （現状のgcloud引数にダブルクォートは登場しない）。
 */
export function buildShellCommandLine(command: string, args: string[]): string {
  const parts = [command, ...args];
  return parts
    .map((part) => {
      if (part.includes('"')) {
        throw new Error(
          `buildShellCommandLine: ダブルクォートを含む引数/コマンドはサポートしていません: ${part}`
        );
      }
      return needsQuoting(part) ? `"${part}"` : part;
    })
    .join(" ");
}

/**
 * 実際に子プロセスとしてコマンドを実行する実装。
 * Windows環境で `gcloud`（`gcloud.cmd`）を解決できるよう `shell: true` を使う。
 *
 * `shell: true` の場合、Nodeは引数配列をエスケープせず空白連結してシェルに
 * 渡す（DEP0190）ため、事前に `buildShellCommandLine` で自前クォート済みの
 * 単一コマンドライン文字列を組み立て、args配列は渡さない。
 *
 * このクラスは同期CLIの実行時にのみ使用し、単体テストでは絶対に使用しない。
 */
export class GcloudCommandRunner implements CommandRunner {
  run(command: string, args: string[]): Promise<CommandExecutionResult> {
    return new Promise((resolve, reject) => {
      const commandLine = buildShellCommandLine(command, args);
      const child = spawn(commandLine, { shell: true });

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
