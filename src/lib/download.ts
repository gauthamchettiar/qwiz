/** Turns a trivia title into a safe filename stem, e.g. for "Download JSON" buttons. */
export function slugify(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'trivia';
}

/** Triggers a browser download of `data` as a formatted JSON file — no server involved. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Some browsers (notably Safari) silently ignore a click on an <a> that was never attached
  // to the document, and revoking the blob URL synchronously can race the download starting.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
