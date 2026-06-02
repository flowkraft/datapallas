import dayjs from 'dayjs';

import * as semver from 'semver';

import Utilities from '../../helpers/utilities';
import UtilitiesNodeJs from './utilities-nodejs';

export class UpdateInfo {
  mode = 'update-now';

  errorMsg: string;

  jobFilePath: string;
  updateSourceDirectoryPath: string;
  updateSourceVersion: string;

  migrateConfigFiles = new Array<[string, string]>();
  migrateScriptFiles = new Array<[string, string]>();

  templatesFolders = new Array<[string, string]>();

  licenseInfo = {
    latestVersion: '',
    key: '',
    customeremail: '',
    status: '',
  };

  productInfo = {
    product: '',
    version: new semver.SemVer('0.0.0'),
    isServerVersion: false,
    isWindows: true,
  };

  updateOptions = {
    copylicensinginformation: true,
    copyoutputfiles: false,
    copylogfiles: false,
    copyquarantinefiles: false,
    copybackupfiles: false,
  };
}

export class Updater {
  TMP_DIR_PATH = UtilitiesNodeJs.osTmpDir();

  UPG_DB_FOLDER_PATH = Utilities.slash(
    UtilitiesNodeJs.pathResolve([`${this.TMP_DIR_PATH}/upg-db`]),
  );

  nowFormatted: string;

  updateDestinationDirectoryPath: string;
  upgdDbTempDirectoryPath: string;
  backupZipFileName: string;

  defaultSettings: any;

  readonly BUILTIN_VARS_LEGACY_STRINGTEMPLATE_SYNTAX_TO_FREEMARKER_SYNTAX_MAP =
    new Map([
      ['$burst_token$', '${burst_token}'],
      ['$input_document_extension$', '${input_document_extension}'],
      ['$input_document_name$', '${input_document_name}'],
      ['$burst_index$', '${burst_index}'],
      ['$now_default_date$', '${now_default_date}'],
      ['$now_short_date$', '${now_short_date}'],
      ['$now_medium_date$', '${now_medium_date}'],
      ['$now_long_date$', '${now_long_date}'],
      ['$now_full_date$', '${now_full_date}'],
      ['$now_quarter$', '${now_quarter}'],
      ['$extracted_file_path$', '${extracted_file_path}'],
      [
        '$extracted_file_paths_after_splitting_2nd_time$',
        '${extracted_file_paths_after_splitting_2nd_time}',
      ],
      ['$now;format="yyyy.MM.dd"$', '${now?string["yyyy.MM.dd"]}'],
      [
        '$now;format="yyyy.MM.dd_HH.mm.ss"$',
        '${now?string["yyyy.MM.dd_HH.mm.ss.SSS"]}',
      ],
      [
        '$now;format="yyyy.MM.dd_HH.mm.ss.SSS"$',
        '${now?string["yyyy.MM.dd_HH.mm.ss.SSS"]}',
      ],
      [
        '_stats-$num_pages$pages-$num_files_extracted$extracted-$num_files_distributed$distributed.log',
        '_stats-${stats_info}.log',
      ],
    ]);

  constructor(protected portableExecutableDirectoryPath: string) {
    this.updateDestinationDirectoryPath = Utilities.slash(
      this.portableExecutableDirectoryPath,
    );

    this.nowFormatted = dayjs().format('YYYY.MM.DD_HH.mm.ss');
    this.upgdDbTempDirectoryPath = Utilities.slash(
      Utilities.uniqueFilename(this.UPG_DB_FOLDER_PATH, this.nowFormatted),
    );
  }

