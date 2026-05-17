import { Type } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

function sleep(seconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutMs = seconds * 1000;
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      const error = new Error("wait 已取消");
      error.name = "AbortError";
      reject(error);
    };

    if (signal?.aborted) {
      onAbort();
      return;
    }

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export default function waitExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "wait",
    label: "等待",
    description: "等待指定秒数后返回，用于让 agent 在流程中主动暂停一段时间。",
    promptSnippet: "当你需要在流程中暂停一段时间后再继续时，使用 wait 工具。",
    promptGuidelines: [
      "当你需要等待外部状态变化、节流，或明确延迟一段时间后再继续时，调用 wait。",
      "seconds 必须是要等待的秒数，可使用小数。",
    ],
    parameters: Type.Object({
      seconds: Type.Number({
        minimum: 0,
        description: "需要等待的秒数，可为小数，例如 0.5、2、10",
      }),
    }),
    async execute(_toolCallId, params, signal, onUpdate) {
      const startedAt = Date.now();


      await sleep(params.seconds, signal);

      const endedAt = Date.now();
      return {
        content: [{ type: "text", text: `已等待 ${params.seconds} 秒。` }],
        details: {
          seconds: params.seconds,
          startedAt,
          endedAt,
          elapsedMs: endedAt - startedAt,
        },
      };
    },
  });
}