import { Injectable, computed, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class I18nService {
	private readonly localeState = signal<'fr' | 'en'>('en');
	private readonly messagesState = signal<Record<string, string>>({});
	readonly locale = this.localeState.asReadonly();
	readonly messages = this.messagesState.asReadonly();
	readonly isFrench = computed(() => this.localeState() === 'fr');

	async init(): Promise<void> {
		const persisted = localStorage.getItem('app.locale');
		const browser = navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
		const locale = persisted === 'fr' || persisted === 'en' ? persisted : browser;
		await this.setLocale(locale);
	}

	async setLocale(locale: 'fr' | 'en'): Promise<void> {
		const dictionary = await this.loadDictionary(locale);
		this.localeState.set(locale);
		this.messagesState.set(dictionary);
		localStorage.setItem('app.locale', locale);
		document.documentElement.lang = locale;
	}

	t(
		key: string,
		fallbackOrParams?: string | Record<string, string | number | boolean | null | undefined>,
		paramsMaybe?: Record<string, string | number | boolean | null | undefined>,
	): string {
		const fallback = typeof fallbackOrParams === 'string' ? fallbackOrParams : key;
		const params =
			typeof fallbackOrParams === 'string' ? paramsMaybe : fallbackOrParams;

		const template = this.messagesState()[key] || fallback;
		return this.interpolate(template, params);
	}

	private interpolate(
		template: string,
		params?: Record<string, string | number | boolean | null | undefined>,
	): string {
		if (!params) {
			return template;
		}

		return template.replace(/\{(\w+)\}/g, (_match, token: string) => {
			const value = params[token];
			return value === undefined || value === null ? '' : String(value);
		});
	}

	private async loadDictionary(locale: 'fr' | 'en'): Promise<Record<string, string>> {
		try {
			const response = await fetch(`/i18n/${locale}.json`, {
				headers: {
					Accept: 'application/json',
				},
			});

			if (!response.ok) {
				return {};
			}

			const dictionary = (await response.json()) as Record<string, string>;
			return dictionary;
		} catch {
			return {};
		}
	}
}
