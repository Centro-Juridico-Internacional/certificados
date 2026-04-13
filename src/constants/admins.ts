export const ADMIN_EMAILS = [
  "desarrollo@centrojuridicointernacional.com",
  "auditoria@centrojuridicointernacional.com",
];

export const isAdmin = (email: string | null | undefined): boolean => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
};
