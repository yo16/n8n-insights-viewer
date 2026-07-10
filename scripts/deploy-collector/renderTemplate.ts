/**
 * collector.sh.template のプレースホルダ置換（純粋関数）。
 *
 * `collector.sh.template` はプレースホルダ文字列
 * （`__COLLECTOR_VERSION__` / `__DB_PATH__` / `__OUTPUT_FILE__`）を含む
 * テンプレートで、本関数がVM設置直前に実値を埋め込む。
 * ファイルI/O・コマンド実行は一切行わない（文字列変換のみ）。
 */

/** テンプレートへ埋め込む実値。 */
export interface CollectorTemplateValues {
  /** collectorのバージョン識別子（例: `collector-1`）。 */
  version: string;
  /** 本番n8nのdatabase.sqliteの絶対パス。 */
  dbPath: string;
  /** 出力先JSONLファイルの絶対パス。 */
  outputFile: string;
}

const PLACEHOLDERS = {
  version: "__COLLECTOR_VERSION__",
  dbPath: "__DB_PATH__",
  outputFile: "__OUTPUT_FILE__",
} as const;

/**
 * テンプレート文字列のプレースホルダをすべて実値に置換する。
 *
 * 置換後に未置換のプレースホルダが残っていれば、テンプレート破損や
 * プレースホルダ名の変更漏れを検知するため例外を投げる。
 */
export function renderCollectorScript(
  template: string,
  values: CollectorTemplateValues,
): string {
  const rendered = template
    .split(PLACEHOLDERS.version)
    .join(values.version)
    .split(PLACEHOLDERS.dbPath)
    .join(values.dbPath)
    .split(PLACEHOLDERS.outputFile)
    .join(values.outputFile);

  const remaining = Object.values(PLACEHOLDERS).filter((placeholder) =>
    rendered.includes(placeholder),
  );
  if (remaining.length > 0) {
    throw new Error(
      `collector.shテンプレートに未置換のプレースホルダが残っています: ${remaining.join(", ")}`,
    );
  }

  return rendered;
}
