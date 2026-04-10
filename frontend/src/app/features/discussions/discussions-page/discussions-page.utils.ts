import type {
  DiscussionChannel,
  DiscussionLanguage,
  DiscussionMessage,
} from '../../../core/models/api.models';

// Discussions page helpers: isolate pure formatting/validation from component state orchestration.
export function canDeleteChannel(channel: DiscussionChannel): boolean {
  return !channel.isDefault;
}

export function hasOriginalInLoadedMessages(messages: DiscussionMessage[], replyToMessageId?: string): boolean {
  if (!replyToMessageId) {
    return false;
  }

  return messages.some((message) => message.id === replyToMessageId);
}

export function messageDomId(messageId: string): string {
  return `msg-${messageId}`;
}

export function previewBody(body: string): string {
  return body.trim().slice(0, 120);
}

export function formatDiscussionDate(lang: DiscussionLanguage, value?: string): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(lang, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

export function validateNewChannelInput(title: string, description: string): boolean {
  return Boolean(title.trim() && description.trim());
}