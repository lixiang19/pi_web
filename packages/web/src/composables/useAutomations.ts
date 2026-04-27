import { ref } from "vue";

import {
  createAutomation,
  deleteAutomation,
  getAutomations,
  runAutomationNow,
  toggleAutomation,
  updateAutomation,
} from "@/lib/api";
import type { AutomationRule, AutomationRuleInput } from "@/lib/types";

const rules = ref<AutomationRule[]>([]);
const isLoading = ref(false);
const error = ref("");
let loadPromise: Promise<AutomationRule[]> | null = null;

const sortRules = (items: AutomationRule[]) =>
  [...items].sort((left, right) => right.updatedAt - left.updatedAt);

const replaceRule = (rule: AutomationRule) => {
  rules.value = sortRules([
    rule,
    ...rules.value.filter((item) => item.id !== rule.id),
  ]);
};

const load = async () => {
  if (loadPromise) {
    return loadPromise;
  }

  isLoading.value = true;
  error.value = "";
  loadPromise = getAutomations()
    .then((response) => {
      rules.value = sortRules(response.rules);
      return rules.value;
    })
    .catch((caughtError) => {
      error.value =
        caughtError instanceof Error ? caughtError.message : String(caughtError);
      throw caughtError;
    })
    .finally(() => {
      isLoading.value = false;
      loadPromise = null;
    });

  return loadPromise;
};

const save = async (payload: AutomationRuleInput, id?: string) => {
  isLoading.value = true;
  error.value = "";

  try {
    const rule = id
      ? await updateAutomation(id, payload)
      : await createAutomation(payload);
    replaceRule(rule);
    return rule;
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error ? caughtError.message : String(caughtError);
    return null;
  } finally {
    isLoading.value = false;
  }
};

const setEnabled = async (id: string, enabled: boolean) => {
  const rule = await toggleAutomation(id, enabled);
  replaceRule(rule);
  return rule;
};

const runNow = async (id: string) => runAutomationNow(id);

const remove = async (id: string) => {
  await deleteAutomation(id);
  rules.value = rules.value.filter((item) => item.id !== id);
};

export function useAutomations() {
  return {
    error,
    isLoading,
    load,
    remove,
    rules,
    runNow,
    save,
    setEnabled,
  };
}
