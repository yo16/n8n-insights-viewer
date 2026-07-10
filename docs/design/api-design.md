# データアクセス層設計 — Server Components / Route Handlers / better-sqlite3

## 関連ドキュメント

- [設計概要](./overview.md)
- [DB設計](./db-design.md) — スキーマ定義
- [データ同期設計](./data-sync-design.md) — 同期CLIの起動対象
- [アプリ構成](./app-architecture.md) — RSC境界・ディレクトリ構造
- [フロントエンド設計](./frontend-design.md) — 各画面が使うクエリ
- [要件 §6.4 技術構成](../requirements.md)

---

## 1. 概要

本アプリに外部公開APIは無い。データアクセスは2系統:

1. **読み取り**: Server Componentsが `src/lib/db/queries/` を直接呼ぶ
   （better-sqlite3をread-onlyで参照）。REST APIは介さない
2. **同期起動**: Route Handler 2本（`POST /api/sync`, `GET /api/sync/stream`）が
   同期CLIを子プロセスとして起動・進捗中継する（[data-sync-design.md](./data-sync-design.md)）

### 1.1 RSC境界の原則（[app-architecture.md §RSC境界](./app-architecture.md#4-rsc境界とデータフロー)）

- **データ取得・集計・JST変換・状態評価はすべてServer側**（`lib/db/queries` + `lib/aggregation`）
- **Client Componentsは Rechartsラッパー・同期ボタン・フィルタUIのみ**
- **フィルタはURL searchParams経由でサーバー再クエリ**する。クライアントに全件送って
  JSでフィルタしない（[要件 §6](../requirements.md)の絞り込みはサーバー側で実行）

---

## 2. 接続管理（better-sqlite3, read-only）

`src/lib/db/connection.ts`。**`import "server-only"` を必ず先頭に置く**
（クライアントバンドルへの混入を防止）。

### 2.1 read-onlyオープン

```ts
import "server-only";
import Database from "better-sqlite3";

// read-only + ファイル必須 + query_onlyでBI側からの書き込みを完全封鎖
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
db.pragma("query_only = ON");
```

