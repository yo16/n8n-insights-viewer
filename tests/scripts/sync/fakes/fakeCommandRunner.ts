/**
 * テスト専用のフェイクCommandRunner。
 *
 * 実gcloudコマンドは絶対に実行せず、呼び出された command/args を記録し、
 * あらかじめ登録した結果（またはコールバック）を返す。
 * 本番サーバー保護のため、単体テストではこれ以外のRunnerを使用しないこと。
 */

import type {
  CommandExecutionResult,
  CommandRunner,
} from "../../../../scripts/sync/commandRunner";

export interface RecordedCall {
  command: string;
  args: string[];
}

type ResultOrHandler =
  | CommandExecutionResult
  | ((call: RecordedCall, index: number) => CommandExecutionResult);

export class FakeCommandRunner implements CommandRunner {
  public readonly calls: RecordedCall[] = [];

  constructor(
    private readonly results: ResultOrHandler[] = [],
    private readonly defaultResult: CommandExecutionResult = {
      stdout: "",
      stderr: "",
      exitCode: 0,
    },
  ) {}

  async run(command: string, args: string[]): Promise<CommandExecutionResult> {
    const call: RecordedCall = { command, args };
    const index = this.calls.length;
    this.calls.push(call);

    const configured = this.results[index];
    if (configured === undefined) {
      return this.defaultResult;
    }
    if (typeof configured === "function") {
      return configured(call, index);
    }
    return configured;
  }
}
