<script setup lang="ts">
import "vue-sonner/style.css";
import { useColorMode } from "@vueuse/core";
import { RouterView } from "vue-router";
import { Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import FleetingCaptureButton from "@/components/workspace/FleetingCaptureButton.vue";

const mode = useColorMode();
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <RouterView />
    <FleetingCaptureButton />
    <Sonner :theme="mode === 'dark' ? 'dark' : 'light'" rich-colors close-button position="top-right" />
  </TooltipProvider>
</template>