  async fillUpdateInfo(updateInfo: UpdateInfo): Promise<UpdateInfo> {
    updateInfo.migrateConfigFiles = [];
    updateInfo.migrateScriptFiles = [];
    updateInfo.templatesFolders = [];

    // console.log(`${this.updateDestinationDirectoryPath}/config/burst/settings.xml`);
    if (updateInfo.mode == 'migrate-copy') {
      //console.log('Log 1');

      let validDbExeFilePath = await UtilitiesNodeJs.existsAsync(
        `${updateInfo.updateSourceDirectoryPath}/DocumentBurster.exe`,
      );

      if (validDbExeFilePath !== 'file') {
        validDbExeFilePath = await UtilitiesNodeJs.existsAsync(
          `${updateInfo.updateSourceDirectoryPath}/DataPallas.exe`,
        );
      }

      //console.log(
      //  `validDbExeFilePath = ${updateInfo.updateSourceDirectoryPath}/DocumentBurster.exe`,
      //);

      if (validDbExeFilePath !== 'file') {
        updateInfo.errorMsg = `Neither DocumentBurster.exe or DataPallas.exe was not found in the ${updateInfo.updateSourceDirectoryPath} selected location. Please select an existing DocumentBurster/DataPallas installation folder!`;
      } else {
        let xmlSourceSettings = {
          documentburster: {
            settings: {
              version: '',
            },
          },
        };

        xmlSourceSettings = await UtilitiesNodeJs.loadSettingsFileAsync(
          `${updateInfo.updateSourceDirectoryPath}/config/burst/settings.xml`,
        );

        //console.log(
        //  `SourceDirectoryPath.settings.xml = ${updateInfo.updateSourceDirectoryPath}/config/burst/settings.xml`
        //);

        updateInfo.updateSourceVersion =
          xmlSourceSettings.documentburster.settings.version;
      }
    }
    //config folder
    if (!updateInfo.errorMsg) {
      //console.log(
      //  `exists(updateInfo.updateSourceDirectoryPath) = ${JSON.stringify(
      //    sourceDirectoryExists
      //  )}`
      //);

      //console.log(
      //  `Log 2 updateInfo.updateSourceDirectoryPath: ${updateInfo.updateSourceDirectoryPath}`
      //);

      // Finds all '.xml' files inside 'config' folder but excluding those in 'vendor' subtree.
      const configFilePaths = await UtilitiesNodeJs.findAsync(
        `${updateInfo.updateSourceDirectoryPath}/config`,
        {
          matching: [
            '*.xml',
            `!_internal/**/*`,
            `!_defaults/**/*`,
            `!burst/internal/**/*`,
            `!burst/default/**/*`,
            `!samples/**/*`,
            `!batch/**/*`
          ],
        },
      );

      for (const configFilePath of configFilePaths) {
        const configFileName = Utilities.basename(configFilePath);
        const configDirPath = Utilities.slash(
          Utilities.dirname(configFilePath),
        );
        const configDirName = Utilities.basename(
          Utilities.dirname(configFilePath),
        );

        //console.log(
        //  `Log 3 configFileName = ${configFileName}, configDirPath = ${configDirPath}, configDirName = ${configDirName}, configFilePath = ${configFilePath}`,
        //);

        let fullConfigFilePath = `${updateInfo.updateSourceDirectoryPath}/config/burst/${configFileName}`;
        if (configDirPath.includes('config/reports'))
          fullConfigFilePath = Utilities.slash(
            `${updateInfo.updateSourceDirectoryPath}/config/reports/${configDirName}/${configFileName}`,
          );
        else if (configDirPath.includes('config/connections'))
          fullConfigFilePath = Utilities.slash(
            `${updateInfo.updateSourceDirectoryPath}/config/connections/${configFileName}`,
          );

        //console.log(`Log 3.00 configFileName = ${configFileName}`);

        //console.log(`Log 3.0 configFilPath = ${configFilePath}`);
        //console.log(`Log 3 fullConfigFilePath = ${fullConfigFilePath}`);

        updateInfo.migrateConfigFiles.push([
          configFileName,
          fullConfigFilePath,
        ]);
      }

      //console.log(updateInfo.migrateConfigFiles);

      //scripts
      const scriptFilePaths = await UtilitiesNodeJs.findAsync(
        `${updateInfo.updateSourceDirectoryPath}/scripts/burst`,
        {
          matching: ['*.groovy', `!internal/**/*`, `!samples/**/*`],
        },
      );

      for (const scriptFilePath of scriptFilePaths) {
        const fullScriptFilePath = Utilities.slash(
          `${updateInfo.updateSourceDirectoryPath}/${scriptFilePath}`,
        );
        const scriptFileName = Utilities.basename(fullScriptFilePath);

        //console.log('Log 3');

        const scriptContent =
          await UtilitiesNodeJs.readAsync(fullScriptFilePath);
        //console.log(`fullScriptFilePath = ${fullScriptFilePath}`);

        //only copy / migrate groovy scripts which were customized (which are not empty)
        if (scriptContent) {
          updateInfo.migrateScriptFiles.push([
            scriptFileName,
            fullScriptFilePath,
          ]);
        }
      }

      // Looks for all custom html templates directories
      // (all html templates directories besides the 2 sample templates provided with the app)
      const templatesFolderPaths = await UtilitiesNodeJs.findAsync(
        `${updateInfo.updateSourceDirectoryPath}/templates`,
        {
          matching: [
            '!html-basic-example',
            '!html-mobile-responsive-emails',
            `!html-email-templates/basic-example`,
            `!html-email-templates/mobile-responsive-example`,
          ],
          files: false,
          directories: true,
          recursive: false,
        },
      );

      //console.log(
      //  `updateInfo.updateSourceDirectoryPath = ${updateInfo.updateSourceDirectoryPath}`,
      //);

      for (const templateFolderPath of templatesFolderPaths) {
        const templateDirPath = Utilities.slash(
          Utilities.dirname(templateFolderPath),
        );
        const templateDirName = Utilities.basename(templateFolderPath);
        let fullTemplatePath = '';

        if (
          templateDirName != 'html-email-templates' &&
          templateFolderPath.includes('html-email-templates')
        ) {
          fullTemplatePath = Utilities.slash(
            `${updateInfo.updateSourceDirectoryPath}/templates/html-email-templates/${templateDirName}`,
          );
        } else {
          fullTemplatePath = Utilities.slash(
            `${updateInfo.updateSourceDirectoryPath}/templates/${templateDirName}`,
          );
        }

        const templateName = Utilities.basename(fullTemplatePath);

        if (templateName != 'html-email-templates') {
          //console.log(
          //  `templateName = ${templateName}, fullTemplatePath = ${fullTemplatePath}, templateFolderPath = ${templateFolderPath}, templateDirPath= ${templateDirPath}, templateDirName = ${templateDirName}`,
          //);

          updateInfo.templatesFolders.push([templateName, fullTemplatePath]);
        }
      }
    }

    return updateInfo;
  }

  downloadDb = async (sourceUrl: string, targetFile: string) => {
    await UtilitiesNodeJs.download(sourceUrl, targetFile);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    UtilitiesNodeJs.extractAllTo(targetFile, this.upgdDbTempDirectoryPath);
  };

