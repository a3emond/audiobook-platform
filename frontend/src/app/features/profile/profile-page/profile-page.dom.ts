import type { ProfileSection } from './profile-page.types';

const SECTION_IDS: ProfileSection[] = ['account', 'security', 'stats', 'history'];

// DOM helper: encapsulates section tracking behavior so the page class stays focused on state.
export function createProfileSectionObserver(
  onSectionChange: (section: ProfileSection) => void,
): IntersectionObserver | null {
  const elements = SECTION_IDS
    .map((id) => document.getElementById(id))
    .filter((element): element is HTMLElement => !!element);

  if (elements.length === 0) {
    return null;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      if (visible.length === 0) {
        return;
      }

      const section = visible[0].target.id as ProfileSection;
      onSectionChange(section);
    },
    {
      root: null,
      rootMargin: '-20% 0px -60% 0px',
      threshold: [0.15, 0.4, 0.7],
    },
  );

  for (const element of elements) {
    observer.observe(element);
  }

  return observer;
}

export function scrollToProfileSection(section: ProfileSection): boolean {
  const element = document.getElementById(section);
  if (!element) {
    return false;
  }

  element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
}