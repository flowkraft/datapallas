import * as xml2js from 'xml2js';
import Utilities from '../../helpers/utilities';

// Native-module access via a property-access call so esbuild's static analyser
// never sees a bare require('fs') / require('adm-zip') … and does not attempt
// to bundle Node built-ins. In Electron renderer window.require is always
// present; in a plain Node.js context (e.g. Jasmine upgrade tests) fall back
// to the module-local require — _req('fs') is still a property-like call that
// esbuild ignores. The web build never reaches this file (fileReplacements in
// angular.json severs the import chain before bundling).
const _req: (id: string) => any =
  typeof window !== 'undefined' ? (window as any).require : require;

const fs      = _req('fs');
const AdmZip  = _req('adm-zip');
const path    = _req('path');
const os      = _req('os');
const jetpack = _req('fs-jetpack');

export default class UtilitiesNodeJs {
  static pathResolve(pathSegments: string[]): string {
    return path.resolve(...pathSegments);
  }

  static osTmpDir(): string {
    return os.tmpdir();
  }

  static async download(
    sourceUrl: string,
    targetFile: string,
    progressCallback?: (bytesDone: number, percent: number) => void,
    length?: number,
  ) {
    const request = new Request(sourceUrl, {
      headers: new Headers({ 'Content-Type': 'application/octet-stream' }),
    });

    const response = await fetch(request);
    if (!response.ok) {
      throw Error(
        `Unable to download, server returned ${response.status} ${response.statusText}`,
      );
    }

    const body = response.body;
    if (body == null) {
      throw Error('No response body');
    }

    const finalLength =
      length || parseInt(response.headers.get('Content-Length') || '0', 10);
    const reader = body.getReader();
    const writer = fs.createWriteStream(targetFile);

    await this.streamWithProgress(
      finalLength,
      reader,
      writer,
      progressCallback,
    );
    writer.end();
  }

  static async streamWithProgress(
    length: number,
    reader: ReadableStreamDefaultReader<Uint8Array>,
    writer: NodeJS.WriteStream,
    progressCallback?: (bytesDone: number, percent: number) => void,
  ) {
    let bytesDone = 0;

    while (true) {
      //const result = await reader.read(new Uint8Array(length));
      const result = await reader.read();
      if (result.done) {
        if (progressCallback != null) {
          progressCallback(length, 100);
        }
        return;
      }

      const decoder = new TextDecoder();
      const chunk = result.value;
      const str = decoder.decode(chunk);
      if (chunk == null) {
        throw Error('Empty chunk received during download');
      } else {
        writer.write(str);
        if (progressCallback != null) {
          bytesDone += chunk.byteLength;
          const percent =
            length === 0 ? null : Math.floor((bytesDone / length) * 100);
          progressCallback(bytesDone, percent);
        }
      }
    }
  }

  static extractAllTo(targetFile: string, targetPath: string) {
    new AdmZip(targetFile).extractAllTo(
      Utilities.slash(Utilities.dirname(targetFile)),
    );
  }

  static writeZip(targetFile: string, targetPath: string) {
    const zip = new AdmZip();
    zip.addLocalFolder(targetPath);

    zip.writeZip(targetFile);
  }

  //jetpack stuff
  static async dirAsync(
    pathFolder: string,
    criteria?: {
      empty?: boolean;
      mode?: number | string;
    },
  ) {
    return jetpack.dirAsync(pathFolder, criteria);
  }

  static async copyAsync(
    from: string,
    to: string,
    options?: {
      overwrite?:
        | boolean
        | ((source: any, destination: any) => boolean | Promise<boolean>);
      matching?: string[];
      ignoreCase?: boolean;
    },
  ) {
    return await jetpack.copyAsync(from, to, options);
  }

  static async moveAsync(
    from: string,
    to: string,
    options?: {
      overwrite?: false;
    },
  ) {
    return await jetpack.moveAsync(from, to, options);
  }

  static async existsAsync(filePath: string) {
    return await jetpack.existsAsync(filePath);
  }

  static async removeAsync(filePath: string) {
    return await jetpack.removeAsync(filePath);
  }

  static async writeAsync(filePath: string, content: string) {
    return await jetpack.writeAsync(filePath, content);
  }

  static async appendAsync(filePath: string, content: string) {
    return await jetpack.appendAsync(filePath, content);
  }

  static async readAsync(filePath: string) {
    return await jetpack.readAsync(filePath);
  }

  static async findAsync(
    path: string = '.',
    options: {
      matching?: string[];
      filter?: (inspectObj: any) => boolean;
      files?: boolean;
      directories?: boolean;
      recursive?: boolean;
      ignoreCase?: boolean;
    } = {
      matching: ['*'],
      files: true,
      directories: false,
      recursive: true,
      ignoreCase: false,
    },
  ) {
    return await jetpack.findAsync(path, options);
  }

  //end jetpack stuff

  //settings stuff
  static async saveSettingsFileAsync(settings: {}, filePath: string) {
    //console.log(`filePath: ${filePath}`);
    //console.log(`settings: ${JSON.stringify(settings)}`);

    try {
      await UtilitiesNodeJs.removeAsync(filePath);
      //await this.fs.unlink(filePath);
    } catch (error) {
    } finally {
      const builder = new xml2js.Builder();
      return UtilitiesNodeJs.writeAsync(
        filePath,
        builder.buildObject(settings),
      );

      //return this.fs.writeFile(filePath, '123');
    }
  }

  // loadSettingsFileAsync — used by updater.ts during auto-update
  // (server may not be running during update, so local file access is needed)
  static async loadSettingsFileAsync(filePath: string): Promise<any> {
    //console.trace();

    const content = await UtilitiesNodeJs.readAsync(filePath);

    const parsedString = await Utilities.parseStringPromise(content, {
      trim: true,
      explicitArray: false,
      valueProcessors: [xml2js.processors.parseBooleans],
    });

    //XML files from older versions (i.e. v5) do not contain attachments
    if (parsedString.documentburster.settings.attachments) {
      if (
        parsedString.documentburster.settings.attachments.items.attachmentItems
      ) {
        if (
          !Array.isArray(
            parsedString.documentburster.settings.attachments.items
              .attachmentItems,
          )
        ) {
          parsedString.documentburster.settings.attachments.items.attachmentItems =
            [
              parsedString.documentburster.settings.attachments.itemsItems
                .attachment,
            ];
        }
      } else {
        parsedString.documentburster.settings.attachments.items = {};
        parsedString.documentburster.settings.attachments.items.attachment = [];
      }
    }

    return parsedString;
  }

  //end settings stuff (loadReportingFileAsync, loadPreferencesFileAsync, loadFileContentAsync removed — now handled by server API)
}
