/**
 * deploy-collectorの「設置プラン」定義・表示整形（純粋関数）。
 *
 * docs/design/data-sync-design.md §4.1 準拠:
 * 「サーバーへ何を配置し、crontabに何を追加するか」を実行前に表示する。
 */

/** 設置プラン（配置するスクリプト全文・crontab行・対象ディレクトリ等）。 */
export interface DeployPlan {
  /** VM上の専用ディレクトリ。 */
  remoteDir: string;
  /** VM上のcollector.shの絶対パス。 */
  remoteScriptPath: string;
  /** crontabへ追加/更新する1行。 */
  cronLine: string;
  /** 実際に配置するcollector.shの全文（プレースホルダ置換済み）。 */
  renderedScript: string;
  /** GCPプロジェクトID。 */
  project: string;
  /** GCEインスタンスのゾーン。 */
  zone: string;
  /** GCEインスタンス名。 */
  instance: string;
}

/**
 * 設置プランをユーザー向けに表示するテキストへ整形する。
 * 配置先・crontab行・スクリプト全文を含み、これを見てユーザーが承認判断できるようにする。
 */
export function formatPlan(plan: DeployPlan): string {
  return [
    "==== deploy-collector 設置プラン ====",
    `対象VM: ${plan.instance} (project=${plan.project}, zone=${plan.zone})`,
    `配置先: ${plan.remoteScriptPath}`,
    `crontab追加/更新行: ${plan.cronLine}`,
    "  ※ 既存crontabの他の行は保持し、この1行のみを冪等に置換/追加します",
    "",
    "---- collector.sh 全文（この内容がVMへ配置されます） ----",
    plan.renderedScript,
    "---------------------------------------------------------",
  ].join("\n");
}

/** アンインストール手順を表示用テキストへ整形する。 */
export function formatUninstallInstructions(plan: DeployPlan): string {
  return [
    "==== アンインストール手順（手動で実行してください） ====",
    `1. VMへSSH接続: gcloud compute ssh ${plan.instance} --project=${plan.project} --zone=${plan.zone}`,
    `2. crontab -e で以下の行を削除: ${plan.cronLine}`,
    `3. スクリプトと出力ファイルを削除: sudo rm -rf ${plan.remoteDir}`,
    "==========================================================",
  ].join("\n");
}
