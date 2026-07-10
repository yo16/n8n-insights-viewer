import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { SyncButton } from "@/components/sync/SyncButton";

/**
 * src/components/sync/SyncButton.tsx の単体テスト。
 *
 * jsdomにはEventSourceが存在しないため、自前のモッククラスを`global.EventSource`に
 * 割り当てて挙動を検証する。fetchはjest.spyOnでモックする。
 */

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

const mockedUseRouter = useRouter as jest.Mock;

type MessageHandler = (ev: { data: string }) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  onmessage: MessageHandler | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  triggerError() {
    this.onerror?.();
  }
}

function latestEventSource(): MockEventSource {
  const instance = MockEventSource.instances[MockEventSource.instances.length - 1];
  if (!instance) throw new Error("EventSourceのインスタンスが生成されていません");
  return instance;
}

describe("SyncButton", () => {
  const routerRefresh = jest.fn();

  beforeEach(() => {
    MockEventSource.instances = [];
    (global as unknown as { EventSource: typeof MockEventSource }).EventSource =
      MockEventSource;
    mockedUseRouter.mockReturnValue({ refresh: routerRefresh });
    routerRefresh.mockClear();
    (global as unknown as { fetch: jest.Mock }).fetch = jest.fn();
  });

  it("初期表示ではボタンが有効で「同期を実行」と表示される", () => {
    render(<SyncButton />);

    const button = screen.getByRole("button", { name: "同期を実行" });
    expect(button).not.toBeDisabled();
  });

  it("クリックしてPOSTが成功すると、ボタンが無効化され進捗購読を開始する", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    render(<SyncButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "同期を実行" }));
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/sync", { method: "POST" });
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveTextContent("同期実行中…");
    expect(MockEventSource.instances).toHaveLength(1);
    expect(latestEventSource().url).toBe("/api/sync/stream");
  });

  it("進捗イベント（phase進行中）を受信すると、フェーズ名とメッセージを表示する", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    render(<SyncButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "同期を実行" }));
      await Promise.resolve();
    });

    act(() => {
      latestEventSource().emit({
        phase: "fetch",
        status: "progress",
        message: "n8n DBをダウンロード中",
      });
    });

    expect(
      screen.getByText("進行中: 取得 — n8n DBをダウンロード中"),
    ).toBeInTheDocument();
  });

  it("resultイベント（成功）を受信すると、完了表示になりrouter.refreshが呼ばれる", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    render(<SyncButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "同期を実行" }));
      await Promise.resolve();
    });

    const es = latestEventSource();
    act(() => {
      es.emit({ type: "result", job: { id: "job-1", status: "success" } });
    });

    expect(screen.getByText("同期が完了しました。")).toBeInTheDocument();
    expect(routerRefresh).toHaveBeenCalledTimes(1);
    expect(es.closed).toBe(true);
    expect(screen.getByRole("button", { name: "同期を実行" })).not.toBeDisabled();
  });

  it("resultイベント（失敗・エラーメッセージ付き）を受信すると、失敗表示になる", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    render(<SyncButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "同期を実行" }));
      await Promise.resolve();
    });

    act(() => {
      latestEventSource().emit({
        type: "result",
        job: { id: "job-1", status: "failed", error: "スキーマ検証に失敗しました" },
      });
    });

    expect(
      screen.getByText("同期に失敗しました: スキーマ検証に失敗しました"),
    ).toBeInTheDocument();
  });

  it("__result__フェーズメッセージを受信すると完了表示になる", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    render(<SyncButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "同期を実行" }));
      await Promise.resolve();
    });

    act(() => {
      latestEventSource().emit({
        phase: "__result__",
        status: "success",
      });
    });

    expect(screen.getByText("同期が完了しました。")).toBeInTheDocument();
  });

  it("idleイベントを受信すると、初期状態に戻りEventSourceをcloseする", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    render(<SyncButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "同期を実行" }));
      await Promise.resolve();
    });

    const es = latestEventSource();
    act(() => {
      es.emit({ type: "idle" });
    });

    expect(screen.getByRole("button", { name: "同期を実行" })).not.toBeDisabled();
    expect(es.closed).toBe(true);
  });

  it("409（実行中）が返ると「実行中」表示になり、進捗購読を継続する", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 409,
    } as Response);

    render(<SyncButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "同期を実行" }));
      await Promise.resolve();
    });

    expect(
      screen.getByText("他の同期が既に実行中です。進捗を表示します。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
    expect(MockEventSource.instances).toHaveLength(1);
  });

  it("POSTが200/409以外のエラーステータスの場合、失敗表示になる", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    render(<SyncButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "同期を実行" }));
      await Promise.resolve();
    });

    expect(
      screen.getByText("同期に失敗しました: 同期の起動に失敗しました（status 500）"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "同期を実行" })).not.toBeDisabled();
  });

  it("fetchが例外を投げた場合、エラーメッセージ付きで失敗表示になる", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("ネットワークエラー"));

    render(<SyncButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "同期を実行" }));
      await Promise.resolve();
    });

    expect(
      screen.getByText("同期に失敗しました: ネットワークエラー"),
    ).toBeInTheDocument();
  });

  it("EventSourceのonerror発生時、エラーメッセージを表示しボタンを再有効化する", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    render(<SyncButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "同期を実行" }));
      await Promise.resolve();
    });

    // 進捗購読中（実行中でボタンは無効）であることを事前確認
    expect(screen.getByRole("button")).toBeDisabled();

    const es = latestEventSource();
    act(() => {
      es.triggerError();
    });

    expect(
      screen.getByText(
        "同期に失敗しました: 進捗の購読中に接続エラーが発生しました。同期自体は継続している場合があります。",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "同期を実行" })).not.toBeDisabled();
    expect(es.closed).toBe(true);
  });

  it("実行中（disabled）の状態でクリックしても、fetchは再度呼ばれない", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    render(<SyncButton />);

    const button = screen.getByRole("button", { name: "同期を実行" });

    await act(async () => {
      fireEvent.click(button);
      await Promise.resolve();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button"));

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("不正なJSON形式のメッセージを受信しても例外を投げず、状態を変えない", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    render(<SyncButton />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "同期を実行" }));
      await Promise.resolve();
    });

    const es = latestEventSource();
    expect(() => {
      act(() => {
        es.onmessage?.({ data: "not-json{{{" });
      });
    }).not.toThrow();

    // 状態は running のまま
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
