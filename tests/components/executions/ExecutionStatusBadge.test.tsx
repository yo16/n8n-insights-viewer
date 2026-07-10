import { render, screen } from "@testing-library/react";
import { ExecutionStatusBadge } from "../../../src/components/executions/ExecutionStatusBadge";
import styles from "../../../src/components/executions/ExecutionStatusBadge.module.css";

/**
 * src/components/executions/ExecutionStatusBadge.tsx の単体テスト。
 * status値ごとの表示・色クラス（画面4: 状態バッジ）
 */
describe("ExecutionStatusBadge", () => {
  it("status=successの場合、テキストとnormalクラスを表示する", () => {
    const { container } = render(<ExecutionStatusBadge status="success" />);

    expect(screen.getByText("success")).toBeInTheDocument();
    expect(container.querySelector(`.${styles.normal}`)).toBeInTheDocument();
  });

  it.each(["error", "crashed"])(
    "status=%sの場合、dangerクラスを表示する",
    (status) => {
      const { container } = render(<ExecutionStatusBadge status={status} />);

      expect(screen.getByText(status)).toBeInTheDocument();
      expect(container.querySelector(`.${styles.danger}`)).toBeInTheDocument();
    },
  );

  it.each(["waiting", "running", "canceled"])(
    "status=%s（success/error/crashed以外）の場合、neutralクラスを表示する",
    (status) => {
      const { container } = render(<ExecutionStatusBadge status={status} />);

      expect(screen.getByText(status)).toBeInTheDocument();
      expect(
        container.querySelector(`.${styles.neutral}`),
      ).toBeInTheDocument();
    },
  );

  it("status=nullの場合、「unknown」とneutralクラスを表示する", () => {
    const { container } = render(<ExecutionStatusBadge status={null} />);

    expect(screen.getByText("unknown")).toBeInTheDocument();
    expect(container.querySelector(`.${styles.neutral}`)).toBeInTheDocument();
  });
});
