import type { ExtensionAPI, AgentToolResult } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import type {
  AskInteractiveRequest,
  AskQuestion,
  AskQuestionAnswer,
  AskToolResultDetails,
  PendingAskRecord,
  SessionRecord,
} from './types/index.js';
import { normalizeString } from './utils/strings.js';

const AskOptionSchema = Type.Object({
  label: Type.String({ description: '选项显示文案' }),
  description: Type.Optional(Type.String({ description: '选项补充说明' })),
});

const AskQuestionSchema = Type.Object({
  id: Type.Optional(Type.String({ description: '问题唯一 ID，不传则自动生成' })),
  header: Type.Optional(Type.String({ description: '问题分组标题' })),
  question: Type.String({ description: '问题正文' }),
  description: Type.Optional(Type.String({ description: '问题补充说明' })),
  options: Type.Optional(Type.Array(AskOptionSchema, { description: '可选项列表' })),
  multiple: Type.Optional(Type.Boolean({ description: '是否允许多选' })),
  allowCustom: Type.Optional(Type.Boolean({ description: '是否允许自定义输入' })),
});

const AskToolParamsSchema = Type.Object({
  title: Type.Optional(Type.String({ description: '提问卡片标题' })),
  message: Type.Optional(Type.String({ description: '提问卡片补充说明' })),
  questions: Type.Array(AskQuestionSchema, {
    description: '结构化问题列表',
    minItems: 1,
  }),
});

const normalizeQuestions = (questions: AskQuestion[]): AskQuestion[] => {
  return questions.map((question, index) => {
    const options = (question.options || [])
      .map((option) => ({
        label: normalizeString(option.label),
        description: normalizeString(option.description) || undefined,
      }))
      .filter((option) => option.label);

    const normalizedQuestion = normalizeString(question.question);
    if (!normalizedQuestion) {
      throw new Error(`第 ${index + 1} 个问题缺少 question`);
    }

    return {
      id: normalizeString(question.id) || `q${index + 1}`,
      header: normalizeString(question.header) || undefined,
      question: normalizedQuestion,
      description: normalizeString(question.description) || undefined,
      options: options.length > 0 ? options : undefined,
      multiple: question.multiple === true,
      allowCustom:
        question.allowCustom === true || options.length === 0,
    } satisfies AskQuestion;
  });
};

const buildAskToolResult = (
  request: AskInteractiveRequest,
  answers: AskQuestionAnswer[],
  dismissed: boolean,
): AgentToolResult<AskToolResultDetails> => {
  const details: AskToolResultDetails = {
    request,
    answers,
    dismissed,
  };

  if (dismissed) {
    return {
      content: [{ type: 'text', text: 'User dismissed the ask request.' }],
      details,
    };
  }

  const questionMap = new Map(request.questions.map((question) => [question.id, question]));
  const lines = ['User has answered your questions:'];

  for (const answer of answers) {
    const question = questionMap.get(answer.questionId);
    const joined = answer.values.join(' | ');
    lines.push(`"${question?.question || answer.questionId}"="${joined}"`);
  }

  lines.push('You can now proceed.');

  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    details,
  };
};

const registerPendingAsk = (
  record: SessionRecord,
  pendingAsk: PendingAskRecord,
): void => {
  record.pendingAskRecords.set(pendingAsk.id, pendingAsk);
};

interface CreateAskExtensionOptions {
  onPendingAskChange: (record: SessionRecord) => Promise<void>;
}
export const createAskExtension = (
  record: SessionRecord,
  options: CreateAskExtensionOptions,
) => (pi: ExtensionAPI): void => {
  pi.registerTool({
    name: 'ask',
    label: 'Ask',
    description: 'Ask structured questions to the user and wait until they answer before continuing.',
    promptSnippet: 'ask — block current tool execution until user answers structured questions',
    promptGuidelines: [
      'Use ask when you need user decisions or missing information before you can continue.',
      'Prefer one structured ask over multiple back-and-forth plain-text questions.',
    ],
    parameters: AskToolParamsSchema,
    async execute(
      toolCallId: string,
      params: { title?: string; message?: string; questions: AskQuestion[] },
      signal: AbortSignal | undefined,
      _onUpdate: unknown,
      _ctx: unknown,
    ) {
      const questions = normalizeQuestions(params.questions);
      if (questions.length === 0) {
        throw new Error('ask 至少需要一个问题');
      }
        const request: AskInteractiveRequest = {
        id: `${toolCallId}:ask`,
        toolCallId,
        title: normalizeString(params.title) || '需要你回答几个问题',
        message: normalizeString(params.message) || undefined,
        questions,
        createdAt: Date.now(),
      };
        return await new Promise<AgentToolResult<AskToolResultDetails>>((resolve, reject) => {
          let settled = false;
        const cleanup = () => {
          signal?.removeEventListener('abort', handleAbort);
        };
          const settleResolve = (result: AgentToolResult<AskToolResultDetails>) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          resolve(result);
        };
          const settleReject = (error: Error) => {
          if (settled) {
            return;
          }
          settled = true;
          cleanup();
          reject(error);
        };
          const handleAbort = () => {
          const current = record.pendingAskRecords.get(request.id);
          if (!current) {
            return;
          }
          record.pendingAskRecords.delete(request.id);
          void options.onPendingAskChange(record);
          settleReject(new Error('Ask aborted'));
        };

        signal?.addEventListener('abort', handleAbort, { once: true });
          registerPendingAsk(record, {
          ...request,
          settled: false,
          resolve: settleResolve,
          reject: settleReject,
        });

        void options.onPendingAskChange(record);
      });
    },
  });
};

export const buildResolvedAskResult = (
  pendingAsk: PendingAskRecord,
  answers: AskQuestionAnswer[],
  dismissed: boolean,
): AgentToolResult<AskToolResultDetails> => {
  const request: AskInteractiveRequest = {
    id: pendingAsk.id,
    toolCallId: pendingAsk.toolCallId,
    title: pendingAsk.title,
    message: pendingAsk.message,
    questions: pendingAsk.questions,
    createdAt: pendingAsk.createdAt,
  };

  return buildAskToolResult(request, answers, dismissed);
};
