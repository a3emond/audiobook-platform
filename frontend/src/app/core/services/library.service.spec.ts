import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ApiService } from './api.service';
import { LibraryService } from './library.service';

describe('LibraryService', () => {
  it('calls listBooks with /books and filter params', async () => {
    const apiSpy = {
      get: vi.fn().mockReturnValue(
      of({ books: [], total: 0, limit: 20, offset: 0, hasMore: false }),
      ),
    } as unknown as ApiService;

    const service = new LibraryService(apiSpy);

    await firstValueFrom(service.listBooks({ q: 'fitz', limit: 20, offset: 0 }));

    expect(apiSpy.get).toHaveBeenCalledWith('/books', {
      params: { q: 'fitz', limit: 20, offset: 0, language: 'en' },
    });
  });

  it('calls updateCollection with PATCH endpoint', async () => {
    const apiSpy = {
      patch: vi.fn().mockReturnValue(
        of({ id: 'c1', name: 'Favorites', bookIds: ['b1'] }),
      ),
    } as unknown as ApiService;

    const service = new LibraryService(apiSpy);

    await firstValueFrom(service.updateCollection('c1', { bookIds: ['b1', 'b2'] }));

    expect(apiSpy.patch).toHaveBeenCalledWith('/collections/c1', { bookIds: ['b1', 'b2'] });
  });
});
