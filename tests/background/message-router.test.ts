import { describe, expect, it, vi } from "vitest";
import { MessageRouter, type MessageHandlerActions } from "../../src/background/message-router";
import { initialTabState } from "../../src/core/state-machine";

describe("MessageRouter", () => {
  it("get-status メッセージを受け取ると getTabStatus を呼び出して状態を返す", async () => {
    const expectedState = { ...initialTabState(1), state: "protected-user" as const };
    const actions: MessageHandlerActions = {
      getTabStatus: vi.fn().mockReturnValue(expectedState),
      returnTabToAutomation: vi.fn(),
      protectTab: vi.fn(),
      reevaluateWindow: vi.fn(),
    };
    const router = new MessageRouter(actions);

    const response = await router.handleMessage({ type: "get-status", tabId: 1 });

    expect(actions.getTabStatus).toHaveBeenCalledWith(1);
    expect(response).toEqual({ ok: true, state: expectedState });
  });

  it("return-tab メッセージを受け取ると returnTabToAutomation を呼び出して ok: true を返す", async () => {
    const actions: MessageHandlerActions = {
      getTabStatus: vi.fn(),
      returnTabToAutomation: vi.fn().mockResolvedValue(undefined),
      protectTab: vi.fn(),
      reevaluateWindow: vi.fn(),
    };
    const router = new MessageRouter(actions);

    const response = await router.handleMessage({ type: "return-tab", tabId: 42 });

    expect(actions.returnTabToAutomation).toHaveBeenCalledWith(42);
    expect(response).toEqual({ ok: true });
  });

  it("protect-tab メッセージを受け取ると protectTab を呼び出して ok: true を返す", async () => {
    const actions: MessageHandlerActions = {
      getTabStatus: vi.fn(),
      returnTabToAutomation: vi.fn(),
      protectTab: vi.fn().mockResolvedValue(undefined),
      reevaluateWindow: vi.fn(),
    };
    const router = new MessageRouter(actions);

    const response = await router.handleMessage({ type: "protect-tab", tabId: 99 });

    expect(actions.protectTab).toHaveBeenCalledWith(99);
    expect(response).toEqual({ ok: true });
  });

  it("reevaluate-window メッセージを受け取ると reevaluateWindow を呼び出して ok: true を返す", async () => {
    const actions: MessageHandlerActions = {
      getTabStatus: vi.fn(),
      returnTabToAutomation: vi.fn(),
      protectTab: vi.fn(),
      reevaluateWindow: vi.fn().mockResolvedValue(undefined),
    };
    const router = new MessageRouter(actions);

    const response = await router.handleMessage({ type: "reevaluate-window", windowId: 5 });

    expect(actions.reevaluateWindow).toHaveBeenCalledWith(5);
    expect(response).toEqual({ ok: true });
  });

  it("未知または不正なメッセージに対して { ok: false } を返す", async () => {
    const actions: MessageHandlerActions = {
      getTabStatus: vi.fn(),
      returnTabToAutomation: vi.fn(),
      protectTab: vi.fn(),
      reevaluateWindow: vi.fn(),
    };
    const router = new MessageRouter(actions);

    expect(await router.handleMessage(null)).toEqual({ ok: false });
    expect(await router.handleMessage("unknown")).toEqual({ ok: false });
    expect(await router.handleMessage({})).toEqual({ ok: false });
    expect(await router.handleMessage({ type: "unknown-type" })).toEqual({ ok: false });
    expect(await router.handleMessage({ type: "get-status" })).toEqual({ ok: false });
    expect(await router.handleMessage({ type: "return-tab", tabId: "not-a-number" })).toEqual({
      ok: false,
    });
    expect(await router.handleMessage({ type: "reevaluate-window", windowId: "invalid" })).toEqual({
      ok: false,
    });

    expect(actions.getTabStatus).not.toHaveBeenCalled();
    expect(actions.returnTabToAutomation).not.toHaveBeenCalled();
    expect(actions.protectTab).not.toHaveBeenCalled();
    expect(actions.reevaluateWindow).not.toHaveBeenCalled();
  });
});
