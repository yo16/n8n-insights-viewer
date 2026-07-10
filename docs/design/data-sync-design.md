# データ同期設計 — 同期CLI・負荷収集スクリプト・deploy-collector

## 関連ドキュメント

- [設計概要](./overview.md)
- [DB設計](./db-design.md) — 取り込み先スキーマ・更新戦略
- [データアクセス層設計](./api-design.md#3-同期の子プロセス起動) — BIからの同期起動（Route Handler / SSE）
- [セキュリティ設計](./security-design.md) — 生コピー削除・機微テーブル除去
- [アプリ構成](./app-architecture.md) — ディレクトリ構造（scripts/, src/shared/）
- [要件 §4 データ取得方式](../requirements.md) / [§5 マシン負荷収集](../requirements.md) / [§7 非機能要件](../requirements.md)

---

## 1. 概要

本アプリのデータ取得は、**BI（Next.jsアプリ）とは別プロセスの手動CLI**として実装する
（[要件 §4.3](../requirements.md)）。定期実行・BI起動時の自動実行は行わない。

構成要素は3つ:

1. **同期CLI** (`npm run sync`, `scripts/sync/`): 本番DBコピー取得 → 抽出 → 蓄積DBへ取り込み +
   マシン負荷スポット収集 + OOM/CPU/cronファイル回収
2. **収集スクリプト** (`scripts/deploy-collector/collector.sh`): VM上のcronで1時間ごとに
   メトリクスをファイル出力する方式D（[要件 §5.3](../requirements.md)）
3. **deploy-collector CLI** (`npm run deploy-collector`, `scripts/deploy-collector/`):
   収集スクリプトとcron1行をVMへ設置する。**内容表示 → ユーザー承認 → 実行**

### 1.1 大前提（厳守）

- **本番サーバーへの変更は §5.3の収集スクリプト設置のみ**（[要件 §7](../requirements.md)、
  [security-design.md §本番保護](./security-design.md#5-本番サーバー保護)）
- gcloudコマンドは**読み取り（cat/cp/ls）とscp取得のみ**。書き込み系を含めない
- 生コピー（credentials等を含む）は**抽出後に必ず削除**する
- 実行環境はWindows 11。gcloud CLIを利用（[要件 §6.4](../requirements.md)）

### 1.2 純粋ロジックの共有（src/shared）

zodスキーマ・JST変換・型・collectorの出力パース等、**Next.js非依存の純粋TS**は
`src/shared/` に置き、同期CLIとアプリの双方から相対importで使う
（[app-architecture.md §src/shared](./app-architecture.md#33-srcshared--nextjs非依存の純粋層)）。
CLIは `tsx` で実行するため、Next.jsランタイムに依存させない。

---

## 2. 同期CLIの全体フロー

同期は6フェーズに分割し、各フェーズの成否と到達点を `sync_history` に記録する
（[db-design.md §sync_history](./db-design.md#sync_history追記-同期実行の履歴)）。

```
fetch → validate → extract → ingest → collect-metrics → cleanup
  │        │          │         │           │              │
 DBコピー  整合性/    生コピー  蓄積DBへ    スポット収集    生コピー削除
 取得      スキーマ   から5表   取り込み    OOM/CPU/cron   （必ず実行）
          検証       抽出                  回収
```

進捗は **JSON Linesでstdoutに出力**し、BIのRoute Handler（SSE）が中継する
（[api-design.md §3](./api-design.md#3-同期の子プロセス起動)）。

### 2.1 進捗イベント形式（JSON Lines）

CLIは1行1JSONで進捗を吐く。スキーマは `src/shared/sync/progress.ts`（zod）で定義:

```jsonc
{"phase":"fetch","status":"start","ts":"2026-07-10T05:00:00Z"}
{"phase":"fetch","status":"progress","message":"scp 120MB/300MB","pct":40}
{"phase":"fetch","status":"done","ts":"2026-07-10T05:03:00Z"}
{"phase":"validate","status":"error","message":"schema mismatch: insights_by_period.value not found"}
{"phase":"__result__","status":"failed","rowsIngested":{},"error":"..."}
```

- `phase` は6フェーズ名 + `__result__`（最終結果）
- BI側はこれをパースして進捗バー・フェーズ表示を更新する

---

## 3. 収集スクリプト（方式D）— collector.sh

VM上のcronで1時間に1回動く、**標準コマンドのみ**で構成されたシェルスクリプト
（[要件 §5.3](../requirements.md)）。新規ソフトは導入しない。

### 3.1 設置場所・cron

- 専用ディレクトリ: `/root/insights_collector/`
  - `collector.sh`（スクリプト1本）
  - `metrics.jsonl`（出力ファイル1本・追記）
- crontab（rootに1行）: `17 * * * * /root/insights_collector/collector.sh`
  - **分は00を避けて17分にずらす**（ワークフローのスケジュール実行と重ねない。[要件 §5.3](../requirements.md)）

### 3.2 出力形式（JSONL）

1行1サンプルのJSON Lines。UTCタイムスタンプ。1行約150バイト → 年間約1.3MB
（ローテーション不要。[要件 §5.3](../requirements.md)）。

```jsonc
{"v":"collector-1","ts":"2026-07-10T05:17:03Z","mem":{"total_kb":977000,"available_kb":142000,"free_kb":38000},"swap":{"total_kb":2097148,"free_kb":1600000},"load":[0.42,0.55,0.60],"db":{"sqlite_bytes":322961408,"wal_bytes":24117248},"rootfs_avail_bytes":8123456789,"containers":[{"name":"n8n","cpu_pct":3.2,"mem_bytes":210000000,"mem_limit_bytes":0},{"name":"traefik","cpu_pct":0.1,"mem_bytes":25000000,"mem_limit_bytes":0}]}
```

- **`v`（バージョン識別子）**を必ず含める。リポジトリ側の想定版とVM設置版のズレを
  同期時に検知するため（[要件 §5.3](../requirements.md)、[§3.4](#34-バージョン不一致の扱い)）
- 収集項目は[要件 §5.1方式B](../requirements.md)と同一:
  MemAvailable/MemFree/SwapTotal/SwapFree（`/proc/meminfo`）、load average（`/proc/loadavg`）、
  `docker stats --no-stream`、`database.sqlite`+WALサイズ（`du`/`stat`）、ルートFS空き（`df`）

### 3.3 スクリプトの構成（標準コマンドのみ）

```sh
#!/bin/sh
# collector.sh — 標準コマンドのみ。新規ソフト導入なし。n8nに一切関与しない。
V="collector-1"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
# /proc/meminfo, /proc/loadavg を cat/awk で抽出
# docker stats --no-stream --format ... （dockerはプリインストール済み）
# du/stat で database.sqlite と -wal のサイズ、df でルートFS空き
# 1行のJSONを組み立て metrics.jsonl へ追記（>>）
```

- awk/date/cat/du/stat/df/docker はプリインストール済み。**新規導入なし**
- 実行時間1秒未満・常駐なし（[要件 §5.3](../requirements.md)）
- n8nの外（ホストのcron）で動くため、実行記録・insightsを汚染しない（[要件 §4.2](../requirements.md)）

### 3.4 バージョン不一致の扱い

同期時、回収したJSONLの `v` とリポジトリ側の想定版（`src/shared/collector/version.ts` の定数）を比較。
不一致なら `sync_history.collector_version_seen` に記録し、BIの同期ステータス画面で
「collectorの更新が必要」を警告する（取り込み自体は継続。項目互換の範囲なら読める）。

---

## 4. deploy-collector CLI

収集スクリプトの**設置・更新**を行う（[要件 §5.3](../requirements.md)、
[feedbackメモリ: 承認フロー必須]）。**黙って設置・変更しない。**

### 4.1 承認フロー（必須）

```
1. リポジトリ内の collector.sh とcron行を読み込む
2. 「サーバーへ何を配置し、crontabに何を追加するか」を差分表示:
   - 配置先: /root/insights_collector/collector.sh（新規 or 既存版vX → 新版vY）
   - crontab追加/変更行: 17 * * * * /root/insights_collector/collector.sh（rootのcrontab）
   - 既存cronがあれば現状との差分を表示
3. ユーザーに確認プロンプト（yes/no）。noなら中止（何もしない）
4. yesのときのみ:
   - gcloud compute scp で collector.sh をSSHユーザーのホーム（相対パス）へ一時転送
   - gcloud compute ssh で sudo mkdir -p / sudo mv（一時ファイル→設置先）/
     sudo chmod 755 / rootのcrontab更新（既存行を重複させない）
5. 設置後、collector.sh を1回手動実行して metrics.jsonl に1行出ることを確認
```

- crontab更新は「既存の同一行があれば追加しない」冪等な方式にする
  （現行crontabを取得 → 目的行が無ければ追記 → 書き戻し）
- これはVMへの**唯一許可された書き込み操作**。他の書き込みは一切含めない
  （[security-design.md §5](./security-design.md#5-本番サーバー保護)）

#### 4.1.1 設置先が `/root` 配下・rootのcrontabであることに伴う sudo 経由の設計

設置先は `/root/insights_collector/`、crontabは**rootのcrontab**（[要件 §5.3](../requirements.md)）
である一方、SSH接続ユーザーは一般ユーザーのため、`/root` 配下への書き込み系操作は
すべて `sudo` 経由で実行する（GCEインスタンスはsudo NOPASSWD設定済み。
`scripts/sync/gcloudCommands.ts` のfetchフェーズが同様に `sudo cp` で実績あり）:

- `sudo mkdir -p '<remoteDir>'`（専用ディレクトリ作成）
- `sudo mv '<home上の一時ファイル>' '<remoteScriptPath>' && sudo chmod 755 '<remoteScriptPath>'`（設置+権限付与）
- `sudo crontab -l 2>/dev/null || true`（root crontab読み取り。未設定時は空扱いに正規化）
- `echo '<base64>' | base64 -d | sudo crontab -`（root crontabへの書き戻し）
- `sudo test -x '<remoteScriptPath>'` / `sudo crontab -l` ベースの設置後検証

`gcloud compute scp` は一般ユーザーの認証情報で転送するため `/root` へ直接書き込めない。
そのため、スクリプト配置は**2段階**にする:

1. `gcloud compute scp` でレンダリング済みcollector.shを、SSHユーザーの**ホーム基準の
   相対パス**（一時ファイル名。例: `collector.sh.upload`）へ転送する
2. `gcloud compute ssh` で `sudo mv` により、ホームの一時ファイルを設置先（`/root`配下）へ
   移動し、`sudo chmod 755` で実行権限を付与する（`mv` を使うため、成功時にホームへ
   一時ファイルは残らない）

アンインストール手順の表示（`plan.ts` の `formatUninstallInstructions`）も同様に
`sudo crontab -e` / `sudo rm -rf` で統一する。

### 4.2 GCP固有判断

gcloud/Cloud Monitoringの細部（認証・APIの引数・スコープ）で判断に迷う場合は
`gcp-specialist` に相談する（[CLAUDE.project.md クラウド節]）。

---

## 5. 同期CLIの各フェーズ詳細

### 4.1 Phase 1: fetch（DBコピー取得）

[要件 §4方式A](../requirements.md)の手順。すべてWindows端末側から実行:

1. `gcloud compute ssh --command` で本番の `database.sqlite` と `-wal` を `/tmp` へ `sudo cp`
   （スナップショット。cpは数秒・低負荷）
2. `gcloud compute scp` でローカル `data/raw/` へ取得
3. サーバー `/tmp` のコピーを削除（`rm`。サーバーに残さない）

**失敗時**: ネットワーク/認証エラーは即中断。`data/raw/` は次フェーズに進まず、
cleanupで削除される。`sync_history.status='failed'`, `phase_reached='fetch'`。

### 4.2 Phase 2: validate

1. **整合性検証**: `data/raw/database.sqlite` に対しローカルで `PRAGMA quick_check`
   （稼働中DBのコピーはまれに不整合。失敗時は再取得を促す。[要件 §4方式A手順3](../requirements.md)）
2. **スキーマ検証**: 取り込む5テーブルの列名・型が想定（[db-design.md §3.1](./db-design.md#31-n8n由来テーブル)）と
   一致するか照合。`src/shared/n8n-schema/expected.ts`（zod/定数）と比較し、
   **差異があれば取り込みを中断**して警告（[要件 §4.3](../requirements.md)）。黙って壊れたデータを蓄積しない

**失敗時**: `integrity_ok=0` または `schema_ok=0` を記録し中断。cleanupで生コピー削除。

### 4.3 Phase 3: extract

`data/raw/database.sqlite` から**必要5テーブルのみ**を読み出す。
credentials等の機微テーブルは一切触れない（[security-design.md §2](./security-design.md#2-抽出対象の限定)）。
better-sqlite3でread-onlyに開き、行を取得（この段階ではまだ蓄積DBに書かない）。

### 4.4 Phase 4: ingest

蓄積DB `data/n8n_insights.sqlite` へ取り込む（[db-design.md §4](./db-design.md#4-取り込みマッピング更新戦略)）:

- 全置換テーブル（insights_by_period / insights_metadata / workflow_entity / workflow_statistics）:
  各々を単一トランザクションで `DELETE → INSERT`
- UPSERTテーブル（execution_entity）: `INSERT ... ON CONFLICT(id) DO UPDATE`
- 取り込み件数を `sync_history.rows_ingested_json` に記録

**失敗時**: トランザクション単位でロールバック。部分的な壊れたデータを残さない。

### 4.5 Phase 5: collect-metrics

同期時のマシン負荷回収（[要件 §5.1方式B/C](../requirements.md)）。SSH取得は1コマンドにまとめる:

1. **スポット値（方式B）**: `/proc/meminfo`・`/proc/loadavg`・`docker stats --no-stream`・
   DBサイズ・ルートFS空きを1回取得 → `machine_metrics(source='spot')` / `container_stats(source='spot')`
2. **cronファイル回収（方式D）**: `/root/insights_collector/metrics.jsonl` を取得 →
   各行をパース（`src/shared/collector/parse.ts`）→ `machine_metrics(source='cron')` へUPSERT
   （`UNIQUE(ts_utc,source)` により再回収でも重複しない）
3. **OOMイベント回収**: 永続ログ `journalctl -k`（無ければ `/var/log/kern.log*`）から
   OOM行を抽出 → `oom_events` へUPSERT（再起動をまたいだOOMも取れる。[要件 §5.1](../requirements.md)）
4. **CPU使用率（方式C）**: GCP Monitoring APIから前回同期以降のCPU使用率を取得 →
   `cpu_metrics` へUPSERT（過去6週間まで遡れる）

**失敗時**: メトリクス回収の失敗は**同期全体を失敗させない**（DB取り込みは成功しているため）。
個別の失敗を `sync_history.error_message` に警告として残し、statusは `success`（メトリクス欠測は許容。
[要件 §5.2](../requirements.md)）。

### 4.6 Phase 6: cleanup（生コピー削除・必ず実行）

- `data/raw/` の生コピー（database.sqlite・-wal）を**必ず削除**する
- **どのフェーズで失敗しても cleanup は実行する**（try/finally相当）。生コピーを残さない
  （[security-design.md §3](./security-design.md#3-生コピー削除の保証)）
- 削除完了を `sync_history.raw_copy_deleted=1` に記録

---

## 6. 同期の起動方式

- **CLI直接**: `npm run sync`（tsxで `scripts/sync/main.ts` を実行）
- **BIから**: 同期ステータス画面のボタン → `POST /api/sync` が同CLIを子プロセスspawn
  （[api-design.md §3](./api-design.md#3-同期の子プロセス起動)）。二重起動は409で防止

どちらもプロセス分離の原則を保つ（BIプロセス内で同期処理を走らせない。[要件 §4.3](../requirements.md)）。

### 6.1 CommandRunner（`scripts/sync/commandRunner.ts`）とWindowsでの引数渡し

`GcloudCommandRunner` は `gcloud`（`gcloud.cmd`）解決のため `spawn(..., { shell: true })` を使うが、
Node は `shell: true` のとき引数配列をエスケープせず空白連結してcmd.exeへ渡す（DEP0190）。
そのため `--command="mkdir -p '...' && sudo cp ..."` のようにスペースを含む引数は
cmd.exe側で再分解され、gcloudに渡る前に壊れる。これを避けるため、`buildShellCommandLine(command, args)`
（純粋関数）で空白等の特殊文字を含む引数のみを自前でダブルクォート囲みし、**単一のコマンドライン文字列**を
組み立ててから `spawn(commandLine, { shell: true })` する（引数配列は渡さない）。

ダブルクォートを含む引数（例: GCP Monitoringの `--filter=metric.type="compute.googleapis.com/..."`.
方式C・CPU使用率収集で使用）も存在するため、`"` は例外throwの対象にはしない。
ダブルクォートで囲んだ上で内部の `"` を `\"` にエスケープする（Windowsの子プロセスargvパーサ・
POSIX shの双方で `\"` はリテラルの `"` として解釈される標準規則）。ただし cmd.exe 自体は
`\"` を認識せずクォートの開閉状態をトグルしてしまうため、**ダブルクォートと cmd.exe のメタ文字
（`&` `|` `<` `>` `^`）を両方含む引数は安全に渡せない**。この組み合わせのみ例外を投げる
（現状のgcloud引数では `--filter` は `"` のみ、`--command` は `&&` のみを含み、両方を同時に
含む引数は存在しない）。

---

## 7. 未同期期間の警告

`sync_history` の最終成功時刻を基準に、BI側で警告を出す（[要件 §4.3](../requirements.md)）:

- 本番 `execution_entity` は7日で消えるため、**最終同期から6日超で**
  「そろそろ同期しないと実行明細に穴が開く」を警告
- この判定ロジック（純粋関数）は `src/shared/sync/staleness.ts` に置き、
  BI（[frontend-design.md 画面6](./frontend-design.md#画面6-同期ステータス)）から呼ぶ

---

## 8. 設計判断

- **6フェーズ分割**: fetch→validate→extract→ingest→collect-metrics→cleanup。要件の手順（[§4方式A](../requirements.md)）に
  スキーマ検証（§4.3）とメトリクス回収（§5）を織り込んだ最小構成
- **cleanupをfinallyで必ず実行**: 生コピー削除の徹底は最重要のセキュリティ要件のため、
  失敗パスでも確実に走らせる
- **メトリクス回収失敗は同期を失敗させない**: DB取り込みが本体であり、メトリクス欠測は
  要件上許容（[§5.2](../requirements.md)）。ユーザーが再同期しやすいよう本体成功を優先
- **JSONLをcollector出力形式に採用**: 追記が単純・1行1サンプルでパースが堅牢・
  項目追加に強いため（CSVより将来変更に強い）
- **collectorのバージョン識別子を出力に埋め込む**: VM設置版とリポジトリ想定版のズレ検知（[§5.3](../requirements.md)）
- **deploy-collectorは冪等な承認フロー**: 黙って設置しない原則（[要件 §5.3](../requirements.md)、
  本番保護feedback）を、差分表示+yes/no確認+冪等crontab更新で担保
