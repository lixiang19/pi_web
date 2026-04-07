import { clsx, type ClassValue } from "clsx";
import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { twMerge } from "tailwind-merge";

type DefinedObject<T extends Record<string, unknown>> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<
    T[K],
    undefined
  >;
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function omitUndefined<T extends Record<string, unknown>>(
  source: T,
): DefinedObject<T> {
  return Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined),
  ) as DefinedObject<T>;
}

export function useDefinedObject<T extends Record<string, unknown>>(
  source: MaybeRefOrGetter<T>,
) {
  return computed(() => omitUndefined(toValue(source)));
}
