/**
 * Minimal class-name merger, the local stand-in for shadcn's `cn`.
 * Files: false/null/undefined entries and joins the rest with spaces.
 */
export function cn(...inputs: Array<string | false | null | undefined>): string {
  return inputs.filter(Boolean).join(' ');
}
