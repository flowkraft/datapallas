import { FluentTester } from '../fluent-tester';
import * as PATHS from '../../utils/paths';
import _ from 'lodash';
import { Constants } from '../../utils/constants';

export class ConfTemplatesTestHelper {
  static createNewTemplate = (
    ft: FluentTester,
    templateName: string,
    mailMergeCapability?: string,
  ): FluentTester => {
    const folderName = _.kebabCase(templateName);

    ft = ft
      .gotoConfigurationReports()
      .click('#btnNew')
      .waitOnElementToBecomeVisible('#templateHowTo')
      .waitOnInputValueToContainText('#templateHowTo', 'folder-name');

    if (mailMergeCapability) {
      ft = ft
        .click('#btnCapReportGenerationMailMerge')
        .waitOnElementToBecomeInvisible('#templateHowTo')
        .waitOnElementToBecomeInvisible('#templateHowToSnipped');
    } else {
      ft = ft
        .click('#btnCapReportGenerationMailMerge')
        .waitOnElementToBecomeInvisible('#templateHowTo')
        .waitOnElementToBecomeInvisible('#templateHowToSnipped')
        .click('#btnCapReportGenerationMailMerge')
        .waitOnElementToBecomeVisible('#templateHowTo')
        .waitOnElementToBecomeVisible('#templateHowToSnipped');
    }

    ft = ft.click('#templateName').typeText('Settings');
    if (!mailMergeCapability) {
      ft = ft.waitOnInputValueToContainText(
        '#templateHowTo',
        `settings/${PATHS.SETTINGS_CONFIG_FILE}`,
      );
    }
    ft = ft.typeText('');
    if (!mailMergeCapability) {
      ft = ft.waitOnInputValueToContainText('#templateHowTo', 'folder-name');
    }
    ft = ft.typeText(templateName);
    if (!mailMergeCapability) {
      ft = ft.waitOnInputValueToContainText(
        '#templateHowTo',
        `/reports/${folderName}/${PATHS.SETTINGS_CONFIG_FILE}`,
      );
    }
    return ft
      .clickYesDoThis()
      .waitOnElementToBecomeVisible('#burstFileName');
  };

