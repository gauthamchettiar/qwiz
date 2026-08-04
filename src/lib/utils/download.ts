/** Turns a quiz title into a safe filename stem, e.g. for the "Download .qwiz" button. */
export function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'quiz'
  );
}

/** Triggers a browser download of `content` as a plain-text file — no server involved. */
export function downloadTextFile(filename: string, content: string): void {
  downloadBlobFile(filename, new Blob([content], { type: 'text/plain' }));
}

/** The same, for something already assembled as a Blob — a group's `.zip`, say. */
export function downloadBlobFile(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Some browsers (notably Safari) silently ignore a click on an <a> that was never attached to
  // the document, and revoking the blob URL synchronously can race the download starting.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
