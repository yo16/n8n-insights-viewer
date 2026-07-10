# スタイリング設計 — デザインシステム・カラー・タイポグラフィ（CSS Modules）

## 関連ドキュメント

- [設計概要](./overview.md)
- [フロントエンド設計](./frontend-design.md) — コンポーネント・状態バッジ・チャート
- [アプリ構成](./app-architecture.md) — src/styles・components構成
- [要件 §6.3 状態評価](../requirements.md)

---

## 1. 方針

- **CSS Modules を使う。Tailwind CSS は禁止**（[CLAUDE.project.md 技術スタック]）
- **デザイントークンはCSS変数**（`:root`）で一元管理し、CSS Modulesから参照する
- 個人ローカル用のBIツールとして、装飾より**可読性・状態の識別性**を優先する
  （状態の良し悪しが一目でわかること = [要件 §6.3](../requirements.md)の目的）
- ダーク/ライトは**ライト固定**で開始（YAGNI。必要になれば変数切替で対応可能）

---

## 2. デザイントークン（CSS変数）

`src/styles/tokens.css`（`app/layout.tsx` でグローバルimport）。

### 2.1 カラー — 状態カラー（最重要）

状態評価（正常/注意/危険）とチャート閾値で一貫使用する。

```css
:root {
  /* 状態カラー（信号色。色覚多様性に配慮しアイコン/ラベルと併用） */
  --color-normal:  #2e7d32;   /* 正常（緑） */
  --color-warning: #ed6c02;   /* 注意（橙） */
  --color-danger:  #d32f2f;   /* 危険（赤） */
  --color-normal-bg:  #e8f5e9;
  --color-warning-bg: #fff4e5;
  --color-danger-bg:  #fdecea;

  /* データ系列カラー */
  --series-success: #2e7d32;  /* 成功 */
  --series-failure: #d32f2f;  /* 失敗 */
  --series-runtime: #1565c0;  /* 実行時間 */
  --series-memory:  #6a1b9a;  /* メモリ */
  --series-swap:    #ad1457;  /* swap */
  --series-cpu:     #00695c;  /* CPU/load */

  /* 欠測・注記 */
  --color-missing: #bdbdbd;   /* 欠測ギャップ・グレーアウト */
  --color-approx:  #9e9e9e;   /* 近似値注記 */
}
```

- **状態色は色のみに依存しない**: `StatusBadge` はアイコン + テキストラベル（正常/注意/危険）を併記
  （色覚多様性への配慮。[frontend-design.md StatusBadge](./frontend-design.md#3-共通コンポーネントcomponentsui)）
- チャートの閾値線は注意=橙/危険=赤、OOMマーカーは危険赤で統一

### 2.2 ニュートラル・背景・テキスト

```css
:root {
  --bg-base:    #ffffff;
  --bg-subtle:  #f5f6f8;   /* カード背景・ヘッダ */
  --border:     #e0e0e0;
  --text-primary:   #1a1a1a;
  --text-secondary: #5f6368;
  --text-disabled:  #9aa0a6;
}
```

### 2.3 スペーシング・角丸・影

```css
:root {
  --space-1: 4px; --space-2: 8px; --space-3: 12px;
  --space-4: 16px; --space-6: 24px; --space-8: 32px;
  --radius: 8px;
  --shadow-card: 0 1px 3px rgba(0,0,0,0.08);
}
```

---

## 3. タイポグラフィ

```css
:root {
  --font-sans: system-ui, "Segoe UI", "Yu Gothic UI", "Meiryo", sans-serif;
  --font-mono: "Cascadia Code", "Consolas", monospace;  /* 数値・時刻・ID */

  --fs-xs: 12px; --fs-sm: 13px; --fs-base: 14px;
  --fs-lg: 16px; --fs-xl: 20px; --fs-2xl: 28px;  /* サマリ数値 */
}
```

- **日本語UI**を前提に、Windows環境の標準日本語フォント（Yu Gothic UI/Meiryo）を優先
- **数値・時刻・実行時間・ワークフローIDは等幅（--font-mono）**で桁を揃え、比較しやすくする
- サマリの大きな数値（総実行数等）は `--fs-2xl`

---

## 4. コンポーネントスタイルの規約

- 各コンポーネントは同階層に `*.module.css` を持つ（例: `StatusBadge.module.css`）
- クラス名はローカルスコープ（CSS Modules）。BEM等のグローバル命名は不要
- **値はハードコードせずCSS変数を参照**する（トークンの一元管理）
- レスポンシブは最小限（ローカル閲覧・単一端末のため）。主要ブレークポイントのみ
  （デスクトップ優先。狭幅でテーブルが崩れない程度）

```css
/* 例: StatusBadge.module.css */
.badge { display: inline-flex; gap: var(--space-1); padding: var(--space-1) var(--space-2);
  border-radius: var(--radius); font-size: var(--fs-sm); font-weight: 600; }
.normal  { color: var(--color-normal);  background: var(--color-normal-bg); }
.warning { color: var(--color-warning); background: var(--color-warning-bg); }
.danger  { color: var(--color-danger);  background: var(--color-danger-bg); }
```

---

## 5. チャートの見た目（Recharts）

- 系列色は §2.1 のCSS変数と対応させる（Rechartsはprop経由で色を渡すため、
  トークン値を定数化した `src/shared/types/` or `styles` のTSマップを用意して共有）
- 欠測ギャップは `--color-missing`、閾値線は注意/危険色、グリッドは薄いニュートラル
- 背景はカード（`--bg-base` + `--shadow-card`）

---

## 6. レイアウト

- サイドナビ + メインの2カラム（デスクトップ）。ナビは `--bg-subtle`
- カードグリッド（ダッシュボードのサマリ）はCSS Grid
- 最大コンテンツ幅を設け、広画面で間延びさせない

---

## 7. 設計判断

- **CSS変数によるトークン管理**: Tailwind禁止の制約下で、色・余白の一元管理と
  状態色の一貫性を保つ最も素直な手段
- **状態色をアイコン/ラベル併用**: 色のみに頼らず「良くない状態が一目でわかる」を確実にする
  （[要件 §6.3](../requirements.md)の目的に直結）
- **ライト固定・レスポンシブ最小**: 単一端末のローカル閲覧用途でダークモードや
  モバイル対応は不要（YAGNI）
- **数値の等幅フォント**: 実行数・実行時間・メモリ値の比較が主目的のBIのため桁揃えを重視
