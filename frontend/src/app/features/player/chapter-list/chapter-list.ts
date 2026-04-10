import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import type { Chapter } from '../../../core/models/api.models';

@Component({
	selector: 'app-chapter-list',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './chapter-list.html',
})
// Main UI/state logic for this standalone view component.
export class ChapterListComponent {
	@Input() chapters: Chapter[] = [];
}
