import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  AdminService,
  AdminUser,
  AdminUserSession,
} from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-users-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-users.page.html',
  styleUrl: './admin-users.page.css',
})
// Main UI/state logic for this standalone view component.
export class AdminUsersPage implements OnInit {
  private readonly admin = inject(AdminService);

  q = '';
  roleFilter: '' | 'admin' | 'user' = '';

  readonly users = signal<AdminUser[]>([]);
  readonly sessions = signal<AdminUserSession[]>([]);
  readonly selectedUser = signal<AdminUser | null>(null);
  readonly loading = signal(false);
  readonly sessionsLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);

    this.admin
      .listUsers({
        q: this.q.trim() || undefined,
        role: this.roleFilter || undefined,
        limit: 50,
        offset: 0,
      })
      .subscribe({
        next: (response) => {
          this.users.set(response.users);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(error instanceof Error ? error.message : 'Unable to load users');
          this.loading.set(false);
        },
      });
  }

  toggleRole(user: AdminUser): void {
    const nextRole: 'admin' | 'user' = user.role === 'admin' ? 'user' : 'admin';

    this.admin.updateUserRole(user.id, nextRole).subscribe({
      next: () => {
        this.success.set(`Updated ${user.email} to ${nextRole}`);
        this.reload();
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to update role');
      },
    });
  }

  loadSessions(user: AdminUser): void {
    this.selectedUser.set(user);
    this.sessionsLoading.set(true);

    this.admin.listUserSessions(user.id, 50, 0).subscribe({
      next: (response) => {
        this.sessions.set(response.sessions);
        this.sessionsLoading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to load sessions');
        this.sessionsLoading.set(false);
      },
    });
  }

  revokeSessions(user: AdminUser): void {
    const confirmed = confirm(`Revoke all sessions for ${user.email}?`);
    if (!confirmed) {
      return;
    }

    this.admin.revokeUserSessions(user.id).subscribe({
      next: (response) => {
        this.success.set(`Revoked ${response.revoked} sessions for ${user.email}`);
        if (this.selectedUser()?.id === user.id) {
          this.sessions.set([]);
        }
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to revoke sessions');
      },
    });
  }
}