- 書き込みは同期CLIの専権。BI側は二重に読み取り専用を担保する
- 蓄積DBはWALモードで作成されているため、同期CLIの書き込み中でも読める
  （[db-design.md §1.1](./db-design.md#11-設計方針)）

### 2.2 開発時のシングルトン（Fast Refresh対策）

devのHMRで接続が多重生成されるのを防ぐため `globalThis` にキャッシュ:

```ts
const g = globalThis as unknown as { __n8nDb?: Database.Database };
export function getDb() {
  if (!g.__n8nDb) g.__n8nDb = openReadOnly();
  return g.__n8nDb;
}
```

### 2.3 next.config.ts 必須設定

```ts
// serverExternalPackages に better-sqlite3 を指定（ネイティブモジュールのバンドル回避）
const nextConfig = { serverExternalPackages: ["better-sqlite3"] };
```

- `output: "export"` は**禁止**（静的化するとDBを読めない）
- Route HandlerへのEdge Runtime指定は**禁止**（Node API・子プロセスが必要）

### 2.4 全ページ force-dynamic

全ページで `export const dynamic = "force-dynamic"` を必須とする
（[app-architecture.md §5](./app-architecture.md#5-レンダリング戦略force-dynamic)）。
静的レンダリングでビルド時のDBスナップショットが焼き付く事故を防ぐ。

### 2.5 DB未作成時のハンドリング

`fileMustExist: true` のため、初回同期前は接続が例外になる。
`getDb()` の呼び出し側は例外を捕捉し、「まだ同期されていない」状態として
UI（[frontend-design.md §空状態](./frontend-design.md#7-空状態エラー状態)）に案内を出す。
アプリはクラッシュさせない。

---

## 3. 同期の子プロセス起動（Route Handler 2本）

同期は Server Actions ではなく **Route Handler** で起動する
（子プロセス管理・SSE配信のため。[data-sync-design.md §6](./data-sync-design.md#6-同期の起動方式)）。

### 3.1 POST /api/sync — 起動

- 同期CLIを `spawn` で起動（`scripts/sync/main.ts` を tsx 経由）
- **Windowsのため `shell: true`** で spawn する
- **二重起動防止**: 実行中ジョブは `globalThis` に保持し、実行中なら **409 Conflict** を返す
- 起動成功で jobId を返す（クライアントはこれで stream に接続）

```ts
const g = globalThis as unknown as { __syncJob?: SyncJob | null };
// 既に実行中なら 409
if (g.__syncJob?.running) return new Response("sync already running", { status: 409 });
// spawn（shell:true）。stdout(JSON Lines)を購読しバッファへ
```

### 3.2 GET /api/sync/stream — 進捗配信（SSE）

- **Server-Sent Events** で進捗を配信（[data-sync-design.md §2.1](./data-sync-design.md#21-進捗イベント形式json-lines)の
  JSON Lines を SSEイベントに変換）
- `currentJob` は `globalThis` 保持。子プロセスのstdoutを行単位でパースし、
  接続中のクライアントへ push
- 完了/失敗（`__result__`）でストリームを閉じる
- **Edge Runtime指定禁止**（Node の child_process を使うため）

### 3.3 進捗の状態保持

- 実行中ジョブ・直近の進捗ログは `globalThis.__syncJob` に保持
- ページ再読み込みでstreamに再接続しても、保持済みの進捗から再開表示できる
- ジョブ終了後は結果（成功/失敗・件数）を短時間保持し、次回起動で置き換える

---

## 4. 集計層（aggregation）

`src/lib/aggregation/`。DBから取った生データを画面表示用に加工する**Server側の純粋ロジック**。
（JST変換の純粋関数自体は `src/shared/datetime/` に置き、集計層がそれを使う）

### 4.1 責務

- **JST変換**: UTC → JST（[§4.2](#42-jst変換utc9固定)）
- **粒度混在の吸収**: insights_by_period の hour/day/week を dayに正規化する等
  （[要件 §6.2](../requirements.md)）。この複雑さを集計層に閉じ込める
- **状態評価**: 正常/注意/危険の判定（[§4.3](#43-状態評価ロジック)）
- **トレンド算出**: MemAvailable・DBサイズの傾き（増加/横ばい/減少。[要件 §6.3](../requirements.md)）
- **今日までの時間軸生成 + 欠測明示**: データ末尾以降を空白として返す（[§4.4](#44-時間軸と欠測)）

### 4.2 JST変換（UTC+9固定）

- **date-fns-tz等は使わない**。UTC+9固定オフセットの自前純粋関数（`src/shared/datetime/`）
- **`getDate()` 等のローカルTZ依存メソッドは使用禁止**。`getUTC*` 系のみ使う
  （実行端末のTZに依存させない。[Next.jsスペシャリスト助言]）

```ts
// src/shared/datetime/jst.ts（Next.js非依存・純粋）
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
export function toJst(utcIso: string): JstParts {
  const t = new Date(utcIso).getTime() + JST_OFFSET_MS;
  const d = new Date(t);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, day: d.getUTCDate(), h: d.getUTCHours() };
}
```

### 4.3 状態評価ロジック

最新の収集値から「正常/注意/危険」を判定（[要件 §6.3](../requirements.md)）。
閾値は `config/thresholds.json` から読む（[§5](#5-設定configthresholdsjson)）。

- 各指標を閾値と比較し、**最も重いレベルを全体状態**とする:
  - MemAvailable: 注意<150MB / 危険<100MB（既定）
  - swap使用量: 注意>1GB / 危険>1.5GB（既定）
  - database.sqlite+WAL: 注意>400MB（既定）
- **判定根拠を併記**: どの指標がどの閾値を超えたかを返す（バッジに理由表示）
- サンプルが少ない場合は「参考値」フラグを立てる（[要件 §6.3](../requirements.md)）

```ts
type Level = "normal" | "warning" | "danger";
interface StatusResult { level: Level; reasons: string[]; reference: boolean; }
```

判定の純粋関数は `src/shared/status/evaluate.ts`（閾値を引数で受ける）に置き、
集計層が config を読んで渡す。

### 4.4 時間軸と欠測

- 時間軸の右端は**BI起動日（今日）**まで（[要件 §6.2](../requirements.md)）
- データ末尾（最終同期）以降は**空白**として返し、チャートで「データはここまで」注記を出す
- サンプルが無い区間（方式D設置前・cron停止中）は**欠測**として `null` を返す。
  **ゼロ埋め・補間はしない**（[要件 §5.2 / §6.2](../requirements.md)）

---

## 5. 設定（config/thresholds.json）

- 閾値・注記の既定値を `config/thresholds.json` に置き、**zodで検証**する
  （`src/shared/config/thresholds.ts`）
- **毎回読み込む（キャッシュしない）**。リロードで変更を反映させるため
  （[Next.jsスペシャリスト助言]。force-dynamicのため毎リクエストでファイルを読む）

```jsonc
{
  "memAvailableKb": { "warning": 153600, "danger": 102400 },
  "swapUsedKb":     { "warning": 1048576, "danger": 1572864 },
  "dbSizeBytes":    { "warning": 419430400 },
  "trendSampleMin": 4
}
```

---

## 6. クエリ層（lib/db/queries）

画面ごとに必要なクエリを関数単位で切る。すべて `import "server-only"`、read-only。

| モジュール | 主関数 | 使う画面 |
|---|---|---|
| `queries/dashboard.ts` | 直近7d/30dサマリ、最新負荷、状態評価用の最新値 | 画面1 |
| `queries/insights.ts` | 期間×粒度×ワークフローの時系列（絞り込みはSQL WHERE） | 画面2 |
| `queries/workflows.ts` | ワークフロー別集計 + workflow_statistics累計 | 画面3 |
| `queries/executions.ts` | execution_entity一覧（status/mode/期間フィルタ） | 画面4 |
| `queries/machine.ts` | machine_metrics/container_stats/cpu_metrics/oom_events時系列 | 画面5 |
| `queries/sync.ts` | sync_history最新・カバー範囲・未同期警告用 | 画面6 |

- **絞り込み・ソートはSQLで行う**（searchParamsをWHERE/ORDER BYへ）。
  クライアントに全件送らない（[§1.1](#11-rsc境界の原則)）
- prepared statementを使い、パラメータは必ずバインド（文字列連結しない）

---

## 7. エラーハンドリング方針

| 状況 | 挙動 |
|---|---|
| DB未作成（初回同期前） | 例外を捕捉し「同期してください」案内。クラッシュさせない（[§2.5](#25-db未作成時のハンドリング)） |
| 同期の二重起動 | `POST /api/sync` が 409 |
| 同期CLIの子プロセス異常終了 | SSEで `__result__: failed` を配信、sync_historyに記録 |
| クエリ結果が空（データはあるが該当なし） | 空状態UIを表示（[frontend-design.md §7](./frontend-design.md#7-空状態エラー状態)） |

---

## 8. 設計判断

- **REST APIを作らない**: 読み取りはServer Componentsから直接クエリで足りる（YAGNI）。
  外部公開もない
- **同期はRoute Handler、読み取りは直接クエリ**: 子プロセス管理とSSEはRoute Handlerが適切。
  一方の読み取りにHTTPを挟むのは無駄なオーバーヘッド
- **configを毎回読む**: 個人ローカル用途でリクエスト頻度は低く、キャッシュ無効化の
  複雑さより「リロードで即反映」の分かりやすさを優先（Next.jsスペシャリスト助言に合致）
- **JST純粋関数を自前実装**: 固定オフセット+9hで十分。ライブラリ依存とTZ DB更新の
  懸念を避ける（[要件 §6.2](../requirements.md)はAsia/TokyoでDST無し）
