import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import WorkbenchComposer from "@/components/workbench/chat/WorkbenchComposer.vue";
import type { ChatComposerState } from "@/lib/types";

vi.mock("@/composables/useProjects", () => ({
  useProjects: () => ({
    add: vi.fn(),
    error: { value: "" },
    isLoading: { value: false },
    load: vi.fn().mockResolvedValue(undefined),
    projects: { value: [] },
  }),
}));

const makeComposer = (overrides: Partial<ChatComposerState> = {}): ChatComposerState => ({
  sessionId: "session-1",
  draftText: "",
  isSending: false,
  canAbort: false,
  selectedModel: "model-1",
  selectedThinkingLevel: "medium",
  selectedAgent: "",
  hasDraft: false,
  isFocused: false,
  isDisabled: false,
  pendingPrompt: "",
  ...overrides,
});

function mountComposer(overrides: Partial<ChatComposerState> = {}, error = "") {
  return mount(WorkbenchComposer, {
    props: {
      agents: [],
      commands: [],
      composer: makeComposer(overrides),
      currentProjectPath: "/workspace",
      error,
      hasVisibleResources: false,
      isDraftSession: false,
      isResourcePickerVisible: false,
      isSending: false,
      modelOptions: [{ label: "Model 1", value: "model-1" }],
      noAgentValue: "__none__",
      prompts: [],
      resourceError: "",
      skills: [],
      thinkingOptions: [{ label: "Medium", value: "medium" }],
      value: overrides.draftText ?? "",
    },
    global: {
      stubs: {
        Button: {
          template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
          props: ["disabled"],
          emits: ["click"],
        },
        ProjectSelectorDialog: { template: "<div />" },
        Select: { template: "<div><slot /></div>", props: ["modelValue"] },
        SelectContent: { template: "<div><slot /></div>" },
        SelectItem: { template: "<div><slot /></div>", props: ["value"] },
        SelectTrigger: { template: "<div><slot /></div>" },
        SelectValue: { template: "<span><slot /></span>" },
        Textarea: {
          template:
            '<textarea :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
          props: ["modelValue", "disabled"],
          emits: ["update:modelValue"],
        },
        WorkbenchResourcePicker: { template: "<div />" },
      },
    },
  });
}

describe("WorkbenchComposer", () => {
  it("disables input and submit with a readonly reason", () => {
    const wrapper = mountComposer({
      draftText: "new message",
      isDisabled: true,
    });

    expect(wrapper.text()).toContain("归档会话只读，不能继续发送");
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).disabled).toBe(true);
    expect((wrapper.find("button").element as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows send errors without clearing the draft", () => {
    const wrapper = mountComposer({ draftText: "kept draft" }, "当前没有可用模型，无法发送");

    expect(wrapper.text()).toContain("当前没有可用模型，无法发送");
    expect((wrapper.find("textarea").element as HTMLTextAreaElement).value).toBe("kept draft");
  });
});
