import { Pipe, PipeTransform, inject } from '@angular/core';

import { I18nService } from '../services/i18n.service';

@Pipe({
  name: 't',
  standalone: true,
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(
    key: string,
    fallbackOrParams?: string | Record<string, string | number | boolean | null | undefined>,
    paramsMaybe?: Record<string, string | number | boolean | null | undefined>,
  ): string {
    return this.i18n.t(key, fallbackOrParams, paramsMaybe);
  }
}
