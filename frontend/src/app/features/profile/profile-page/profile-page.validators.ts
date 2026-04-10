export interface PasswordFormState {
  currentPassword: string;
  newPassword: string;
  confirmNewPassword: string;
}

export interface EmailFormState {
  emailCurrentPassword: string;
  newEmail: string;
  confirmNewEmail: string;
}

// Validation helpers: keep user-facing messages and checks consistent across submit handlers.
export function validatePasswordForm(state: PasswordFormState): string | null {
  if (!state.currentPassword || !state.newPassword || !state.confirmNewPassword) {
    return 'Please complete all password fields';
  }

  if (state.newPassword !== state.confirmNewPassword) {
    return 'New password confirmation does not match';
  }

  return null;
}

export function validateEmailForm(state: EmailFormState): string | null {
  if (!state.emailCurrentPassword || !state.newEmail || !state.confirmNewEmail) {
    return 'Please complete all email fields';
  }

  if (state.newEmail !== state.confirmNewEmail) {
    return 'Email confirmation does not match';
  }

  return null;
}