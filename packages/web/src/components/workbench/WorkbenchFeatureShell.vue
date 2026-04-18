<script setup lang="ts">
defineProps<{
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
}>();
</script>

<template>
  <div class="h-full overflow-auto bg-background">
    <div class="mx-auto flex min-h-full max-w-5xl flex-col gap-6 px-6 py-8">
      <section class="rounded-3xl border border-border/70 bg-card/70 p-8 shadow-sm">
        <p class="text-[11px] font-black uppercase tracking-[0.24em] text-primary/70">
          {{ eyebrow }}
        </p>
        <h1 class="mt-3 text-3xl font-semibold tracking-tight text-foreground">
          {{ title }}
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          {{ description }}
        </p>
      </section>

      <section class="grid gap-4 md:grid-cols-2">
        <article
          v-for="point in points"
          :key="point"
          class="rounded-2xl border border-border/70 bg-card/60 p-5"
        >
          <p class="text-sm leading-7 text-foreground/85">
            {{ point }}
          </p>
        </article>
      </section>

      <slot />
    </div>
  </div>
</template>
