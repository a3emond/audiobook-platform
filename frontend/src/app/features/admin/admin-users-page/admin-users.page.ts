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

  readonly pageSize = 50;
  readonly sessionsPageSize = 50;

  q = '';
  roleFilter: '' | 'admin' | 'user' = '';

  readonly users = signal<AdminUser[]>([]);
  readonly sessions = signal<AdminUserSession[]>([]);
  readonly selectedUser = signal<AdminUser | null>(null);
  readonly loading = signal(false);
  readonly sessionsLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  readonly usersOffset = signal(0);
  readonly usersTotal = signal(0);
  readonly usersHasMore = signal(false);

  readonly sessionsOffset = signal(0);
  readonly sessionsTotal = signal(0);
  readonly sessionsHasMore = signal(false);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.usersOffset.set(0);
    this.loadUsersPage(0);
  }

  private loadUsersPage(offset: number): void {
    this.loading.set(true);
    this.error.set(null);

    this.admin
      .listUsers({
        q: this.q.trim() || undefined,
        role: this.roleFilter || undefined,
        limit: this.pageSize,
        offset,
      })
      .subscribe({
        next: (response) => {
          this.users.set(response.users);
          this.usersTotal.set(response.total);
          this.usersHasMore.set(response.hasMore);
          this.usersOffset.set(offset);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.error.set(error instanceof Error ? error.message : 'Unable to load users');
          this.loading.set(false);
        },
      });
  }

  usersPrevPage(): void {
    const prev = Math.max(0, this.usersOffset() - this.pageSize);
    this.loadUsersPage(prev);
  }

  usersNextPage(): void {
    if (this.usersHasMore()) {
      this.loadUsersPage(this.usersOffset() + this.pageSize);
    }
  }

  usersCurrentPage(): number {
    return Math.floor(this.usersOffset() / this.pageSize) + 1;
  }

  usersTotalPages(): number {
    return Math.ceil(this.usersTotal() / this.pageSize);
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
    this.sessionsOffset.set(0);
    this.loadSessionsPage(user, 0);
  }

  private loadSessionsPage(user: AdminUser, offset: number): void {
    this.sessionsLoading.set(true);

    this.admin.listUserSessions(user.id, this.sessionsPageSize, offset).subscribe({
      next: (response) => {
        this.sessions.set(response.sessions);
        this.sessionsTotal.set(response.total);
        this.sessionsHasMore.set(response.hasMore);
        this.sessionsOffset.set(offset);
        this.sessionsLoading.set(false);
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to load sessions');
        this.sessionsLoading.set(false);
      },
    });
  }

  sessionsPrevPage(): void {
    const user = this.selectedUser();
    if (!user) { return; }
    const prev = Math.max(0, this.sessionsOffset() - this.sessionsPageSize);
    this.loadSessionsPage(user, prev);
  }

  sessionsNextPage(): void {
    const user = this.selectedUser();
    if (!user || !this.sessionsHasMore()) { return; }
    this.loadSessionsPage(user, this.sessionsOffset() + this.sessionsPageSize);
  }

  sessionsCurrentPage(): number {
    return Math.floor(this.sessionsOffset() / this.sessionsPageSize) + 1;
  }

  sessionsTotalPages(): number {
    return Math.ceil(this.sessionsTotal() / this.sessionsPageSize);
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
          this.sessionsTotal.set(0);
          this.sessionsHasMore.set(false);
        }
      },
      error: (error: unknown) => {
        this.error.set(error instanceof Error ? error.message : 'Unable to revoke sessions');
      },
    });
  }
}
