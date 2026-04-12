<script setup lang="ts">
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PermissionDecisionAction, PermissionInteractiveRequest } from "@/lib/types";

defineProps<{
  request: PermissionInteractiveRequest;
}>();

const emit = defineEmits<{
  submit: [action: PermissionDecisionAction];
}>();
</script>

<template>
  <Card class="ridge-panel-header gap-3 rounded-[10px] shadow-sm">
    <CardHeader class="gap-2">
      <div class="flex items-start justify-between gap-3">
        <div class="space-y-1">
          <CardTitle class="text-base">
            {{ request.title }}
          </CardTitle>
          <p class="text-sm text-muted-foreground">
            {{ request.message }}
          </p>
        </div>
        <Badge variant="outline">权限审批</Badge>
      </div>
    </CardHeader>

    <CardContent class="space-y-3">
      <div class="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{{ request.toolName }}</Badge>
        <Badge variant="outline">{{ request.permissionKey }}</Badge>
        <Badge v-if="request.suggestedPattern" variant="outline">
          always → {{ request.suggestedPattern }}
        </Badge>
      </div>

      <div class="ridge-panel-inset rounded-[8px] px-3 py-3">
        <p class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          当前请求
        </p>
        <p class="mt-2 break-all font-mono text-xs text-foreground">
          {{ request.subject }}
        </p>
      </div>
    </CardContent>

    <CardFooter class="justify-end gap-2">
      <Button type="button" variant="destructive" @click="emit('submit', 'reject')">
        reject
      </Button>
      <Button
        v-if="request.suggestedPattern"
        type="button"
        variant="outline"
        @click="emit('submit', 'always')"
      >
        always
      </Button>
      <Button type="button" @click="emit('submit', 'once')">
        once
      </Button>
    </CardFooter>
  </Card>
</template>
