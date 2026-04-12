<script setup lang="ts">
import { computed, ref, watch } from "vue";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AskInteractiveRequest, AskQuestion, AskQuestionAnswer } from "@/lib/types";

const props = defineProps<{
  request: AskInteractiveRequest;
}>();

const emit = defineEmits<{
  submit: [answers: AskQuestionAnswer[]];
  dismiss: [];
}>();

const activeTab = ref<string>("summary");
const selectedValues = ref<Record<string, string[]>>({});
const customValues = ref<Record<string, string>>({});

const resetState = () => {
  activeTab.value = props.request.questions[0]?.id || "summary";
  selectedValues.value = {};
  customValues.value = {};
};

watch(
  () => props.request.id,
  () => resetState(),
  { immediate: true },
);

const getSelectedValues = (questionId: string) =>
  selectedValues.value[questionId] || [];

const getCustomValue = (questionId: string) =>
  customValues.value[questionId] || "";

const setSingleOption = (questionId: string, value: string) => {
  selectedValues.value = {
    ...selectedValues.value,
    [questionId]: [value],
  };
};

const toggleMultiOption = (questionId: string, value: string, checked: boolean) => {
  const current = new Set(getSelectedValues(questionId));
  if (checked) {
    current.add(value);
  } else {
    current.delete(value);
  }

  selectedValues.value = {
    ...selectedValues.value,
    [questionId]: [...current],
  };
};

const setCustomValue = (questionId: string, value: string) => {
  customValues.value = {
    ...customValues.value,
    [questionId]: value,
  };
};

const buildQuestionAnswer = (question: AskQuestion): AskQuestionAnswer => {
  const selected = getSelectedValues(question.id).filter(Boolean);
  const custom = getCustomValue(question.id).trim();

  if (!question.options?.length) {
    return {
      questionId: question.id,
      values: custom ? [custom] : [],
    };
  }

  if (question.multiple) {
    return {
      questionId: question.id,
      values: custom ? [...selected, custom] : selected,
    };
  }

  if (custom) {
    return {
      questionId: question.id,
      values: [custom],
    };
  }

  return {
    questionId: question.id,
    values: selected.slice(0, 1),
  };
};

const answers = computed<AskQuestionAnswer[]>(() =>
  props.request.questions.map((question) => buildQuestionAnswer(question)),
);

const missingQuestionIds = computed(() =>
  answers.value
    .filter((answer) => answer.values.length === 0)
    .map((answer) => answer.questionId),
);

const canSubmit = computed(() => missingQuestionIds.value.length === 0);

const summaryRows = computed(() =>
  props.request.questions.map((question) => {
    const answer = answers.value.find((item) => item.questionId === question.id);
    return {
      question,
      values: answer?.values || [],
    };
  }),
);

const handleSubmit = () => {
  if (!canSubmit.value) {
    return;
  }
  emit("submit", answers.value);
};
</script>

