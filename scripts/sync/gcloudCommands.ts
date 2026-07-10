/**
 * gcloudコマンドの組み立て（純粋関数・実行は行わない）。
 *
 * docs/design/data-sync-design.md §5 Phase 1: fetch の手順に対応する。
 * ここで組み立てるコマンドは**読み取り・自分が作ったサーバー側/tmpコピーの削除のみ**
 * （docs/design/security-design.md §5.1/§5.2, 絶対厳守事項）:
 *
 * 1. リモートスナップショット: `gcloud compute ssh --command`
 *    （リモートの/tmpへ `sudo cp`。本番の元ファイルは読むのみで変更しない）
 * 2. `gcloud compute scp` で database.sqlite を取得
 * 3. `gcloud compute scp` で database.sqlite-wal を取得（無ければ失敗してもよい）
 * 4. リモート/tmpの後始末: `gcloud compute ssh --command "sudo rm -rf <tmpDir>"`
 *    （削除対象は自分が作った一時ディレクトリのみ）
 *
 * 実行（子プロセス起動）は行わない。`CommandRunner` に渡すための
 * コマンド・引数の組み立てに専念することで、単体テストで組み立て結果のみを
 * 検証できるようにする（本番へgcloudを実行せずに検証可能）。
 */

import type { GcloudSyncConfig } from "./config";

/** 実行対象コマンド1件分の情報。 */
export interface PlannedCommand {
  /** 進捗ログ・エラーメッセージに使う説明文。 */
  description: string;
  /** 実行コマンド本体（常に `"gcloud"`）。 */
  command: string;
  /** コマンド引数。 */
  args: string[];
}

/** fetchフェーズで実行するコマンド一式。 */
export interface FetchCommandPlan {
  /** 手順1: リモートスナップショット（sudo cp を /tmp へ）。 */
  snapshot: PlannedCommand;
  /** 手順2: database.sqlite の取得（scp）。 */
  scpDb: PlannedCommand;
  /** 手順3: database.sqlite-wal の取得（scp、無ければ失敗してよい）。 */
  scpWal: PlannedCommand;
  /** 手順4: サーバー側/tmpの後始末（自分が作った一時ディレクトリのみ削除）。 */
  cleanupRemoteTmp: PlannedCommand;
}

function remoteTarget(config: GcloudSyncConfig): string {
  return config.instance;
}

function projectZoneArgs(config: GcloudSyncConfig): string[] {
  return [`--project=${config.project}`, `--zone=${config.zone}`];
}

/**
 * リモート側で実行させるシェルスクリプト（sudo cp のみ・書き込み系操作は含めない）。
 * 自分が作る一時ディレクトリ配下のコピーに対してのみ chmod する。
 */
function buildRemoteSnapshotScript(config: GcloudSyncConfig): string {
  const { remoteDbPath, remoteTmpDir } = config;
  return [
    `mkdir -p '${remoteTmpDir}'`,
    `sudo cp '${remoteDbPath}' '${remoteTmpDir}/database.sqlite'`,
    `(sudo cp '${remoteDbPath}-wal' '${remoteTmpDir}/database.sqlite-wal' || true)`,
    `sudo chmod 644 '${remoteTmpDir}/database.sqlite'`,
    `(sudo chmod 644 '${remoteTmpDir}/database.sqlite-wal' 2>/dev/null || true)`,
  ].join(" && ");
}

function buildRemoteCleanupScript(config: GcloudSyncConfig): string {
  return `sudo rm -rf '${config.remoteTmpDir}'`;
}

/**
 * fetchフェーズで実行するgcloudコマンド一式を組み立てる（純粋関数・副作用なし）。
 *
 * @param config gcloud接続先設定
 * @param localRawDbPath  取得先ローカルパス（database.sqlite）
 * @param localRawWalPath 取得先ローカルパス（database.sqlite-wal）
 */
export function buildFetchCommandPlan(
  config: GcloudSyncConfig,
  localRawDbPath: string,
  localRawWalPath: string,
): FetchCommandPlan {
  const target = remoteTarget(config);
  const pzArgs = projectZoneArgs(config);

  const snapshot: PlannedCommand = {
    description: "本番DBのスナップショットをサーバー側/tmpへ作成",
    command: "gcloud",
    args: [
      "compute",
      "ssh",
      target,
      ...pzArgs,
      "--command",
      buildRemoteSnapshotScript(config),
    ],
  };

  const scpDb: PlannedCommand = {
    description: "database.sqlite をローカルへ取得",
    command: "gcloud",
    args: [
      "compute",
      "scp",
      `${target}:${config.remoteTmpDir}/database.sqlite`,
      localRawDbPath,
      ...pzArgs,
    ],
  };

  const scpWal: PlannedCommand = {
    description: "database.sqlite-wal をローカルへ取得",
    command: "gcloud",
    args: [
      "compute",
      "scp",
      `${target}:${config.remoteTmpDir}/database.sqlite-wal`,
      localRawWalPath,
      ...pzArgs,
    ],
  };

  const cleanupRemoteTmp: PlannedCommand = {
    description: "サーバー側/tmpの一時コピーを削除",
    command: "gcloud",
    args: [
      "compute",
      "ssh",
      target,
      ...pzArgs,
      "--command",
      buildRemoteCleanupScript(config),
    ],
  };

  return { snapshot, scpDb, scpWal, cleanupRemoteTmp };
}
