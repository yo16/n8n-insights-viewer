import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3はネイティブモジュールのため、サーバー側のバンドル対象から除外する
  // (docs/design/api-design.md §2.3)
  serverExternalPackages: ["better-sqlite3"],

  // 注意: output: "export" は絶対に設定しないこと。
  // 本アプリは常に最新のローカルDBを読むForce-dynamicなServer Componentsで構成されており、
  // 静的エクスポートにするとビルド時のDBスナップショットが焼き付いてしまう
  // (docs/design/app-architecture.md §5, docs/design/api-design.md §2.3)。
};

export default nextConfig;