  static assertBCCSubjectValues = (
    ft: FluentTester,
    folderName: string,
    value: string,
  ): FluentTester => {
    let bccValue = '';
    let subjectValue = '';

    if (value) {
      bccValue = `BCC ${value}`;
      subjectValue = `Subject ${value}`;
    }

    return ft
      .gotoConfigurationReports()
      .clickAndSelectTableRow(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToBecomeVisible(`#btnLoadInvite_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .click(`#btnLoadInvite_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToBecomeVisible(`#btnLoadConfirmYes_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .click(`#btnLoadConfirmYes_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .click('#leftMenuEmailSettings') // email SMTP settings
      .click('#tab-btn-emailMessageTab') // email message settings
      .inputShouldHaveValue('#emailBccAddress', bccValue)
      .inputShouldHaveValue('#emailSubject', subjectValue);
  };

  static modifyEmailBCCAndSubjectAndAssertCorrectValues = (
    ft: FluentTester,
    folderName: string,
    templateName: string,
  ): FluentTester => {
    ft = ft
      .gotoConfigurationReports()
      // STEP0 - CHANGE VALUES
      .clickAndSelectTableRow(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToBecomeVisible(`#btnLoadInvite_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .click(`#btnLoadInvite_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToBecomeVisible(`#btnLoadConfirmYes_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .click(`#btnLoadConfirmYes_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .click('#leftMenuEmailSettings') // email SMTP settings
      .click('#tab-btn-emailMessageTab') // email message settings
      .click('#emailBccAddress')
      .typeText(`BCC ${templateName}`)
      //.waitOnElementWithTextToBecomeVisible('Saved')
      //.waitOnElementWithTextToBecomeInvisible('Saved')
      .click('#emailSubject')
      .typeText(`Subject ${templateName}`);
    //.waitOnElemewaitOnElementWithTextToBecomeVisible('Saved')
    //.waitOnElementWithTextToBecomeInvisible('Saved');

    return ConfTemplatesTestHelper.assertBCCSubjectValues(
      ft,
      folderName,
      templateName,
    );
  };

  static modifyConfigurationValuesAssertSavedValues = (
    ft: FluentTester,
    folderName: string,
  ): FluentTester => {
    return (
      ft
        .gotoConfigurationReports()
        // STEP0 - CHANGE VALUES via reports list Load flow
        .clickAndSelectTableRow(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .waitOnElementToBecomeVisible(`#btnLoadInvite_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .click(`#btnLoadInvite_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .waitOnElementToBecomeVisible(`#btnLoadConfirmYes_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .click(`#btnLoadConfirmYes_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .click('#burstFileName')
        .typeText('00')
        .click('#outputFolder')
        .typeText('01')
        .click('#quarantineFolder')
        .typeText('02')
        .click('#leftMenuEnableDisableDistribution')
        .click('#btnSendDocumentsEmail')
        .click('#btnDeleteDocuments')
        .click('#btnQuarantineDocuments')
        // values are supposed to be saved at this moment ==> go away and reload
        .gotoConfigurationReports()
        // STEP1 - load and assert the saved values
        .clickAndSelectTableRow(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .waitOnElementToBecomeVisible(`#btnLoadInvite_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .click(`#btnLoadInvite_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .waitOnElementToBecomeVisible(`#btnLoadConfirmYes_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .click(`#btnLoadConfirmYes_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .inputShouldHaveValue('#burstFileName', '00')
        .inputShouldHaveValue('#outputFolder', '01')
        .inputShouldHaveValue('#quarantineFolder', '02')
        .click('#leftMenuEnableDisableDistribution')
        .elementCheckBoxShouldBeSelected('#btnSendDocumentsEmail')
        .elementCheckBoxShouldBeSelected('#btnDeleteDocuments')
        .elementCheckBoxShouldNotBeSelected('#btnQuarantineDocuments')
    );
  };

  static duplicateTemplate = (
    ft: FluentTester,
    folderName: string,
    newTemplateName: string,
    mailMergeCapability?: string,
  ): FluentTester => {
    const newFolderName = _.kebabCase(newTemplateName);
    ft = ft
      .gotoConfigurationReports()
      .clickAndSelectTableRow(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToBecomeEnabled('#btnDuplicate')
      .click('#btnDuplicate')
      .waitOnElementToBecomeVisible('#btnCapReportDistribution')
      .elementCheckBoxShouldBeSelected('#btnCapReportDistribution');

    if (mailMergeCapability) {
      ft = ft
        .waitOnElementToBecomeVisible('#btnCapReportGenerationMailMerge')
        .elementCheckBoxShouldBeSelected('#btnCapReportGenerationMailMerge');
    }
    ft = ft.click('#templateName').typeText(newTemplateName);

    if (!mailMergeCapability) {
      ft = ft.waitOnInputValueToContainText(
        '#templateHowTo',
        `/reports/${newFolderName}/${PATHS.SETTINGS_CONFIG_FILE}`,
      );
    }
    return ft
      .clickYesDoThis()
      .waitOnElementToBecomeVisible('#burstFileName');
  };

  static rollbackChangesToDefaultDocumentBursterConfiguration = (
    ft: FluentTester,
    folderName: string,
  ): FluentTester => {
    return ft
      .gotoStartScreen()
      .gotoConfigurationReports()
      .clickAndSelectTableRow(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .click(`#btnRestore_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .clickNoDontDoThis()
      .click(`#btnRestore_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .clickYesDoThis();
  };

  static assertTemplate = (
    ft: FluentTester,
    folderName: string,
    templateName: string,
    mailMergeCapability?: string,
  ): FluentTester => {
    // Top menu only shows the default fallback config (Bursting); user-created
    // configs are accessible via Configuration → Reports list only.
    ft = ft
      .gotoStartScreen()
      .gotoConfiguration()
      .elementShouldContainText(
        `#topMenuConfigurationLoad_burst_${PATHS.SETTINGS_CONFIG_FILE}`,
        'Bursting',
      )
      .elementShouldNotBeVisible(
        `#topMenuConfigurationLoad_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`,
      )
      .gotoConfigurationReports()
      .clickAndSelectTableRow(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToBecomeVisible(`#btnLoadInvite_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .click(`#btnLoadInvite_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToBecomeVisible(`#btnLoadConfirmYes_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .click(`#btnLoadConfirmYes_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToHaveText(
        '.sidebar-menu .header',
        `CONFIG (${templateName})`,
      ).sleep(3 * Constants.DELAY_ONE_SECOND);

    if (mailMergeCapability) {
      ft = ft.waitOnElementToBecomeVisible('#leftMenuReportingSettings').elementShouldBeVisible('#leftMenuReportingSettings');
    } else {
      ft = ft.elementShouldNotBeVisible('#leftMenuReportingSettings');
    }

    ft = ft
      .gotoConfigurationReports()
      .waitOnElementToHaveText(
        `#${folderName}_${PATHS.SETTINGS_CONFIG_FILE} td:first-child`,
        templateName,
      )
      .clickAndSelectTableRow(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToBecomeEnabled('#btnEdit')
      .click('#btnEdit')
      .waitOnElementToBecomeVisible('#templateName')
      .waitOnInputToHaveValue('#templateName', templateName)
      .waitOnElementToBecomeVisible('#btnCapReportDistribution')
      .elementCheckBoxShouldBeSelected('#btnCapReportDistribution')
      .waitOnElementToBecomeVisible('#btnCapReportGenerationMailMerge');
    if (mailMergeCapability) {
      ft = ft
        .elementCheckBoxShouldBeSelected('#btnCapReportGenerationMailMerge')
        .elementShouldNotBeVisible('#templateHowTo');
    } else {
      ft = ft
        .elementCheckBoxShouldNotBeSelected('#btnCapReportGenerationMailMerge')
        .waitOnElementToBecomeVisible('#templateHowTo')
        .inputValueShouldContainText(
          '#templateHowTo',
          `/reports/${folderName}/${PATHS.SETTINGS_CONFIG_FILE}`,
        );
    }

    return ft.clickNoDontDoThis();
  };

  static assertDefaultConfigurationValues = (
    ft: FluentTester,
    folderName: string,
  ): FluentTester => {
    return (
      ft
        .gotoConfigurationReports()
        // STEP1 - load and assert the saved values via reports list Load flow
        .clickAndSelectTableRow(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .waitOnElementToBecomeVisible(`#btnLoadInvite_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .click(`#btnLoadInvite_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .waitOnElementToBecomeVisible(`#btnLoadConfirmYes_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .click(`#btnLoadConfirmYes_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
        .click('#leftMenuGeneralSettings')
        .inputShouldHaveValue(
          '#burstFileName',
          '${burst_token}.${output_type_extension}',
        )
        .inputShouldHaveValue(
          '#outputFolder',
          'output/${input_document_name}/${now?string["yyyy.MM.dd_HH.mm.ss.SSS"]}',
        )
        .inputShouldHaveValue(
          '#quarantineFolder',
          'quarantine/${input_document_name}/${now?string["yyyy.MM.dd_HH.mm.ss.SSS"]}',
        )
        .click('#quarantineFolder')
        .click('#leftMenuEnableDisableDistribution')
        .elementCheckBoxShouldNotBeSelected('#btnSendDocumentsEmail')
        .elementCheckBoxShouldNotBeSelected('#btnDeleteDocuments')
        .elementCheckBoxShouldBeSelected('#btnQuarantineDocuments')
    );
  };

  static deleteTemplate = (
    ft: FluentTester,
    folderName: string,
  ): FluentTester => {
    return ft
      .gotoStartScreen()
      .gotoConfigurationReports()
      .clickAndSelectTableRow(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToBecomeEnabled('#btnDelete')
      .click('#btnDelete')
      .clickNoDontDoThis()
      .elementShouldBeVisible(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .clickAndSelectTableRow(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToBecomeEnabled('#btnDelete')
      .click('#btnDelete')
      .clickYesDoThis()
      .waitOnElementToBecomeInvisible(
        `#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`,
      );
  };

  static modifyTemplateName = (
    ft: FluentTester,
    folderName: string,
    newTemplateName: string,
  ): FluentTester => {
    return ft
      .gotoStartScreen()
      .gotoConfigurationReports()
      .clickAndSelectTableRow(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToBecomeEnabled('#btnEdit')
      .click('#btnEdit')
      .click('#templateName')
      .typeText(newTemplateName)
      .clickYesDoThis()
      .waitOnElementToBecomeVisible('#burstFileName');
  };

  static assertFallbackTemplate = (
    ft: FluentTester,
    templateName: string,
  ): FluentTester => {
    return ft
      .gotoConfigurationReports()
      .waitOnElementToBecomeEnabled('#btnEdit')
      .click('#btnEdit')
      .waitOnElementToBecomeVisible('#templateName')
      .click('#templateName')
      .elementShouldBeVisible('#fallbackTemplateSpan')
      .elementShouldContainText(
        '#fallbackTemplateSpan',
        'used automatically when no other (more specific) configuration is defined',
      )
      .click('#btnClose')
      .elementShouldContainText(
        `#burst_${PATHS.SETTINGS_CONFIG_FILE} td:first-child`,
        templateName,
      )
      .elementShouldContainText(
        `#burst_${PATHS.SETTINGS_CONFIG_FILE} td:nth-child(3)`,
        'used automatically when no other (more specific) configuration is defined',
      )
      .click('#topMenuConfiguration')
      .elementShouldContainText(
        `#topMenuConfigurationLoad_burst_${PATHS.SETTINGS_CONFIG_FILE}`,
        templateName,
      )
      .click('#topMenuConfiguration');
  };
}