  async doUpdate(updateInfo: UpdateInfo) {
    let topFolderName = 'DocumentBurster';

    // console.log(updateInfo);

    if (updateInfo.mode == 'update-now') {
      //if (updateInfo.productInfo.isServerVersion)
      //  this.updateDestinationDirectoryPath = `${this.upgdDbTempDirectoryPath}/to/${topFolderName}/server`;
      //else
      topFolderName = 'DataPallas';
      this.updateDestinationDirectoryPath = `${this.upgdDbTempDirectoryPath}/to/${topFolderName}`;
    }

    let homeDirectoryPath = this.portableExecutableDirectoryPath;

    //if (updateInfo.productInfo.isServerVersion)
    //  homeDirectoryPath = Utilities.getParentFolderPath(homeDirectoryPath);
    //homeDirectoryPath = path.resolve(homeDirectoryPath, '..');

    //console.log(`homeDirectoryPath = ${homeDirectoryPath}`);

    if (updateInfo.mode == 'update-now') {
      const upgdDbFromFolderPath = `${this.upgdDbTempDirectoryPath}/from/DataPallas`;

      //console.log(`Log 4 this.UPG_DB_FOLDER_PATH = ${this.UPG_DB_FOLDER_PATH}`);

      await UtilitiesNodeJs.dirAsync(this.UPG_DB_FOLDER_PATH, {
        empty: true,
        mode: '700',
      });

      //download latest version
      let latestVersionDownloadUrl =
        'https://s3.amazonaws.com/documentburster/newest/documentburster.zip';
      let latestVersionTargetFilePath = `${this.upgdDbTempDirectoryPath}/to/documentburster.zip`;

      if (updateInfo.productInfo.isServerVersion) {
        latestVersionDownloadUrl =
          'https://s3.amazonaws.com/documentburster/newest/documentburster-server.zip';
        latestVersionTargetFilePath = `${this.upgdDbTempDirectoryPath}/to/documentburster-server.zip`;
      }

      //Ensures that directory on given path exists and meets given criteria
      //console.log('Log 5');

      await UtilitiesNodeJs.dirAsync(`${this.upgdDbTempDirectoryPath}/to`, {
        empty: true,
      });

      await this.downloadDb(
        latestVersionDownloadUrl,
        latestVersionTargetFilePath,
      );

      //it could be DocumentBurster-8.7.1 but it could  be also just
      //DocumentBurster => it should work in both cases
      let topFolderNamePath = '';

      //console.log(
      //  `Log 6 - this.upgdDbTempDirectoryPath = ${this.upgdDbTempDirectoryPath}`
      //);

      topFolderNamePath = await UtilitiesNodeJs.findAsync(
        `${this.upgdDbTempDirectoryPath}/to`,
        {
          matching: ['DataPallas*'],
          files: false,
          directories: true,
          recursive: false,
        },
      )[0];

      if (!topFolderNamePath)
        topFolderNamePath = `${this.upgdDbTempDirectoryPath}/to/DataPallas`;

      //console.log(`Log 61 - topFolderNamePath = ${topFolderNamePath}`);

      topFolderName = Utilities.basename(topFolderNamePath);

      //if (updateInfo.productInfo.isServerVersion)
      //  this.updateDestinationDirectoryPath = `${this.upgdDbTempDirectoryPath}/to/${topFolderName}/server`;
      //else
      this.updateDestinationDirectoryPath = `${this.upgdDbTempDirectoryPath}/to/${topFolderName}`;

      // keep a backup of the existing installation
      //console.log(
      //  `Log 7 - homeDirectoryPath = ${homeDirectoryPath}, upgdDbFromFolderPath = ${upgdDbFromFolderPath}`,
      //);

      await UtilitiesNodeJs.copyAsync(homeDirectoryPath, upgdDbFromFolderPath);
    }

    //console.log(`updateInfo = ${JSON.stringify(updateInfo)}`);
    /*
    if (updateInfo.mode == 'update-now') {
    } else if (updateInfo.mode == 'migrate-copy') {
    }
    */

    // config files
    for (const configFile of updateInfo.migrateConfigFiles) {
      const configFileName = configFile[0];
      const configFilePath = configFile[1];

      // console.log(configFilePath);

      if (configFilePath.includes('config/burst')) {
        //old 'config/burst' xml setting files
        await this.migrateSettingsFile(configFilePath);
      } else if (
        configFilePath.includes('config/reports') &&
        configFileName == 'settings.xml'
      ) {
        //new 'config/reports' xml setting files
        await this.migrateSettingsFile(configFilePath);
      } else {
        //new 'config/connections' xml files
        let newConfigFilePath = `${this.updateDestinationDirectoryPath}/config/connections/${configFileName}`;

        if (
          configFilePath.includes('config/reports') &&
          configFileName == 'reporting.xml'
        ) {
          //new 'config/reports' reporting.xml files
          const directoryName = Utilities.dirname(configFilePath);
          const parentFolderName = Utilities.basename(directoryName);
          newConfigFilePath = `${this.updateDestinationDirectoryPath}/config/reports/${parentFolderName}/reporting.xml`;
        }

        await UtilitiesNodeJs.copyAsync(configFilePath, newConfigFilePath, {
          overwrite: true,
        });
      }
      // console.log(configFilePath);
    }

    //documentburster.properties
    //old location
    //console.log('Log 8');

    let dbPropertiesFileExists = await UtilitiesNodeJs.existsAsync(
      `${updateInfo.updateSourceDirectoryPath}/config/burst/internal/documentburster.properties`,
    );

    if (dbPropertiesFileExists) {
      //console.log('Log 9');

      await UtilitiesNodeJs.copyAsync(
        `${updateInfo.updateSourceDirectoryPath}/config/burst/internal/documentburster.properties`,
        `${this.updateDestinationDirectoryPath}/config/_internal/documentburster.properties`,
        { overwrite: true },
      );
    }

    //new location
    //console.log('Log 10');

    dbPropertiesFileExists = await UtilitiesNodeJs.existsAsync(
      `${updateInfo.updateSourceDirectoryPath}/config/_internal/documentburster.properties`,
    );

    if (dbPropertiesFileExists) {
      //console.log('Log 11');

      await UtilitiesNodeJs.copyAsync(
        `${updateInfo.updateSourceDirectoryPath}/config/_internal/documentburster.properties`,
        `${this.updateDestinationDirectoryPath}/config/_internal/documentburster.properties`,
        { overwrite: true },
      );
    }
    // script files
    for (const scriptFile of updateInfo.migrateScriptFiles) {
      const scriptFilePath = scriptFile[1];

      await this.migrateScriptFile(scriptFilePath);
    }

    // template folders
    for (const templateFolder of updateInfo.templatesFolders) {
      const templateFolderName = templateFolder[0];
      const templateFolderPath = templateFolder[1];

      //console.log('Log 12');

      await UtilitiesNodeJs.copyAsync(
        templateFolderPath,
        `${this.updateDestinationDirectoryPath}/templates/${templateFolderName}`,
        { overwrite: true },
      );
    }

    // if (updateInfo.mode == "migrate-copy") {

    if (updateInfo.updateOptions.copyoutputfiles) {
      //console.log('Log 13');

      await UtilitiesNodeJs.copyAsync(
        `${updateInfo.updateSourceDirectoryPath}/output`,
        `${this.updateDestinationDirectoryPath}/output`,
        { overwrite: true },
      );
    }

    if (updateInfo.updateOptions.copylogfiles) {
      //console.log('Log 14');

      await UtilitiesNodeJs.copyAsync(
        `${updateInfo.updateSourceDirectoryPath}/logs`,
        `${this.updateDestinationDirectoryPath}/logs`,
        { overwrite: true },
      );
    }

    if (updateInfo.updateOptions.copyquarantinefiles) {
      //console.log('Log 15');

      await UtilitiesNodeJs.copyAsync(
        `${updateInfo.updateSourceDirectoryPath}/quarantine`,
        `${this.updateDestinationDirectoryPath}/quarantine`,
        { overwrite: true },
      );
    }

    if (updateInfo.updateOptions.copybackupfiles) {
      //console.log('Log 16');

      await UtilitiesNodeJs.copyAsync(
        `${updateInfo.updateSourceDirectoryPath}/backup`,
        `${this.updateDestinationDirectoryPath}/backup`,
        { overwrite: true },
      );
    }

    if (updateInfo.updateOptions.copylicensinginformation) {
      //Before v7.1 license.xml file was not existing (software licensing was introduced in v7.1)
      //old location
      //console.log('Log 17');

      let licenseFileExists = await UtilitiesNodeJs.existsAsync(
        `${updateInfo.updateSourceDirectoryPath}/config/burst/internal/license.xml`,
      );

      if (licenseFileExists) {
        //console.log('Log 18');

        await UtilitiesNodeJs.copyAsync(
          `${updateInfo.updateSourceDirectoryPath}/config/burst/internal/license.xml`,
          `${this.updateDestinationDirectoryPath}/config/_internal/license.xml`,
          { overwrite: true },
        );
      }
      //new location
      //console.log('Log 19');

      licenseFileExists = await UtilitiesNodeJs.existsAsync(
        `${updateInfo.updateSourceDirectoryPath}/config/_internal/license.xml`,
      );

      if (licenseFileExists) {
        //console.log('Log 20');

        await UtilitiesNodeJs.copyAsync(
          `${updateInfo.updateSourceDirectoryPath}/config/_internal/license.xml`,
          `${this.updateDestinationDirectoryPath}/config/_internal/license.xml`,
          { overwrite: true },
        );
      }
    }

    //}

    if (updateInfo.mode == 'update-now') {
      //console.log('Log 21');

      let allFilesAndFoldersPaths = await UtilitiesNodeJs.findAsync(
        homeDirectoryPath,
        {
          matching: ['**/*'],
          directories: true,
        },
      );

      //remove all but not DocumentBurster.exe
      allFilesAndFoldersPaths = allFilesAndFoldersPaths.filter(
        (fileFolderPath) => !fileFolderPath.includes('DocumentBurster.exe'),
      );

      for (const fileFolderPath of allFilesAndFoldersPaths) {
        //console.log('Log 22');
        await UtilitiesNodeJs.removeAsync(fileFolderPath);
      }

      //console.log('Log 23');

      await UtilitiesNodeJs.copyAsync(
        `${this.upgdDbTempDirectoryPath}/to/${topFolderName}`,
        homeDirectoryPath,
        {
          matching: [
            `!${this.updateDestinationDirectoryPath}/DocumentBurster.exe`,
          ],
          overwrite: true,
        },
      );

      if (updateInfo.productInfo.isServerVersion)
        this.backupZipFileName = `datapallas-server-${updateInfo.productInfo.version}-${this.nowFormatted}.zip`;
      else
        this.backupZipFileName = `datapallas-${updateInfo.productInfo.version}-${this.nowFormatted}.zip`;

      UtilitiesNodeJs.writeZip(
        `${this.upgdDbTempDirectoryPath}/${this.backupZipFileName}`,
        `${this.upgdDbTempDirectoryPath}/from`,
      );

      //console.log('Log 24');
      await UtilitiesNodeJs.moveAsync(
        `${this.upgdDbTempDirectoryPath}/${this.backupZipFileName}`,
        `${updateInfo.updateSourceDirectoryPath}/backup/${this.backupZipFileName}`,
      );
    }
  }

