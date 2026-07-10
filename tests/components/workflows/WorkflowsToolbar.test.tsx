import { fireEvent, render, screen } from "@testing-library/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WorkflowsToolbar } from "@/components/workflows/WorkflowsToolbar";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

const mockedUsePathname = usePathname as jest.Mock;
const mockedUseRouter = useRouter as jest.Mock;
const mockedUseSearchParams = useSearchParams as jest.Mock;

describe("WorkflowsToolbar", () => {
  const push = jest.fn();

  beforeEach(() => {
    push.mockClear();
    mockedUsePathname.mockReturnValue("/workflows");
    mockedUseRouter.mockReturnValue({ push });
  });

  it("activeOnly=falseのとき、チェックボックスは未チェックで表示される", () => {
    mockedUseSearchParams.mockReturnValue(new URLSearchParams());

    render(<WorkflowsToolbar activeOnly={false} />);

    expect(screen.getByRole("checkbox", { name: "アクティブのみ表示" })).not.toBeChecked();
  });

  it("activeOnly=trueのとき、チェックボックスはチェック済みで表示される", () => {
    mockedUseSearchParams.mockReturnValue(new URLSearchParams("active=1"));

    render(<WorkflowsToolbar activeOnly={true} />);

    expect(screen.getByRole("checkbox", { name: "アクティブのみ表示" })).toBeChecked();
  });

  it("未チェックからチェックすると、active=1を付与したURLでrouter.pushが呼ばれる", () => {
    mockedUseSearchParams.mockReturnValue(new URLSearchParams());

    render(<WorkflowsToolbar activeOnly={false} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "アクティブのみ表示" }));

    expect(push).toHaveBeenCalledWith("/workflows?active=1");
  });

  it("チェック済みから未チェックにすると、activeパラメータを除去したURLでrouter.pushが呼ばれる", () => {
    mockedUseSearchParams.mockReturnValue(new URLSearchParams("active=1"));

    render(<WorkflowsToolbar activeOnly={true} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "アクティブのみ表示" }));

    expect(push).toHaveBeenCalledWith("/workflows");
  });

  it("他のsearchParamsが存在する場合、それを保持したままactiveパラメータのみ更新する", () => {
    mockedUseSearchParams.mockReturnValue(new URLSearchParams("sort=name&order=asc"));

    render(<WorkflowsToolbar activeOnly={false} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "アクティブのみ表示" }));

    expect(push).toHaveBeenCalledWith("/workflows?sort=name&order=asc&active=1");
  });
});
