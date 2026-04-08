import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  AdminService,
  AdminUser,
  AdminUserSession,
} from '../../core/services/admin.service';

@Component({
  selector: 'app-admin-users-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section>
      <h1>Admin Users</h1>

      <form class="filters" (ngSubmit)="reload()">
        <input name="q" [(ngModel)]="q" placeholder="Search email/display name" />
        <select name="role" [(ngModel)]="roleFilter">
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
        </select>
        <button type="submit">Search</button>
      </form>

      <p *ngIf="loading()">Loading users...</p>
      <p *ngIf="error()" class="error">{{ error() }}</p>
      <p *ngIf="success()" class="success">{{ success() }}</p>

      <table *ngIf="users().length > 0">
        <thead>
          <tr><th>Email</th><th>Display Name</th><th>Role</th><th>Actions</th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let user of users()">
            <td>{{ user.email }}</td>
            <td>{{ user.profile.displayName || '-' }}</td>
            <td>{{ user.role }}</td>
            <td>
              <button type="button" (click)="toggleRole(user)">
                Make {{ user.role === 'admin' ? 'User' : 'Admin' }}
              </button>
              <button type="button" (click)="loadSessions(user)">Sessions</button>
              <button type="button" (click)="revokeSessions(user)">Revoke Sessions</button>
            </td>
          </tr>
        </tbody>
      </table>

      <section *ngIf="selectedUser()" class="sessions">
        <h2>Sessions for {{ selectedUser()?.email }}</h2>
        <p *ngIf="sessionsLoading()">Loading sessions...</p>
        <table *ngIf="sessions().length > 0">
          <thead>
            <tr><th>Device</th><th>IP</th><th>Last Used</th><th>Expires</th></tr>
          </thead>
          <tbody>
            <tr *ngFor="let session of sessions()">
              <td>{{ session.device || '-' }}</td>
              <td>{{ session.ip || '-' }}</td>
              <td>{{ session.lastUsedAt }}</td>
              <td>{{ session.expiresAt }}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </section>
  `,
  styles: [
    `
      .filters { display: flex; gap: 0.5rem; margin-bottom: 0.8rem; }
      table { width: 100%; border-collapse: collapse; background: #fff; }
      th, td { border: 1px solid #e4e4e7; padding: 0.45rem; text-align: left; }
      td button { margin-right: 0.4rem; }
      .sessions { margin-top: 1rem; }
      .error { color: #b81f24; }
      .success { color: #166534; }
    `,
  ],
})
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
