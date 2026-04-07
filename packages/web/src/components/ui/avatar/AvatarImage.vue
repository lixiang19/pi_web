<script setup lang="ts">
import type { AvatarImageProps } from "reka-ui";
import { AvatarImage } from "reka-ui";
import { useDefinedObject } from "@/lib/utils";

const props = defineProps<AvatarImageProps>();
const forwardedProps = useDefinedObject(props);
</script>

<template>
  <AvatarImage
    data-slot="avatar-image"
    v-bind="forwardedProps"
    class="aspect-square size-full"
  >
    <slot />
  </AvatarImage>
</template>