<template>
  <Card class="ridge-panel-header gap-3 rounded-[10px] shadow-sm">
    <CardHeader class="gap-2">
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-1">
          <CardTitle class="text-base">
            {{ request.title }}
          </CardTitle>
          <CardDescription v-if="request.message">
            {{ request.message }}
          </CardDescription>
        </div>
        <Badge variant="outline">等待回答</Badge>
      </div>
    </CardHeader>

    <CardContent class="space-y-4">
      <Tabs
        v-if="request.questions.length > 1"
        v-model:model-value="activeTab"
        class="space-y-4"
      >
        <TabsList class="h-auto w-full flex-wrap justify-start">
          <TabsTrigger
            v-for="(question, index) in request.questions"
            :key="question.id"
            :value="question.id"
            class="flex-none"
          >
            问题 {{ index + 1 }}
          </TabsTrigger>
          <TabsTrigger value="summary" class="flex-none">
            汇总
          </TabsTrigger>
        </TabsList>

        <TabsContent
          v-for="question in request.questions"
          :key="question.id"
          :value="question.id"
          class="space-y-4"
        >
          <div class="space-y-2">
            <p v-if="question.header" class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {{ question.header }}
            </p>
            <h4 class="text-sm font-semibold text-foreground">
              {{ question.question }}
            </h4>
            <p v-if="question.description" class="text-sm text-muted-foreground">
              {{ question.description }}
            </p>
          </div>

          <div v-if="question.options?.length" class="space-y-2">
            <template v-if="question.multiple">
              <div
                v-for="option in question.options"
                :key="option.label"
                class="ridge-panel-inset rounded-[8px] px-3 py-3"
              >
                <div class="flex items-start gap-3">
                  <Checkbox
                    :model-value="getSelectedValues(question.id).includes(option.label)"
                    @update:model-value="toggleMultiOption(question.id, option.label, Boolean($event))"
                  />
                  <div class="space-y-1">
                    <Label class="text-sm font-medium text-foreground">
                      {{ option.label }}
                    </Label>
                    <p v-if="option.description" class="text-xs text-muted-foreground">
                      {{ option.description }}
                    </p>
                  </div>
                </div>
              </div>
            </template>

            <template v-else>
              <Button
                v-for="option in question.options"
                :key="option.label"
                type="button"
                :variant="getSelectedValues(question.id)[0] === option.label ? 'default' : 'outline'"
                class="h-auto w-full justify-start px-3 py-3 text-left"
                @click="setSingleOption(question.id, option.label)"
              >
                <span class="flex flex-col items-start gap-1">
                  <span>{{ option.label }}</span>
                  <span v-if="option.description" class="text-xs opacity-80">
                    {{ option.description }}
                  </span>
                </span>
              </Button>
            </template>
          </div>

          <div v-if="question.allowCustom || !question.options?.length" class="space-y-2">
            <Separator v-if="question.options?.length" />
            <Label class="text-sm font-medium text-foreground">
              {{ question.options?.length ? "自定义答案" : "你的答案" }}
            </Label>
            <Textarea
              v-if="!question.options?.length"
              :model-value="getCustomValue(question.id)"
              class="min-h-24"
              placeholder="输入回答"
              @update:model-value="setCustomValue(question.id, String($event))"
            />
            <Input
              v-else
              :model-value="getCustomValue(question.id)"
              placeholder="输入自定义答案"
              @update:model-value="setCustomValue(question.id, String($event))"
            />
          </div>
        </TabsContent>

        <TabsContent value="summary" class="space-y-3">
          <div
            v-for="row in summaryRows"
            :key="row.question.id"
            class="ridge-panel-inset rounded-[8px] px-3 py-3"
          >
            <p class="text-sm font-medium text-foreground">
              {{ row.question.question }}
            </p>
            <p class="mt-1 text-xs text-muted-foreground">
              {{ row.values.length ? row.values.join("、") : "未回答" }}
            </p>
          </div>
        </TabsContent>
      </Tabs>

      <div v-else class="space-y-4">
        <div class="space-y-2">
          <p v-if="request.questions[0]?.header" class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {{ request.questions[0]?.header }}
          </p>
          <h4 class="text-sm font-semibold text-foreground">
            {{ request.questions[0]?.question }}
          </h4>
          <p v-if="request.questions[0]?.description" class="text-sm text-muted-foreground">
            {{ request.questions[0]?.description }}
          </p>
        </div>

        <template v-if="request.questions[0]?.options?.length">
          <template v-if="request.questions[0]?.multiple">
            <div
              v-for="option in request.questions[0]?.options"
              :key="option.label"
              class="ridge-panel-inset rounded-[8px] px-3 py-3"
            >
              <div class="flex items-start gap-3">
                <Checkbox
                  :model-value="getSelectedValues(request.questions[0].id).includes(option.label)"
                  @update:model-value="toggleMultiOption(request.questions[0].id, option.label, Boolean($event))"
                />
                <div class="space-y-1">
                  <Label class="text-sm font-medium text-foreground">
                    {{ option.label }}
                  </Label>
                  <p v-if="option.description" class="text-xs text-muted-foreground">
                    {{ option.description }}
                  </p>
                </div>
              </div>
            </div>
          </template>

          <template v-else>
            <Button
              v-for="option in request.questions[0]?.options"
              :key="option.label"
              type="button"
              :variant="getSelectedValues(request.questions[0].id)[0] === option.label ? 'default' : 'outline'"
              class="h-auto w-full justify-start px-3 py-3 text-left"
              @click="setSingleOption(request.questions[0].id, option.label)"
            >
              <span class="flex flex-col items-start gap-1">
                <span>{{ option.label }}</span>
                <span v-if="option.description" class="text-xs opacity-80">
                  {{ option.description }}
                </span>
              </span>
            </Button>
          </template>
        </template>

        <div v-if="request.questions[0]?.allowCustom || !request.questions[0]?.options?.length" class="space-y-2">
          <Separator v-if="request.questions[0]?.options?.length" />
          <Label class="text-sm font-medium text-foreground">
            {{ request.questions[0]?.options?.length ? "自定义答案" : "你的答案" }}
          </Label>
          <Textarea
            v-if="!request.questions[0]?.options?.length"
            :model-value="getCustomValue(request.questions[0].id)"
            class="min-h-24"
            placeholder="输入回答"
            @update:model-value="setCustomValue(request.questions[0].id, String($event))"
          />
          <Input
            v-else
            :model-value="getCustomValue(request.questions[0].id)"
            placeholder="输入自定义答案"
            @update:model-value="setCustomValue(request.questions[0].id, String($event))"
          />
        </div>
      </div>

      <p v-if="missingQuestionIds.length" class="text-xs text-destructive">
        还有 {{ missingQuestionIds.length }} 个问题未回答
      </p>
    </CardContent>

    <CardFooter class="justify-end gap-2">
      <Button type="button" variant="ghost" @click="emit('dismiss')">
        取消
      </Button>
      <Button type="button" :disabled="!canSubmit" @click="handleSubmit">
        提交答案
      </Button>
    </CardFooter>
  </Card>
</template>
