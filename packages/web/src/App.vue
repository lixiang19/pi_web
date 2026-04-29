<script setup lang="ts">
import "vue-sonner/style.css";
import { useColorMode } from "@vueuse/core";
import { RouterView } from "vue-router";
import { Sonner } from "@/components/ui/sonner";

const mode = useColorMode();
</script>

<template>
  <RouterView />
  <Sonner :theme="mode === 'dark' ? 'dark' : 'light'" rich-colors close-button position="top-right" />
</template>
