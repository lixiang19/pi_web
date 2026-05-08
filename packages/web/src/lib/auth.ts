import { reactive } from "vue";
import type { Router } from "vue-router";
import {
	getAuthSession,
	login,
	logout,
	setUnauthorizedHandler,
} from "./api";

export const authState = reactive({
	checked: false,
	authenticated: false,
});

export function markUnauthenticated() {
	authState.checked = true;
	authState.authenticated = false;
}

export async function ensureAuthSession() {
	if (authState.checked) {
		return authState.authenticated;
	}
	const session = await getAuthSession();
	authState.checked = true;
	authState.authenticated = session.authenticated;
	return authState.authenticated;
}

export async function loginWithPassword(password: string) {
	await login(password);
	authState.checked = true;
	authState.authenticated = true;
}

export async function logoutAuth() {
	await logout();
	markUnauthenticated();
}

export function installUnauthorizedRedirect(router: Router) {
	setUnauthorizedHandler(() => {
		markUnauthenticated();
		if (router.currentRoute.value.name !== "login") {
			void router.push({
				name: "login",
				query: { redirect: router.currentRoute.value.fullPath },
			});
		}
	});
}
