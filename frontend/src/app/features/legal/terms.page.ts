import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-terms-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="legal-page page-shell">
      <header class="legal-header">
        <h1 class="hero-title">Terms of Service</h1>
        <p class="hero-subtitle">Last updated: April 8, 2026</p>
      </header>

      <article class="card legal-card">
        <h2>Scope</h2>
        <p>
          Audiobook Platform is a personal academic project made available to invited users.
        </p>

        <h2>Accounts</h2>
        <ul>
          <li>You are responsible for activity under your account.</li>
          <li>Do not share credentials or abuse authentication systems.</li>
        </ul>

        <h2>Acceptable use</h2>
        <ul>
          <li>Use the service for lawful, personal listening activity.</li>
          <li>Do not attempt to disrupt, reverse engineer, or misuse the platform.</li>
        </ul>

        <h2>Content</h2>
        <p>
          Uploaded or managed audiobook content must respect applicable copyright and licensing obligations.
        </p>

        <h2>Availability</h2>
        <p>
          This project is provided as-is for educational purposes and may change, pause, or stop without notice.
        </p>

        <h2>Liability</h2>
        <p>
          To the maximum extent permitted by law, the service is provided without warranties.
        </p>

        <h2>Contact</h2>
        <p>
          Contact: project owner at school project contact channel.
        </p>
      </article>
    </section>
  `,
  styles: [
    `
      .legal-page {
        display: grid;
        gap: 1rem;
      }

      .legal-header {
        display: grid;
        gap: 0.35rem;
      }

      .legal-card {
        display: grid;
        gap: 0.8rem;
        line-height: 1.6;
      }

      .legal-card h2 {
        margin: 0.2rem 0 0;
        font-size: 1.05rem;
      }

      .legal-card p,
      .legal-card ul {
        margin: 0;
      }

      .legal-card ul {
        padding-left: 1.15rem;
      }
    `,
  ],
})
export class TermsPage {}
