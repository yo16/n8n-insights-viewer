import "server-only";

import path from "path";

import Database from "better-sqlite3";

/**
 * 蓄積DB（閲覧用SQLite）への read-only 接続管理。
 *
 * `docs/design/api-design.md` §2 に準拠:
 * - `import "server-only"` を先頭に置き、クライアントバンドルへの混入を防ぐ
 * - `{ readonly: true, fileMustExist: true }` + `PRAGMA query_only = ON` で
 *   書き込みを完全に封鎖する（書き込みは同期CLIの専権）
 * - devはHMRによる接続の多重生成を防ぐため `globalThis` にシングルトンをキャッシュし、
 *   prodは（Next.jsのプロセスモデル上）都度生成でよい
 * - DB未作成時（初回同期前）は `DbNotFoundError` を投げ、呼び出し側（Server Components）が
 *   識別して「まず npm run sync を実行してください」という案内を出せるようにする
 *   （`docs/design/api-design.md` §2.5 / `docs/design/db-design.md` §7）
 */

/** 蓄積DBの既定パス（`process.cwd()` 基準）。 */
export const DB_PATH = path.join(process.cwd(), "data", "n8n_insights.sqlite");

/**
 * DBファイルが未作成（初回同期前）の場合に投げられるエラー。
 * 呼び出し側はこのエラー型を捕捉して「同期未実行」の案内を表示する。
 */
export class DbNotFoundError extends Error {
  constructor(dbPath: string) {
    super(
      `蓄積DBが見つかりません (${dbPath})。まず \`npm run sync\` を実行してください。`,
    );
    this.name = "DbNotFoundError";
  }
}

/** better-sqlite3のエラーメッセージから「ファイルが存在しない」ケースを判定する。 */
function isFileMissingError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // better-sqlite3は fileMustExist:true でファイルが無い場合、
  // - ファイルの親ディレクトリごと無い場合: "Cannot open database because the directory does not exist"
  // - 親ディレクトリはあるがファイルが無い場合: "unable to open database file"
  // のいずれかのメッセージの例外を投げる
  return (
    /unable to open database file/i.test(err.message) ||
    /directory does not exist/i.test(err.message)
  );
}

/** read-onlyでDBを開く（書き込みを完全封鎖）。 */
function openReadOnly(dbPath: string): Database.Database {
  let db: Database.Database;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    if (isFileMissingError(err)) {
      throw new DbNotFoundError(dbPath);
    }
    throw err;
  }
  db.pragma("query_only = ON");
  return db;
}

const g = globalThis as unknown as { __n8nDb?: Database.Database };

/**
 * 蓄積DBへのread-only接続を取得する。
 *
 * - dev環境（`NODE_ENV !== "production"`）: `globalThis` にキャッシュしたシングルトンを再利用する
 *   （Fast Refresh対策。接続の多重生成を防ぐ）
 * - prod環境: 呼び出しの都度オープンする
 *
 * DBファイルが存在しない場合は {@link DbNotFoundError} を投げる。
 */
export function getDb(): Database.Database {
  if (process.env.NODE_ENV !== "production") {
    if (!g.__n8nDb) {
      g.__n8nDb = openReadOnly(DB_PATH);
    }
    return g.__n8nDb;
  }
  return openReadOnly(DB_PATH);
}
