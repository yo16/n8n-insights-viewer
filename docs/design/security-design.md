# セキュリティ設計 — 機微データの除去・生コピー削除・本番サーバー保護

## 関連ドキュメント

- [設計概要](./overview.md)
- [データ同期設計](./data-sync-design.md) — 同期フェーズ・cleanup・deploy-collector承認フロー
- [DB設計](./db-design.md) — 抽出対象5テーブル・sync_history.raw_copy_deleted
- [データアクセス層設計](./api-design.md) — read-onlyアクセス
- [要件 §4 データ取得方式](../requirements.md) / [§5.3](../requirements.md) / [§7 非機能要件](../requirements.md)

---

## 1. 脅威モデルと保護対象

本アプリは個人ローカル運用でデプロイしない（[要件 §6.4](../requirements.md)）ため、
ネットワーク経由の攻撃面は小さい。保護すべきは主に2点:

1. **機微データの漏洩防止**: 本番DB生コピーには `credentials_entity`（認証情報）等の
   機微テーブルが含まれる。これを蓄積DBやgit・ディスク上に残さない
2. **本番n8nサーバーの保護**: 本番へのソフト導入・常駐追加・n8nワークフロー追加をしない
   （OOM再発リスク・データ汚染の回避。[要件 §4.2 / §7](../requirements.md)）

---

## 2. 抽出対象の限定

同期時、生コピー（`data/raw/database.sqlite`）から読み出すのは**必要5テーブルのみ**
（[db-design.md §3.1](./db-design.md#31-n8n由来テーブル)）:

- insights_by_period / insights_metadata / workflow_entity / workflow_statistics / execution_entity

以下は**一切読まない・蓄積DBに書かない**:

- `credentials_entity`（認証情報）、`shared_credentials`、`variables`、`settings` 等の機微テーブル
- `execution_entity.data`（実行の入出力JSON。機微情報を含みうる。[db-design.md](./db-design.md#execution_entity追記upsertローカルに履歴蓄積)）
- `execution_data` / バイナリデータ等の重い機微カラム

抽出は「必要な列を明示的にSELECTする」ホワイトリスト方式とし、
`SELECT *` で機微カラムを巻き込まない。

---

## 3. 生コピー削除の保証

生コピーは**抽出後に必ず削除**する（[要件 §4方式A手順4 / §7](../requirements.md)）。

- **cleanupフェーズを try/finally 相当で必ず実行**する。fetch〜ingestのどこで失敗しても、
  `data/raw/` の生コピー（database.sqlite・-wal）を削除する
  （[data-sync-design.md §4.6](./data-sync-design.md#46-phase-6-cleanup生コピー削除必ず実行)）
- サーバー側 `/tmp` のスナップショットも、scp取得直後に `rm` で削除
  （[data-sync-design.md §4.1](./data-sync-design.md#41-phase-1-fetchdbコピー取得)）。サーバーに残さない
- 削除完了を `sync_history.raw_copy_deleted=1` に記録（監査・[db-design.md sync_history](./db-design.md#sync_history追記-同期実行の履歴)）
- **異常終了時のリカバリ**: 次回同期の開始時、前回の生コピーが `data/raw/` に
  残っていないかを確認し、あれば削除してから開始する（保険）

---

## 4. gitと機微データ

- **`data/` ディレクトリ全体を `.gitignore`** に追加済み（[要件 §7](../requirements.md)、
  現行 `.gitignore` に `data/` 記載を確認済み）
- 生コピー・蓄積DB・raw配下は**一切コミットしない**
- `config/thresholds.json` は機微情報を含まない（閾値のみ）ためコミット対象
- 認証情報（gcloud認証）はgcloud CLIの管理下にあり、リポジトリには置かない。
  `.env*` は `.gitignore` 済み

---

## 5. 本番サーバー保護

[要件 §4.2 / §7](../requirements.md)、[プロジェクトメモリ: 本番n8nに何も入れない]の厳守。

### 5.1 許可される操作のみ

- **読み取り**: `gcloud compute ssh --command` による標準コマンド（cat/cp/ls/du/df/docker stats/journalctl等）
- **取得**: `gcloud compute scp` によるファイル取得
- **唯一の書き込み例外**: 負荷収集スクリプト1本 + cron1行の設置（[要件 §5.3](../requirements.md)）

### 5.2 禁止

- ソフトウェア導入（`apt install` 等）、常駐プロセス追加、n8nワークフロー追加
- 収集スクリプト設置以外の書き込み（ファイル改変・設定変更・DB書き込み）
- gcloudコマンドに書き込み系操作を含めること（同期CLIのコードレビュー観点）

### 5.3 deploy-collectorの承認フロー

収集スクリプトの設置・更新は**内容表示 → ユーザー承認 → 実行**を必須とする
（[data-sync-design.md §4.1](./data-sync-design.md#41-承認フロー必須)、
[プロジェクトメモリ: 承認フロー]）。黙って設置・変更しない。

- 配置先・cron行・既存との差分を表示
- yes/no確認。noなら何もしない
- crontab更新は冪等（既存の同一行は追加しない）
- 収集スクリプトは標準コマンドのみで構成し、新規ソフトを導入しない

### 5.4 collectorがn8nに関与しないこと

収集スクリプトはホストのcronで動き、n8nの外で完結する。
n8nの実行記録・insights集計・workflow_statisticsを一切汚染しない
（[要件 §4.2 / §5.3](../requirements.md)）。可視化対象データの純度を保つ。

---

## 6. read-onlyアクセスの二重防御

BI（アプリ）は蓄積DBを破壊しない:

- `{ readonly: true, fileMustExist: true }` + `PRAGMA query_only = ON`
  （[api-design.md §2.1](./api-design.md#21-read-onlyオープン)）
- 書き込みは同期CLIの専権。BIプロセスからは物理的に書けない

---

## 7. 監査・確認ポイント

| 項目 | 確認手段 |
|---|---|
| 生コピー削除 | `sync_history.raw_copy_deleted` が全同期で1。同期後 `data/raw/` が空 |
| 機微テーブル非混入 | 蓄積DBに credentials 等のテーブルが存在しないこと |
| 本番への書き込みなし | 同期/収集コードのgcloudコマンドが読み取り・scp・承認済み設置のみ |
| gitへの機微混入なし | `data/` が追跡対象外（`git status` で無視されている） |

---

## 8. 設計判断

- **ホワイトリスト抽出**: `SELECT *` を避け、必要列を明示することで機微カラムの
  巻き込みをスキーマ変更時も防ぐ
- **cleanupをfinallyで必ず実行 + 次回開始時の残存チェック**: 生コピー削除の
  取りこぼしを二重に防ぐ（最重要のセキュリティ要件のため）
- **raw_copy_deletedの監査フラグ**: 「必ず削除」が守られたことを事後確認可能にする
- **認証はgcloud CLIに委譲**: 独自の認証情報管理を持たず攻撃面を増やさない（YAGNI）