  async logErrorAsync(message: string, level: string = 'error'): Promise<void> {
    return this.logAsync(
      `${this.portableExecutableDirectoryPath}/logs/update.log`,
      `error`,
    );
  }

  async logAsync(message: string, level: string = 'info'): Promise<void> {
    return UtilitiesNodeJs.appendAsync(
      `${this.portableExecutableDirectoryPath}/logs/update.log`,
      `${level.toUpperCase()} - ${message}`,
    );
  }

  async migrateSettingsFile(settingsFilePath: string) {
    //console.log(
    //  `Log 86 - this.updateDestinationDirectoryPath = ${this.updateDestinationDirectoryPath}`
    //);

    //console.log(`Log 99 - settingsFilePath = ${settingsFilePath}`);

    //console.log('Log 25');
    let previousXMLSettingsContent =
      await UtilitiesNodeJs.readAsync(settingsFilePath);

    if (!previousXMLSettingsContent) {
      Error.stackTraceLimit = 100;
      //console.log(`Log 25 - settingsFilePath_src = ${settingsFilePath}`);
    }

    const previousConfigFileName = Utilities.basename(settingsFilePath);

    let newMigratedSettingsFilePath = `${this.updateDestinationDirectoryPath}/config/burst/${previousConfigFileName}`;

    if (settingsFilePath.includes('config/reports')) {
      const directoryName = Utilities.dirname(settingsFilePath);
      const parentFolderName = Utilities.basename(directoryName);
      newMigratedSettingsFilePath = `${this.updateDestinationDirectoryPath}/config/reports/${parentFolderName}/${previousConfigFileName}`;
    }

    //STEP0 - some configuration settings node names were renamed (no structural changes)

    //this is a quick way to "re-map" such old tag names to the new tag names
    if (previousXMLSettingsContent.includes('defaultmessage')) {
      previousXMLSettingsContent = previousXMLSettingsContent
        .split('<defaultmessage>')
        .join('<emailsettings>');

      previousXMLSettingsContent = previousXMLSettingsContent
        .split('</defaultmessage>')
        .join('</emailsettings>');
    }

    if (previousXMLSettingsContent.includes('defaultmessage'))
      await this.logErrorAsync(
        `migrateSettingsFile - ${newMigratedSettingsFilePath} 'defaultmessage' not expected!`,
      );

    if (!previousXMLSettingsContent.includes('emailsettings'))
      await this.logErrorAsync(
        `migrateSettingsFile - ${newMigratedSettingsFilePath} 'emailsettings' not found!`,
      );

    previousXMLSettingsContent = previousXMLSettingsContent
      .split('<defaultftp>')
      .join('<uploadsettings>');
    previousXMLSettingsContent = previousXMLSettingsContent
      .split('</defaultftp>')
      .join('</uploadsettings>');

    if (previousXMLSettingsContent.includes('defaultftp'))
      await this.logErrorAsync(
        `migrateSettingsFile - ${newMigratedSettingsFilePath} 'defaultftp' not expected!`,
      );

    if (!previousXMLSettingsContent.includes('uploadsettings'))
      await this.logErrorAsync(
        `migrateSettingsFile - ${newMigratedSettingsFilePath} 'uploadsettings' not found!`,
      );

    previousXMLSettingsContent = previousXMLSettingsContent
      .split('<url>')
      .join('<ftpcommand>');
    previousXMLSettingsContent = previousXMLSettingsContent
      .split('</url>')
      .join('</ftpcommand>');

    if (previousXMLSettingsContent.includes('<url'))
      await this.logErrorAsync(
        `migrateSettingsFile - ${newMigratedSettingsFilePath} '<url' not expected!`,
      );

    if (!previousXMLSettingsContent.includes('ftpcommand'))
      await this.logErrorAsync(
        `migrateSettingsFile - ${newMigratedSettingsFilePath} 'ftpcommand' not found!`,
      );

    const previousSettings = await Utilities.parseStringPromise(
      previousXMLSettingsContent,
      {
        trim: true,
        explicitArray: false,
      },
    );

    //console.log(`defaultSettings = ${this.defaultSettings}`);

    if (!this.defaultSettings) {
      //console.log('Log 26');
      const defaultsXMLSettingsContent = await UtilitiesNodeJs.readAsync(
        `${this.updateDestinationDirectoryPath}/config/_defaults/settings.xml`,
      );

      //console.log(`defaultsXMLSettingsContent = ${defaultsXMLSettingsContent}`);
      //console.log(
      //  `this.updateDestinationDirectoryPath = ${this.updateDestinationDirectoryPath}`
      //);

      this.defaultSettings = await Utilities.parseStringPromise(
        defaultsXMLSettingsContent,
        {
          trim: true,
          explicitArray: false,
        },
      );
    }

    const migratedSettings = JSON.parse(JSON.stringify(this.defaultSettings));

    const numberOfUserVariables =
      previousSettings.documentburster.settings.numberofuservariables;

    //STEP1 - automatically migrate the vast majority of the configuration settings for which the structure
    //did not change between the software versions
    Utilities.traverseJSONObjTree(migratedSettings, (key, value, scope) => {
      //version should not be copied from the previousSettings
      if (typeof value !== 'object' && key != 'version') {
        const currentConfigurationItemKeys = scope.concat(key);

        const configurationStructureDidNotChange =
          this.checkObjectHasAllAttributes(
            previousSettings,
            currentConfigurationItemKeys,
          );

        let migratedValue = String(value);

        if (configurationStructureDidNotChange) {
          const prevRaw = Utilities.getDeeplyNestedLastProp(
            previousSettings,
            currentConfigurationItemKeys,
          );

          // If previous value is blank (old config) but default 'value' is non-empty,
          // keep the default. Exception: emailserver userid/userpassword should
          // always be copied from the previous config if present (even if blank),
          // because empty can be an intentional value for some setups.
          // detect any ancestor named 'emailserver' and treat certain subkeys
          // as intentional values that must be copied from previous settings
          // even if they're blank (covers both settings.emailserver and
          // qualityassurance.emailserver).
          const emailServerIndex = currentConfigurationItemKeys.indexOf('emailserver');
          const alwaysCopyEmailServerKeys = new Set([
            'userid',
            'userpassword',
            'host',
            'port',
            'fromaddress',
          ]);
          let isEmailServerCredential = false;
          if (
            emailServerIndex >= 0 &&
            emailServerIndex < currentConfigurationItemKeys.length - 1
          ) {
            const subKey = currentConfigurationItemKeys[emailServerIndex + 1];
            isEmailServerCredential = alwaysCopyEmailServerKeys.has(subKey);
          }

          if (
            typeof prevRaw === 'string' &&
            prevRaw.trim() === '' &&
            String(value).trim() !== '' &&
            !isEmailServerCredential
          ) {
            migratedValue = String(value);
          } else {
            migratedValue = prevRaw;
            // 'My Reports' was the old default — upgrade to new default
            if (key === 'template' && migratedValue === 'My Reports') {
              migratedValue = String(value);
            }
            if (migratedValue) {
              if (!['text', 'html', 'subject'].includes(key)) {
                // remove the line breaks
                migratedValue = migratedValue.replace(/(\r\n|\n|\r)/gm, '');
                // remove the spaces inside $...$ for legacy templates
                migratedValue = migratedValue.replace(/\s+(?=[^$\$]*\$)/g, '');
              }

              for (const [keyST, valueFM] of Array.from(
                this.BUILTIN_VARS_LEGACY_STRINGTEMPLATE_SYNTAX_TO_FREEMARKER_SYNTAX_MAP,
              )) {
                migratedValue = migratedValue.split(keyST).join(valueFM);
              }

              for (let i = 0; i < numberOfUserVariables; i++) {
                migratedValue = migratedValue.split(`$var${i}$`).join(`$\{var${i}\}`);
              }
            }
          }
        } else {
          if (key == 'template' && previousConfigFileName != 'settings.xml')
            migratedValue = previousConfigFileName;
        }

        this.setDeeplyNestedLastProp(
          migratedSettings,
          migratedValue,
          currentConfigurationItemKeys,
        );
      }
    });

    //STEP2 - new default values for configuration settings for which the structure did not change between
    if (
      previousSettings.documentburster.settings.numberofuservariables == '10'
    ) {
      migratedSettings.documentburster.settings.numberofuservariables = '20';
    }

    //STEP3 - manually migrate the configuration settings for which the structure did change between
    //versions

    // do this only if the structure is old like this <sendfiles>true</sendfiles>

    // otherwise, if the structure is new like <sendfiles><email>true</email></sendfiles> the below
    // line of code should not execute
    if (
      typeof previousSettings.documentburster.settings.sendfiles.email ===
      'undefined'
    )
      migratedSettings.documentburster.settings.sendfiles.email =
        previousSettings.documentburster.settings.sendfiles;

    if (
      migratedSettings.documentburster.settings.uploadsettings.ftpcommand ==
      'ftp://'
    )
      migratedSettings.documentburster.settings.uploadsettings.ftpcommand = '';

    //STEP5 - manually handle few special situations
    if (
      migratedSettings.documentburster.settings.burstfilename.includes(
        'input_document_extension',
      )
    )
      migratedSettings.documentburster.settings.burstfilename =
        migratedSettings.documentburster.settings.burstfilename.replace(
          'input_document_extension',
          'output_type_extension',
        );

    migratedSettings.documentburster.settings.qualityassurance.emailserver.port =
      this.defaultSettings.documentburster.settings.qualityassurance.emailserver.port;

    migratedSettings.documentburster.settings.sortbyposition =
      this.defaultSettings.documentburster.settings.sortbyposition;

    migratedSettings.documentburster.settings.emailserver.useconn = false;
    migratedSettings.documentburster.settings.emailserver.conncode = '';

    // console.log(`${this.updateDestinationDirectoryPath}/config/burst/${previousConfigFileName}`);

    //finally, once everything is migrated, save the configuration
    return UtilitiesNodeJs.saveSettingsFileAsync(
      migratedSettings,
      newMigratedSettingsFilePath,
    );
  }

