<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginWithPassword } from "@/lib/auth";

const route = useRoute();
const router = useRouter();
const password = ref("");
const isSubmitting = ref(false);
const errorMessage = ref("");

const redirectPath = computed(() => {
	const redirect = route.query["redirect"];
	return typeof redirect === "string" && redirect.startsWith("/")
		? redirect
		: "/";
});

async function submitLogin() {
	if (!password.value || isSubmitting.value) {
		return;
	}
	errorMessage.value = "";
	isSubmitting.value = true;
	try {
		await loginWithPassword(password.value);
		await router.replace(redirectPath.value);
	} catch {
		errorMessage.value = "密码不正确";
	} finally {
		isSubmitting.value = false;
	}
}
</script>

<template>
  <main class="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
    <form class="w-full max-w-sm rounded-3xl border border-border/60 bg-card/95 p-8 shadow-2xl shadow-black/10" @submit.prevent="submitLogin">
      <div class="space-y-2">
        <p class="text-sm font-medium text-muted-foreground">ridge private workspace</p>
        <h1 class="text-2xl font-semibold tracking-tight">输入访问密码</h1>
        <p class="text-sm text-muted-foreground">这是个人 VPS 工作台，登录后才能访问文件、会话和终端。</p>
      </div>

      <div class="mt-8 space-y-2">
        <Label for="ridge-password">密码</Label>
        <Input id="ridge-password" v-model="password" type="password" autocomplete="current-password" autofocus />
      </div>

      <p v-if="errorMessage" class="mt-3 text-sm text-destructive" role="alert">{{ errorMessage }}</p>

      <Button class="mt-6 w-full" type="submit" :disabled="isSubmitting || !password">
        {{ isSubmitting ? "登录中..." : "进入工作台" }}
      </Button>
    </form>
  </main>
</template>
