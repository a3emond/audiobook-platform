import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class I18nService {
	private readonly localeState = signal<'fr' | 'en'>('en');
	readonly locale = this.localeState.asReadonly();

	setLocale(locale: 'fr' | 'en'): void {
		this.localeState.set(locale);
		document.documentElement.lang = locale;
	}
}
