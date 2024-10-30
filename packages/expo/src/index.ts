import { atom } from "nanostores";
import type { BetterAuthClientPlugin } from "better-auth";
import * as SecureStore from "expo-secure-store";
import * as Linking from "expo-linking";
import * as Browser from "expo-web-browser";
import * as Constants from "expo-constants";

export const expoClient = () => {
	let sessionNotify = () => {};
	const cookieName = "better-auth_cookie";
	const storeCookie = SecureStore.getItem("cookie");
	const hasSessionCookie = storeCookie?.includes("session_token");
	const isAuthenticated = atom<boolean>(!!hasSessionCookie);
	const storage = SecureStore;
	return {
		id: "expo",
		getActions(_, $store) {
			sessionNotify = () => $store.notify("$sessionSignal");
			return {};
		},
		getAtoms() {
			return {
				isAuthenticated,
			};
		},
		fetchPlugins: [
			{
				id: "expo",
				name: "Expo",
				hooks: {
					async onSuccess(context) {
						const setCookie = context.response.headers.get("set-cookie");
						if (setCookie) {
							await storage.setItemAsync(cookieName, setCookie);
						}
						if (
							context.data.redirect &&
							context.request.url.toString().includes("/sign-in")
						) {
							const callbackURL = context.request.body?.callbackURL;
							const to = Linking.createURL(callbackURL);
							const signInURL = context.data?.url;
							const result = await Browser.openAuthSessionAsync(signInURL, to);
							if (result.type !== "success") return;
							const url = Linking.parse(result.url);
							const cookie = String(url.queryParams?.cookie);
							if (!cookie) return;
							await storage.setItemAsync(cookieName, cookie);
							sessionNotify();
						}
					},
				},
				async init(url, options) {
					options = options || {};
					const cookie = await storage.getItemAsync(cookieName);
					const scheme = Constants.default.expoConfig?.scheme;
					const schemeURL = typeof scheme === "string" ? scheme : scheme?.[0];
					if (!schemeURL) {
						throw new Error("Scheme not found in app.json");
					}
					options.credentials = "omit";
					options.headers = {
						...options.headers,
						cookie: cookie || "",
						origin: schemeURL,
					};
					if (options.body?.callbackURL) {
						if (options.body.callbackURL.startsWith("/")) {
							const url = Linking.createURL(options.body.callbackURL);
							options.body.callbackURL = url;
						}
					}
					if (url.includes("/sign-out")) {
						isAuthenticated.set(false);
						await SecureStore.deleteItemAsync(cookieName);
						sessionNotify();
					}
					return {
						url,
						options,
					};
				},
			},
		],
	} satisfies BetterAuthClientPlugin;
};
