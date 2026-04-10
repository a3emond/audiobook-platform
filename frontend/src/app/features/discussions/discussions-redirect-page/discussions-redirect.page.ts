import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-discussions-redirect-page',
  standalone: true,
  templateUrl: './discussions-redirect.page.html',
})
// Main UI/state logic for this standalone view component.
export class DiscussionsRedirectPage implements OnInit {
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    const preferred = this.auth.user()?.profile.preferredLocale;
    const lang = preferred === 'fr' ? 'fr' : 'en';
    void this.router.navigate(['/discussions', lang], { replaceUrl: true });
  }
}