  async migrateScriptFile(
    scriptFilePath: string,
    legacyVersion?: string,
  ): Promise<string> {
    const scriptFileName = Utilities.basename(scriptFilePath);

    let newScriptFilePath = `${this.updateDestinationDirectoryPath}/scripts/burst/${scriptFileName}`;

    if (legacyVersion)
      newScriptFilePath = `${this.updateDestinationDirectoryPath}/scripts/burst/${legacyVersion}/${scriptFileName}`;

    //ASYNC ISSUE - if I make this async it fails
    //console.log('Log 27');
    await UtilitiesNodeJs.copyAsync(scriptFilePath, newScriptFilePath, {
      overwrite: true,
    });

    /*
    let exists = await fsExtra.pathExists(scriptFilePath);
 
    if (exists)
      // console.log(scriptFilePath);
    else
      throw new Error(`!!! scriptFilePath File Path Not Found -  ${scriptFilePath}`);
 
    exists = await fsExtra.pathExists(newScriptFilePath);
 
    if (exists)
      // console.log(newScriptFilePath);
    else
      throw new Error(`!!! newScriptFilePath File Path Not Found -  ${newScriptFilePath}`);
    
      */

    let replaceValues: { from: string; to: string }[] = [];

    replaceValues.push({
      from: 'import com.smartwish',
      to: 'import com.sourcekraft',
    });

    replaceValues.push({ from: 'extractFilePath', to: 'extractedFilePath' });

    replaceValues.push({
      from: 'org.apache.commons.vfs.tasks',
      to: 'org.apache.commons.vfs2.tasks',
    });

    replaceValues.push({
      from: ';lib/burst/commons-logging-1.1.1.jar',
      to: ';lib/burst/jcl-over-slf4j-1.7.30.jar;lib/burst/slf4j-api-1.7.30.jar',
    });

    replaceValues.push({
      from: 'jcl-over-slf4j-1.7.5.jar',
      to: 'jcl-over-slf4j-1.7.30.jar',
    });

    replaceValues.push({
      from: 'slf4j-api-1.7.5.jar',
      to: 'slf4j-api-1.7.30.jar',
    });

    replaceValues.push({
      from: 'lib/burst/pdfbox-1.0.0.jar',
      to: 'lib/burst/pdfbox-2.0.20.jar;lib/burst/pdfbox-tools-2.0.20.jar',
    });

    replaceValues.push({
      from: 'lib/burst/pdfbox-1.8.2.jar',
      to: 'lib/burst/pdfbox-2.0.20.jar;lib/burst/pdfbox-tools-2.0.20.jar',
    });

    replaceValues.push({
      from: 'jempbox-1.0.0.jar',
      to: 'xmpbox-2.0.20.jar',
    });

    replaceValues.push({
      from: 'jempbox-1.8.2.jar',
      to: 'xmpbox-2.0.20.jar',
    });

    replaceValues.push({
      from: 'fontbox-1.0.0.jar',
      to: 'fontbox-2.0.20.jar',
    });

    replaceValues.push({
      from: 'fontbox-1.8.2.jar',
      to: 'fontbox-2.0.20.jar',
    });

    replaceValues.push({
      from: 'bcmail-jdk15-1.44.jar',
      to: 'bcmail-jdk15-1.46.jar',
    });

    replaceValues.push({
      from: 'bcprov-jdk15-1.44.jar',
      to: 'bcprov-jdk15-1.46.jar',
    });

    //console.log('Log 28');
    //console.log(`newScriptFilePath = ${newScriptFilePath}`);

    let scriptContent = await UtilitiesNodeJs.readAsync(newScriptFilePath);
    //console.log(`scriptContent before = ${scriptContent}`);

    for (const replaceValue of replaceValues) {
      if (scriptContent.includes(replaceValue.from)) {
        scriptContent = scriptContent.replace(
          new RegExp(replaceValue.from, 'g'),
          replaceValue.to,
        );
      }
    }

    scriptContent = scriptContent.replace(
      new RegExp(
        'samples\\/stamp\\.pdf \\\\"\\$inputFile\\\\" \\\\"\\$inputFile\\\\"',
        'g',
      ),
      '\\"$inputFile\\" samples/Stamp.pdf \\"$inputFile\\"',
    );

    scriptContent = scriptContent.replace(
      new RegExp(
        'samples\\/Stamp\\.pdf \\\\"\\$inputFile\\\\" \\\\"\\$inputFile\\\\"',
        'g',
      ),
      '\\"$inputFile\\" samples/Stamp.pdf \\"$inputFile\\"',
    );

    //correct groovy vars
    scriptContent = scriptContent.replace(
      new RegExp('.Overlay \\$overlayOptions', 'g'),
      '.OverlayPDF ${overlayOptions}',
    );

    if (
      scriptContent.includes('.Overlay') &&
      !scriptContent.includes('.OverlayPDF ${overlayOptions}')
    )
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '.OverlayPDF \${overlayOptions}' not found!`,
      );

    if (
      scriptContent.includes('org.apache.pdfbox.') &&
      !scriptContent.includes('org.apache.pdfbox.tools.')
    ) {
      scriptContent = scriptContent.replace(
        new RegExp('-cp \\$pdfBoxClassPath org.apache.pdfbox.', 'g'),
        '-cp ${pdfBoxClassPath} org.apache.pdfbox.tools.',
      );

      if (
        scriptContent.includes('pdfBoxClassPath') &&
        scriptContent.includes('org.apache.pdfbox.') &&
        !scriptContent.includes('org.apache.pdfbox.tools')
      )
        await this.logErrorAsync(
          `migrateScriptFile - ${newScriptFilePath} 'org.apache.pdfbox.tools' not found!`,
        );
    }
    scriptContent = scriptContent.replace(
      new RegExp('\\$hostName', 'g'),
      '${hostName}',
    );

    if (scriptContent.includes('$hostName'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$hostName' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$tempFilePath', 'g'),
      '${tempFilePath}',
    );

    if (scriptContent.includes('$tempFilePath'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$tempFilePath' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$curlOptions', 'g'),
      '${curlOptions}',
    );

    if (scriptContent.includes('$curlOptions'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$curlOptions' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$userName', 'g'),
      '${userName}',
    );

    if (scriptContent.includes('$userName'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$userName' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$password', 'g'),
      '${password}',
    );

    if (scriptContent.includes('$password'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$password' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$absolutePath', 'g'),
      '${absolutePath}',
    );

    if (scriptContent.includes('$absolutePath'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$absolutePath' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$destDir', 'g'),
      '${destDir}',
    );

    if (scriptContent.includes('$destDir'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$destDir' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$sharedLocationPath', 'g'),
      '${sharedLocationPath}',
    );

    if (scriptContent.includes('$sharedLocationPath'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$sharedLocationPath' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$uploadFilePath', 'g'),
      '${uploadFilePath}',
    );

    if (scriptContent.includes('$uploadFilePath'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$uploadFilePath' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$execOptions', 'g'),
      '${execOptions}',
    );

    if (scriptContent.includes('$execOptions'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$execOptions' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$inputFile', 'g'),
      '${inputFile}',
    );

    if (scriptContent.includes('$inputFile'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$inputFile' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$pdfBoxClassPath', 'g'),
      '${pdfBoxClassPath}',
    );

    if (scriptContent.includes('$pdfBoxClassPath'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$pdfBoxClassPath' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$encryptOptions', 'g'),
      '${encryptOptions}',
    );

    if (scriptContent.includes('$encryptOptions'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$encryptOptions' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$extractedFilePath', 'g'),
      '${extractedFilePath}',
    );

    if (scriptContent.includes('$extractedFilePath'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$extractedFilePath' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$stampedFilePath', 'g'),
      '${stampedFilePath}',
    );

    if (scriptContent.includes('$stampedFilePath'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$stampedFilePath' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$overlayOptions', 'g'),
      '${overlayOptions}',
    );

    if (scriptContent.includes('$overlayOptions'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$overlayOptions' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$printOptions', 'g'),
      '${printOptions}',
    );

    if (scriptContent.includes('$printOptions'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$printOptions' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$numberedFilePath', 'g'),
      '${numberedFilePath}',
    );

    if (scriptContent.includes('$numberedFilePath'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$numberedFilePath' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$host', 'g'),
      '${host}',
    );

    if (scriptContent.includes('$host'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$host' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$port', 'g'),
      '${port}',
    );

    if (scriptContent.includes('$port'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$port' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$user', 'g'),
      '${user}',
    );

    if (scriptContent.includes('$user'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$user' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$subject', 'g'),
      '${subject}',
    );

    if (scriptContent.includes('$subject'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$subject' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$from', 'g'),
      '${from}',
    );

    if (scriptContent.includes('$from'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$from' not expected!`,
      );

