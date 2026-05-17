import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import Utilities from '../helpers/utilities';

export interface InspectResult {
  name: string;
  type: 'file' | 'dir' | 'symlink';
  size: number;
  absolutePath?: string;
  md5?: string;
  sha1?: string;
  sha256?: string;
  sha512?: string;
  mode?: number;
  accessTime?: Date;
  modifyTime?: Date;
  changeTime?: Date;
  birthTime?: Date;
}

// ANTI-PATTERN WARNING: Injecting FsService in an Angular component or service is almost always
// wrong. Angular apps should consume domain-level APIs (saveReport, loadConfiguration, etc.) and
// let the backend own all path resolution and file I/O. Direct FS calls from the frontend bypass
// the backend's domain model, scatter path knowledge across layers, and make the app brittle to
// deployment layout changes.
//
// The known legitimate exceptions in this codebase are narrow and Electron-specific:
//   • LicenseService  — reads/writes license.xml (a singleton sidecar file with no domain endpoint)
//   • ConfigurationRepository — bootstraps the XML settings file before any domain service exists
//   • ConfigurationComponent — creates the initial folder scaffold on first run
//   • ConnectionDetailsComponent — copies a connection template file before the connection exists
//     (no domain endpoint covers this pre-creation step)
//   • FsService.resolveAbsolutePath — translates a relative path to an absolute one using the
//     backend's PORTABLE_EXECUTABLE_DIR anchor (no other service owns this contract)
//
// Every NEW injection of FsService must be argued at the call site: if a domain-level API could
// handle the operation instead, use that. If you are adding a new caller, add it to the list above.
@Injectable({
  providedIn: 'root',
})
export class FsService {
  constructor(protected apiService: ApiService) {}

  async removeAsync(path: string) {
    //console.log('removeAsync', path);
    return this.apiService.delete(
      `/system/fs?path=${encodeURIComponent(
        Utilities.slash(path),
      )}`,
    );
  }

  async copyAsync(
    sourcePath: string,
    destinationPath: string,
    criteria: {
      overwrite?:
        | boolean
        | ((src: any, dest: any) => boolean | Promise<boolean>);
      matching?: string[];
      ignoreCase?: boolean;
    } = {},
  ): Promise<void> {
    const overwrite =
      typeof criteria.overwrite === 'function'
        ? criteria.overwrite(sourcePath, destinationPath)
        : criteria.overwrite;

    //console.log(`overwrite = ${overwrite}`);

    let postUrl = `/system/fs/copy?fromPath=${encodeURIComponent(
      Utilities.slash(sourcePath),
    )}&toPath=${encodeURIComponent(Utilities.slash(destinationPath))}`;

    if (overwrite) postUrl = `${postUrl}&overwrite=${overwrite}`;
    if (criteria.matching) postUrl = `${postUrl}&matching=${criteria.matching}`;
    if (criteria.matching)
      postUrl = `${postUrl}&ignoreCase=${criteria.ignoreCase}`;

    return this.apiService.post(postUrl);
  }

  async existsAsync(path: string): Promise<'dir' | 'file' | 'other' | false> {
    const result = await this.apiService.get(
      '/system/fs/exists',
      {
        path: encodeURIComponent(Utilities.slash(path)),
      },
      new Headers({
        Accept: 'text/plain',
        'Content-Type': 'application/json',
      }),
    );

    //console.log('existsAsync', path, result);
    // Convert the literal string "false" to the boolean false
    if (result === 'false') {
      return false;
    }

    // Otherwise, return the original result
    return result;
  }

  async dirAsync(
    path: string,
    criteria: {
      empty?: true;
      mode?: string;
    } = {},
  ): Promise<void> {
    return this.apiService.post(
      `/system/fs/dir?path=${encodeURIComponent(Utilities.slash(path))}`,
      criteria,
    );
  }

  async readAsync(path: string): Promise<string> {
    return this.apiService.get(
      '/system/fs/content',
      { path: encodeURIComponent(path) },
      new Headers({
        Accept: 'text/plain',
        'Content-Type': 'application/json',
      }),
    );
  }

  async writeAsync(path: string, content: string) {
    const encodedPath = encodeURIComponent(Utilities.slash(path));
    return this.apiService.put(
      `/system/fs/content?path=${encodedPath}`,
      content,
      new Headers({
        'Content-Type': 'text/plain',
      }),
    );
  }

  async fileAsync(
    path: string,
    criteria: {
      content?: string | Buffer | Object | Array<any>;
      jsonIndent?: number;
      mode?: number | string;
    } = {},
  ): Promise<void> {
    const encodedPath = encodeURIComponent(Utilities.slash(path));

    return this.apiService.post(
      `/system/fs/file?path=${encodedPath}`,
      criteria,
    );
  }

  inspectAsync(
    path: string,
    criteria: {
      checksum?: 'md5' | 'sha1' | 'sha256' | 'sha512';
      mode?: boolean;
      times?: boolean;
      absolutePath?: boolean;
      symlinks?: 'report' | 'follow';
    } = {},
  ): Promise<InspectResult | undefined> {
    return this.apiService.get(
      `/system/fs/inspect/${encodeURIComponent(Utilities.slash(path))}`,
      {
        checksum: criteria.checksum,
        mode: criteria.mode,
        times: criteria.times,
        absolutePath: criteria.absolutePath,
        symlinks: criteria.symlinks,
      },
    );
  }

  async resolveAbsolutePath(relativePath: string): Promise<string> {
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }
    const response = await this.apiService.get(
      '/system/fs/resolve',
      { path: relativePath },
    );
    return response.absolutePath;
  }
}
