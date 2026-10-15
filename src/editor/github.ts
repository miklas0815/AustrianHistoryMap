// Zugriff auf das GitHub-Repository über die REST-API, direkt aus dem Browser.
// Gelesen und geschrieben wird immer der Standard-Branch; ein Commit dort löst den
// Upload auf den Webspace aus.

export const REPO = { owner: 'miklas0815', repo: 'AustrianHistoryMap' };
export const DATA_DIR = 'public/data/';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface RepoFile {
  path: string;
  /** Blob-SHA, um beim Speichern zu erkennen, ob die Datei inzwischen geändert wurde. */
  sha: string;
  text: string;
}

export class GitHub {
  branch = '';
  login = '';

  constructor(private token: string) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}/repos/${REPO.owner}/${REPO.repo}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let detail = '';
      try {
        detail = ((await res.json()) as { message?: string }).message ?? '';
      } catch { /* kein JSON */ }
      const hint =
        res.status === 401 ? 'Zugangsschlüssel ungültig oder abgelaufen' :
        res.status === 403 || res.status === 404 ? 'keine Berechtigung für dieses Repository (Schlüssel prüfen: Repository-Zugriff und „Contents: Read and write“)' :
        res.status === 409 || res.status === 422 ? 'der Branch wurde inzwischen geändert' : '';
      throw new GitHubError(`GitHub ${res.status}${hint ? ': ' + hint : ''}${detail ? ` (${detail})` : ''}`, res.status);
    }
    return (await res.json()) as T;
  }

  /** Prüft den Schlüssel und ermittelt Standard-Branch und Schreibrecht. */
  async connect(): Promise<void> {
    const repo = await this.call<{ default_branch: string; permissions?: { push?: boolean } }>('GET', '');
    if (!repo.permissions?.push) throw new GitHubError('Der Zugangsschlüssel erlaubt kein Schreiben in dieses Repository („Contents: Read and write“ fehlt).', 403);
    this.branch = repo.default_branch;
    try {
      const user = await fetch(`${API}/user`, { headers: { Authorization: `Bearer ${this.token}` } });
      if (user.ok) this.login = ((await user.json()) as { login: string }).login;
    } catch { /* nur für die Anzeige */ }
  }

  private async head(): Promise<string> {
    const ref = await this.call<{ object: { sha: string } }>('GET', `/git/ref/heads/${encodeURIComponent(this.branch)}`);
    return ref.object.sha;
  }

  /** Blob-SHAs aller Dateien im Datenordner beim angegebenen Commit. */
  private async dataShas(commit: string): Promise<Map<string, string>> {
    const tree = await this.call<{ tree: { path: string; sha: string; type: string }[]; truncated: boolean }>(
      'GET', `/git/trees/${commit}?recursive=1`);
    return new Map(tree.tree.filter((t) => t.type === 'blob' && t.path.startsWith(DATA_DIR)).map((t) => [t.path, t.sha]));
  }

  /** Liest alle JSON-Dateien des Datenordners vom aktuellen Stand des Branches. */
  async readDataFiles(): Promise<RepoFile[]> {
    const shas = await this.dataShas(await this.head());
    const paths = [...shas.keys()].filter((p) => p.endsWith('.json'));
    return Promise.all(paths.map(async (path) => {
      const blob = await this.call<{ content: string }>('GET', `/git/blobs/${shas.get(path)}`);
      const bytes = Uint8Array.from(atob(blob.content.replace(/\n/g, '')), (c) => c.charCodeAt(0));
      return { path, sha: shas.get(path)!, text: new TextDecoder().decode(bytes) };
    }));
  }

  /**
   * Schreibt die geänderten Dateien als einen Commit. `expected` enthält die SHAs beim
   * Laden; wurde eine der Dateien inzwischen anderweitig geändert, wird abgebrochen.
   * Liefert die neuen Blob-SHAs.
   */
  async commit(files: { path: string; text: string }[], expected: Map<string, string>, message: string): Promise<{ commit: string; shas: Map<string, string> }> {
    const head = await this.head();
    const current = await this.dataShas(head);
    const changedElsewhere = files.filter((f) => (current.get(f.path) ?? '') !== (expected.get(f.path) ?? ''));
    if (changedElsewhere.length) {
      throw new GitHubError(
        `Inzwischen wurde ${changedElsewhere.map((f) => f.path.replace(DATA_DIR, '')).join(', ')} anderweitig geändert. ` +
        'Bitte die Seite neu laden; Ihre ungespeicherten Änderungen bleiben als Entwurf erhalten.', 409);
    }
    const headCommit = await this.call<{ tree: { sha: string } }>('GET', `/git/commits/${head}`);
    const tree = await this.call<{ sha: string; tree: { path: string; sha: string }[] }>('POST', '/git/trees', {
      base_tree: headCommit.tree.sha,
      tree: files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', content: f.text })),
    });
    const commit = await this.call<{ sha: string }>('POST', '/git/commits', { message, tree: tree.sha, parents: [head] });
    await this.call('PATCH', `/git/refs/heads/${encodeURIComponent(this.branch)}`, { sha: commit.sha });
    const shas = await this.dataShas(commit.sha);
    return { commit: commit.sha, shas };
  }
}
