import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-privacy-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="legal-page page-shell">
      <header class="legal-header">
        <h1 class="hero-title">Privacy Policy</h1>
        <p class="hero-subtitle">Last updated: April 8, 2026</p>
      </header>

      <article class="card legal-card">
        <h2>Who we are</h2>
        <p>
          Audiobook Platform is a personal academic project. It provides audiobook library and listening features for invited users.
        </p>

        <h2>What data we collect</h2>
        <ul>
          <li>Account data: email address, display name, and authentication provider information.</li>
          <li>Usage data: listening sessions, progress markers, and library actions.</li>
          <li>Technical data: basic logs needed for security, debugging, and performance.</li>
        </ul>

        <h2>How we use data</h2>
        <ul>
          <li>To authenticate users and protect accounts.</li>
          <li>To save progress and provide playback/statistics features.</li>
          <li>To maintain and improve platform reliability.</li>
        </ul>

        <h2>Sharing</h2>
        <p>
          Data is not sold. OAuth providers (Google/Apple) process sign-in data according to their own policies.
        </p>

        <h2>Retention</h2>
        <p>
          Account and listening data are retained while your account is active or until deletion is requested.
        </p>

        <h2>Your choices</h2>
        <p>
          You can request account removal and associated data deletion by contacting the project owner.
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
export class PrivacyPage {}
