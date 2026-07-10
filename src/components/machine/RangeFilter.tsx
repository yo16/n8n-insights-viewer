import Link from "next/link";
import styles from "./RangeFilter.module.css";

export type MachineRange = "24h" | "7d" | "30d";

const OPTIONS: { value: MachineRange; label: string }[] = [
  { value: "24h", label: "24時間" },
  { value: "7d", label: "7日" },
  { value: "30d", label: "30日" },
];

export interface RangeFilterProps {
  current: MachineRange;
}

/**
 * 期間フィルタ（24時間/7日/30日）。URL searchParams経由でサーバー再クエリする
 * （docs/design/app-architecture.md §6 / frontend-design.md 画面5）。
 */
export function RangeFilter({ current }: RangeFilterProps) {
  return (
    <nav className={styles.tabs} aria-label="期間フィルタ">
      {OPTIONS.map((opt) => (
        <Link
          key={opt.value}
          href={`/machine?range=${opt.value}`}
          className={opt.value === current ? `${styles.tab} ${styles.active}` : styles.tab}
          aria-current={opt.value === current ? "page" : undefined}
        >
          {opt.label}
        </Link>
      ))}
    </nav>
  );
}