    scriptContent = scriptContent.replace(new RegExp('\\$to', 'g'), '${to}');

    if (scriptContent.includes('$to'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$to' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$message', 'g'),
      '${message}',
    );

    if (scriptContent.includes('$message'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$message' not expected!`,
      );

    scriptContent = scriptContent.replace(new RegExp('\\$ssl', 'g'), '${ssl}');

    if (scriptContent.includes('$ssl'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$ssl' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$enableStartTLS', 'g'),
      '${enableStartTLS}',
    );

    if (scriptContent.includes('$enableStartTLS'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$enableStartTLS' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$mergedFileName', 'g'),
      '${mergedFileName}',
    );

    if (scriptContent.includes('$mergedFileName'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$mergedFileName' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\${employeeRow.employee_id}', 'g'),
      '$employeeRow.employee_id',
    );

    if (scriptContent.includes('${employeeRow.employee_id}'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '\${employeeRow.employee_id}' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('String\\.valueOf\\("\\${token}"\\)', 'g'),
      `"\${token}"`,
    );

    scriptContent = scriptContent.replace(
      new RegExp('String\\.valueOf\\("\\${emailAddress}"\\)', 'g'),
      `"\${emailAddress}"`,
    );

    scriptContent = scriptContent.replace(
      new RegExp('String\\.valueOf\\("\\${firstName}"\\)', 'g'),
      `"\${firstName}"`,
    );

    scriptContent = scriptContent.replace(
      new RegExp('String\\.valueOf\\("\\${lastName}"\\)', 'g'),
      `"\${lastName}"`,
    );

    if (scriptContent.includes('String.valueOf'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'String.valueOf' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$var0\\$', 'g'),
      '${var0}',
    );

    if (scriptContent.includes('$var0$'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$var0$' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$var1\\$', 'g'),
      '${var1}',
    );

    if (scriptContent.includes('$var1$'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$var1$' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$var2\\$', 'g'),
      '${var2}',
    );

    if (scriptContent.includes('$var2$'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$var2$' not expected!`,
      );

    scriptContent = scriptContent.replace(
      new RegExp('\\$var3\\$', 'g'),
      '${var3}',
    );

    if (scriptContent.includes('$var3$'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} '$var3$' not expected!`,
      );
    //end correct groovy vars

    //console.log(`scriptContent after = ${scriptContent}`);

    if (scriptContent.includes('import com.smartwish'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'import com.smartwish' not expected!`,
      );

    if (scriptContent.includes('extractFilePath'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'extractFilePath' not expected!`,
      );

    if (
      scriptContent.includes(
        'samples/Stamp.pdf \\"$inputFile\\" \\"$inputFile\\"',
      )
    )
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'samples/Stamp.pdf \\"$inputFile\\" \\"$inputFile\\"' not expected!`,
      );

    if (
      scriptContent.includes(
        'samples/stamp.pdf \\"$inputFile\\" \\"$inputFile\\"',
      )
    )
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'samples/stamp.pdf \\"$inputFile\\" \\"$inputFile\\"' not expected!`,
      );

    if (scriptContent.includes('org.apache.commons.vfs.tasks'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'org.apache.commons.vfs.tasks' not expected!`,
      );

    if (scriptContent.includes('commons-logging'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'commons-logging' not expected!`,
      );

    if (scriptContent.includes('jcl-over-slf4j-1.7.5.jar'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'jcl-over-slf4j-1.7.5.jar' not expected!`,
      );

    if (scriptContent.includes('slf4j-api-1.7.5.jar'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'slf4j-api-1.7.5.jar' not expected!`,
      );

    if (scriptContent.includes('pdfbox-1.0.0.jar'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'pdfbox-1.0.0.jar' not expected!`,
      );

    if (scriptContent.includes('pdfbox-1.8.2.jar'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'pdfbox-1.8.2.jar' not expected!`,
      );

    if (scriptContent.includes('jempbox-1.0.0.jar'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'jempbox-1.0.0.jar' not expected!`,
      );

    if (scriptContent.includes('jempbox-1.8.2.jar'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'jempbox-1.8.2.jar' not expected!`,
      );

    if (scriptContent.includes('fontbox-1.0.0.jar'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'fontbox-1.0.0.jar' not expected!`,
      );

    if (scriptContent.includes('fontbox-1.8.2.jar'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'fontbox-1.8.2.jar' not expected!`,
      );

    if (scriptContent.includes('bcmail-jdk15-1.44.jar'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'bcmail-jdk15-1.44.jar' not expected!`,
      );

    if (scriptContent.includes('bcprov-jdk15-1.44.jar'))
      await this.logErrorAsync(
        `migrateScriptFile - ${newScriptFilePath} 'bcprov-jdk15-1.44.jar' not expected!`,
      );

    //console.log('Log 29');
    await UtilitiesNodeJs.writeAsync(newScriptFilePath, scriptContent);

    return Promise.resolve(newScriptFilePath);
  }

  async removeTempUpgradeFolder() {
    //console.log('Log 30');
    return UtilitiesNodeJs.removeAsync(this.upgdDbTempDirectoryPath);
  }

  checkObjectHasAllAttributes(obj: any, attrs: Array<string>): boolean {
    let tempObj = obj;

    let hasAllAttrs = true;

    for (const attr of attrs) {
      if (hasAllAttrs) {
        tempObj = tempObj[attr];
        hasAllAttrs = typeof tempObj !== 'undefined';
      }
    }

    return hasAllAttrs;
  }

  setDeeplyNestedLastProp(obj: any, value: string, props: Array<string>) {
    const [head, ...rest] = props;

    !rest.length
      ? (obj[head] = value)
      : this.setDeeplyNestedLastProp(obj[head], value, rest);
  }
}
