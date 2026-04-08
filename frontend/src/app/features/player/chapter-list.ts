import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

import type { Chapter } from '../../core/models/api.models';

@Component({
	selector: 'app-chapter-list',
	standalone: true,
	imports: [CommonModule],
	template: `
		<section>
			<h3>Chapters</h3>
			<ol>
				<li *ngFor="let chapter of chapters">
					{{ chapter.index + 1 }}. {{ chapter.title }}
				</li>
			</ol>
		</section>
	`,
})
export class ChapterListComponent {
	@Input() chapters: Chapter[] = [];
}
