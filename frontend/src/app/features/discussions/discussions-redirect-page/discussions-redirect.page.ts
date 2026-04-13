import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { filter, take } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-discussions-redirect-page',
  standalone: true,
  templateUrl: './discussions-redirect.page.html',
})
// Main UI/state logic for this standalone view component.
export class DiscussionsRedirectPage implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    toObservable(this.auth.initialized)
      .pipe(filter(Boolean), take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const preferred = this.auth.user()?.profile.preferredLocale;
        const lang = preferred === 'fr' ? 'fr' : 'en';
        void this.router.navigate(['/discussions', lang], { replaceUrl: true });
      });
  }
}
