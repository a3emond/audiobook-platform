import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  selector: 'app-terms-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './terms.page.html',
  styleUrl: './terms.page.css',
})
// Main UI/state logic for this standalone view component.
export class TermsPage {}
