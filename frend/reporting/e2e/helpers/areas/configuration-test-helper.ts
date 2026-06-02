import _ from 'lodash';

import { FluentTester } from '../fluent-tester';
import * as PATHS from '../../utils/paths';
import { Constants } from '../../utils/constants';
import { sep } from 'path';

export class ConfigurationTestHelper {
  static loadConfiguration(
    ft: FluentTester,
    folderName: string,
    searchHint?: string,
  ): FluentTester {
    if (folderName === 'burst') {
      return ft
        .gotoBurstScreen()
        .click('#topMenuConfiguration')
        .click(
          `#topMenuConfigurationLoad_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`,
        );
    }
    // Non-fallback configs: accessible only via Configuration → Reports list.
    // Use searchHint to narrow the paginated list before clicking the row.
    ft = ft.gotoConfigurationReports();
    if (searchHint) {
      ft = ft
        .setValue('#reportsListSearch', searchHint)
        .sleep(400); // debounce is 300ms
    }
    return ft
      .click(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToBecomeVisible(
        `#btnLoadInvite_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`,
      )
      .click(`#btnLoadInvite_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToBecomeVisible(
        `#btnLoadConfirmYes_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`,
      )
      .click(`#btnLoadConfirmYes_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`);
  }

  static rollbackChangesToDefaultDocumentBursterConfiguration(
    ft: FluentTester,
    folderName: string,
  ): FluentTester {
    //const escapedWhich = PATHS.SETTINGS_CONFIG_FILE; //.replace('.', '\\.');

    return ft
      .gotoConfigurationReports()
      .click(`#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .waitOnElementToHaveClass(
        `#${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`,
        'info',
        Constants.DELAY_FIVE_THOUSANDS_SECONDS,
      )
      .click(`#btnRestore_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .clickNoDontDoThis()
      .click(`#btnRestore_${folderName}_${PATHS.SETTINGS_CONFIG_FILE}`)
      .clickYesDoThis();
  }

  static assertDefaultDocumentBursterConfiguration(
    ft: FluentTester,
    folderName: string,
  ): FluentTester {
    ft = ConfigurationTestHelper.loadConfiguration(ft, folderName);

    if (folderName === 'burst') {
      ft = ft
        .waitOnElementToHaveText(
          '#topMenuConfiguration',
          'Configuration (Bursting) ',
        )
        .waitOnElementToHaveText(
          '.sidebar-menu .header',
          'CONFIG (Bursting)',
        );
    }

    return ft
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
      .click('#btnEnableDisableDistribution') // Enable / Disable checkbox settings
      .elementCheckBoxShouldNotBeSelected('#btnSendDocumentsEmail')
      .elementCheckBoxShouldNotBeSelected('#btnSendDocumentsUpload')
      .elementCheckBoxShouldNotBeSelected('#btnSendDocumentsWeb')
      .elementCheckBoxShouldNotBeSelected('#btnSendDocumentsSMS')
      .elementCheckBoxShouldNotBeSelected('#btnDeleteDocuments')
      .elementCheckBoxShouldBeSelected('#btnQuarantineDocuments')
      .click('#leftMenuEmailSettings') // email SMTP settings
      // default ships with useconn=true: "Use Existing Email Connection" is checked,
      // SMTP fields are disabled but still carry their default values
      .elementCheckBoxShouldBeSelected('#btnUseExistingEmailConnection')
      .inputShouldHaveValue('#fromName', 'From Name')
      .inputShouldHaveValue('#fromEmailAddress', 'from@emailaddress.com')
      .inputShouldHaveValue('#emailServerHost', 'Email Server Host')
      .inputShouldHaveValue('#userName', 'From Email User ID')
      .inputShouldHaveValue('#smtpPassword', 'From Email Password')
      .inputShouldHaveValue('#smtpPort', '25')
      .elementCheckBoxShouldNotBeSelected('#btnSSL')
      .elementCheckBoxShouldNotBeSelected('#btnTLS')
      .click('#tab-btn-emailMessageTab') // email message settings
      .inputShouldHaveValue('#emailToAddress', '${burst_token}')
      .inputShouldHaveValue('#emailCcAddress', '')
      .inputShouldHaveValue('#emailBccAddress', '')
      .inputShouldHaveValue('#emailSubject', '')
      .elementShouldHaveText('#wysiwygEmailMessage', '')
      .click('#tab-btn-attachmentsTab') // email attachments settings
      .elementShouldContainText(
        'tbody tr:first-child td',
        '${extracted_file_path}',
      )
      .elementShouldContainText(
        'tbody tr:last-child td',
        '${extracted_file_path}',
      )
      .elementCheckBoxShouldNotBeSelected('#btnArchiveAttachmentsTogether')
      .inputShouldHaveValue('#archiveFileName', 'reports-${burst_token}.zip')
      .click('#leftMenuUploadSettings') // Upload settings
      .click('#tab-btn-ftpTab') // FTP settings
      .inputShouldHaveValue('#ftpCommand', '')
      .click('#tab-btn-fileShareTab') // File Share settings
      .inputShouldHaveValue('#fileShareCommand', '')
      .click('#tab-btn-ftpsTab') // FTPS settings
      .inputShouldHaveValue('#ftpsCommand', '')
      .click('#tab-btn-sftpTab') // SFTP settings
      .inputShouldHaveValue('#sftpCommand', '')
      .click('#tab-btn-httpTab') // HTTPS settings
      .inputShouldHaveValue('#httpCommand', '')
      .click('#tab-btn-cloudUploadTab') // Cloud settings
      .inputShouldHaveValue('#cloudUploadCommand', '')
      .click('#leftMenuDocuments2WebSettings') // documents2web settings
      .click('#tab-btn-documentBursterWebTab') // documents2web settings
      //.inputShouldHaveValue('#documentBursterWebCommand', '')
      .click('#tab-btn-sharePointTab') // SharePoint settings
      .inputShouldHaveValue('#sharePointCommand', '')
      .click('#tab-btn-wordPressTab') // WordPress settings
      .inputShouldHaveValue('#wordPressCommand', '')
      .click('#tab-btn-drupalTab') // Drupal settings
      .inputShouldHaveValue('#drupalCommand', '')
      .click('#tab-btn-joomlaTab') // Joomla settings
      .inputShouldHaveValue('#joomlaCommand', '')
      .click('#tab-btn-otherWebPlatformsTab') // Other Web Platforms settings
      .inputShouldHaveValue('#otherWebPlatformsCommand', '')
      .click('#leftMenuSMSSettings') // SMS settings
      .inputShouldHaveValue('#accountSid', '')
      .inputShouldHaveValue('#authToken', '')
      .click('#leftMenuTwilioSettings') // Twilio settings
      .inputShouldHaveValue('#accountSid', '')
      .inputShouldHaveValue('#authToken', '')
      .click('#tab-btn-smsMessageTab') // SMS Message settings
      .inputShouldHaveValue('#fromTelephoneNumber', '')
      .inputShouldHaveValue('#toTelephoneNumber', '')
      .inputShouldHaveValue('#smsText', '')
      .click('#leftMenuQualitySettings') // QA settings
      .inputShouldHaveValue('#qaFromName', 'From Name')
      .inputShouldHaveValue('#qaFromEmailAddress', 'from@emailaddress.com')
      .inputShouldHaveValue('#qaEmailServerHost', 'localhost')
      .inputShouldHaveValue('#qaUserName', '')
      .inputShouldHaveValue('#qaPassword', '')
      .inputShouldHaveValue('#qaPort', '1025')
      .elementCheckBoxShouldNotBeSelected('#btnQASSL')
      .elementCheckBoxShouldNotBeSelected('#btnQATLS')
      .click('#leftMenuTestEmailServerSettings')
      .inputShouldHaveValue('#qaFromName', 'From Name')
      .inputShouldHaveValue('#qaFromEmailAddress', 'from@emailaddress.com')
      .inputShouldHaveValue('#qaEmailServerHost', 'localhost')
      .inputShouldHaveValue('#qaUserName', '')
      .inputShouldHaveValue('#qaPassword', '')
      .inputShouldHaveValue('#qaPort', '1025')
      .elementCheckBoxShouldNotBeSelected('#btnQASSL')
      .elementCheckBoxShouldNotBeSelected('#btnQATLS')
      .click('#leftMenuAdvancedSettings') // Advanced settings
      .inputShouldHaveValue('#delayEachDistributionBy', '0')
      .inputShouldHaveValue('#numberOfUserVariables', '20')
      .inputShouldHaveValue('#burstTokenDelimitersStart', '{')
      .inputShouldHaveValue('#burstTokenDelimitersEnd', '}')
      .elementCheckBoxShouldNotBeSelected('#btnReuseToken')
      .elementCheckBoxShouldNotBeSelected('#btnHTMLEmailEditCode')
      .elementCheckBoxShouldNotBeSelected('#btnSplit2ndTime')
      .inputShouldHaveValue('#burstTokenDelimitersStart2nd', '[')
      .inputShouldHaveValue('#burstTokenDelimitersEnd2nd', ']')
      .elementCheckBoxShouldNotBeSelected('#btnEnableIncubatingFeatures')
      .click('#leftMenuErrorHandlingSettings') // Error Handling settings
      .elementCheckBoxShouldBeSelected('#stopImmediatelyOnError')
      .elementCheckBoxShouldNotBeSelected('#continueOnError')
      .elementCheckBoxShouldNotBeSelected('#btnEnableRetryPolicy')
      .elementShouldBeVisible('#disabled1')
      .elementShouldBeVisible('#disabled2')
      .elementShouldBeVisible('#disabled3')
      .elementShouldBeVisible('#disabled4')
      .elementShouldBeVisible('#disabled5')
      .elementShouldBeVisible('#disabled6')
      .click('#leftMenuAdvancedSettings') // Advanced settings
      .click('#btnEnableIncubatingFeatures') // Show the Incubating Features
      .click('#tab-btn-emailAddressValidationTab') // Email Address Validation
      .elementCheckBoxShouldBeSelected('#btnAllowQuotedIdentifiers')
      .elementCheckBoxShouldBeSelected('#btnAllowParensInLocalPart')
      .elementCheckBoxShouldNotBeSelected('#btnAllowDomainLiterals')
      .elementCheckBoxShouldNotBeSelected('#btnAllowDotInaText')
      .elementCheckBoxShouldNotBeSelected('#btnAllowSquareBracketsInaText')
      .inputShouldHaveValue('#txtSkipValidationFor', '')
      .click('#tab-btn-emailTuningTab') // Email Tuning
      .elementCheckBoxShouldNotBeSelected('#btnSJMActive')
      .inputShouldHaveValue('#replyToAddress', '')
      .inputShouldHaveValue('#replyToName', '')
      .inputShouldHaveValue('#bounceToAddress', '')
      .inputShouldHaveValue('#bounceToName', '')
      .inputShouldHaveValue('#receiptToAddress', '')
      .inputShouldHaveValue('#receiptToName', '')
      .inputShouldHaveValue('#dispositionNotificationToAddress', '')
      .inputShouldHaveValue('#dispositionNotificationToName', '')
      .inputShouldHaveValue('#dispositionNotificationToAddress', '')
      .inputShouldHaveValue('#dispositionNotificationToName', '')
      .inputShouldHaveValue('#textCustomEmailHeaders', '')
      .inputShouldHaveValue('#textCustomEmailHeaders', '')
      .inputShouldHaveValue('#textCustomSessionProperties', '')
      .elementCheckBoxShouldNotBeSelected('#btnJavaxMailDebug')
      .elementCheckBoxShouldNotBeSelected('#btnTransportModeLoggingOnly')
      .inputShouldHaveValue('#proxyHost', '')
      .inputShouldHaveValue('#proxyUserName', '')
      .inputShouldHaveValue('#proxyPort', '1080')
      .inputShouldHaveValue('#proxyPassword', '')
      .inputShouldHaveValue('#proxySocks5BridgePort', '1081');
  }

  static changeSaveLoadAssertSavedConfiguration(
    ft: FluentTester,
  ): FluentTester {

    const escapedWhich = PATHS.SETTINGS_CONFIG_FILE; //;.replace('.', '\\.');

    const wysiwygTestContent = `WYSIWYG content ${Date.now()}`;
    const codeJarTestContent = `<!-- CodeJar content ${Date.now()} --><h1>Final Content</h1>`;

    return (
      ft
        .gotoBurstScreen()
        .click('#topMenuConfiguration')
        .click('#topMenuConfigurationLoad_burst_' + escapedWhich) // STEP0 - CHANGE VALUES general settings
        .setValue('#burstFileName', '00')
        .setValue('#outputFolder', '01')
        .setValue('#quarantineFolder', '02')
        .click('#btnEnableDisableDistribution') // send checkbox settings
        .click('#btnSendDocumentsEmail')
        .elementShouldBeVisible('#btnEmailConfiguration')
        .click('#btnSendDocumentsUpload')
        .elementShouldBeVisible('#btnUploadConfiguration')
        .click('#btnSendDocumentsWeb')
        .elementShouldBeVisible('#btnWebConfiguration')
        .click('#btnSendDocumentsSMS')
        .elementShouldBeVisible('#btnSMSConfiguration')
        .click('#btnDeleteDocuments')
        .click('#btnQuarantineDocuments')
        .click('#leftMenuEmailSettings') // email SMTP settings
        // pre-condition: default ships with useconn=true (connection mode, SMTP fields disabled)
        .elementCheckBoxShouldBeSelected('#btnUseExistingEmailConnection')
        .click('#btnUseExistingEmailConnection') // user unchecks → switch to manual SMTP mode
        .setValue('#fromName', '00')
        .setValue('#fromEmailAddress', '01')
        .setValue('#emailServerHost', '02')
        .setValue('#userName', '03')
        .setValue('#smtpPassword', '04')
        .setValue('#smtpPort', '05')
        .click('#btnSSL')
        .click('#btnTLS')
        .click('#tab-btn-emailMessageTab') // email message settings
        .setValue('#emailToAddress', '00')
        .setValue('#emailCcAddress', '01')
        .setValue('#emailBccAddress', '02')
        .setValue('#emailSubject', '03')
        .elementShouldBeVisible('#wysiwygEmailMessage')
        .elementShouldNotBeVisible('#codeJarHtmlEmailEditorDiv')
        .setQuillContent('#wysiwygEmailMessage', wysiwygTestContent)
        .click('#tab-btn-attachmentsTab') // .setValue('#wysiwygEmailMessage', '04') email attachments settings
        .click('#btnArchiveAttachmentsTogether')
        .setValue('#archiveFileName', '01')
        .click('#leftMenuUploadSettings') // upload settings
        .click('#tab-btn-ftpTab') // FTP settings
        .setValue('#ftpCommand', 'ftp')
        .click('#tab-btn-fileShareTab') // File Share settings
        .setValue('#fileShareCommand', 'fileshare')
        .click('#tab-btn-ftpsTab') // FTPS settings
        .setValue('#ftpsCommand', 'ftps')
        .click('#tab-btn-sftpTab') // SFTP settings
        .setValue('#sftpCommand', 'sftp')
        .click('#tab-btn-httpTab') // HTTPS settings
        .setValue('#httpCommand', 'http')
        .click('#tab-btn-cloudUploadTab') // Cloud settings
        .setValue('#cloudUploadCommand', 'cloud')
        .click('#leftMenuDocuments2WebSettings') // documents2web settings
        .click('#tab-btn-documentBursterWebTab') // documents2web settings
        //.setValue('#documentBursterWebCommand', 'documentbursterweb')
        .click('#tab-btn-sharePointTab') // SharePoint settings
        .setValue('#sharePointCommand', 'sharepoint')
        .click('#tab-btn-wordPressTab') // WordPress settings
        .setValue('#wordPressCommand', 'wordpress')
        .click('#tab-btn-drupalTab') // Drupal settings
        .setValue('#drupalCommand', 'drupal')
        .click('#tab-btn-joomlaTab') // Joomla settings
        .setValue('#joomlaCommand', 'joomla')
        .click('#tab-btn-otherWebPlatformsTab') // Other Web Platforms settings
        .setValue('#otherWebPlatformsCommand', 'otherwebplatforms')
        .click('#leftMenuSMSSettings') // SMS settings
        .setValue('#accountSid', '00')
        .setValue('#authToken', '01')
        .click('#leftMenuTwilioSettings') // Twilio settings
        .setValue('#accountSid', '00')
        .setValue('#authToken', '01')
        .click('#tab-btn-smsMessageTab') // SMS Message settings
        .setValue('#fromTelephoneNumber', '00')
        .setValue('#toTelephoneNumber', '01')
        .setValue('#smsText', '02')
        .click('#leftMenuQualitySettings') // QA settings
        .setValue('#qaFromName', '00')
        .setValue('#qaFromEmailAddress', '01')
        .setValue('#qaEmailServerHost', '02')
        .setValue('#qaUserName', '03')
        .setValue('#qaPassword', '04')
        .setValue('#qaPort', '05')
        .click('#btnQASSL')
        .click('#btnQATLS')
        .click('#leftMenuTestEmailServerSettings')
        .setValue('#qaFromName', '00')
        .setValue('#qaFromEmailAddress', '01')
        .setValue('#qaEmailServerHost', '02')
        .setValue('#qaUserName', '03')
        .setValue('#qaPassword', '04')
        .setValue('#qaPort', '05')
        .click('#leftMenuAdvancedSettings') // Advanced settings
        .setValue('#delayEachDistributionBy', '0')
        .setValue('#numberOfUserVariables', '1')
        .setValue('#burstTokenDelimitersStart', '02')
        .setValue('#burstTokenDelimitersEnd', '03')
        .click('#btnReuseToken')
        .click('#btnHTMLEmailEditCode')
        .click('#btnSplit2ndTime')
        .setValue('#burstTokenDelimitersStart2nd', '04')
        .setValue('#burstTokenDelimitersEnd2nd', '05')
        .click('#leftMenuErrorHandlingSettings') // Error Handling settings
        .click('#continueOnError')
        .click('#btnEnableRetryPolicy')
        .elementShouldBeEnabled('#retryPolicyDelay')
        .elementShouldBeEnabled('#retryPolicyMaxDelay')
        .elementShouldBeEnabled('#retryPolicyMaxRetries')
        .setValue('#retryPolicyDelay', '1')
        .setValue('#retryPolicyMaxDelay', '2')
        .setValue('#retryPolicyMaxRetries', '3')
        .click('#leftMenuAdvancedSettings') // Advanced settings
        .click('#btnEnableIncubatingFeatures') // Show the Incubating Features
        .click('#tab-btn-emailAddressValidationTab') // Email Address Validation
        .click('#btnAllowQuotedIdentifiers')
        .click('#btnAllowParensInLocalPart')
        .click('#btnAllowDomainLiterals')
        .click('#btnAllowDotInaText')
        .click('#btnAllowSquareBracketsInaText')
        .setValue('#txtSkipValidationFor', '00')
        .click('#tab-btn-emailTuningTab') // Email Tuning
        .click('#btnSJMActive')
        .setValue('#replyToAddress', '00')
        .setValue('#replyToName', '01')
        .setValue('#bounceToAddress', '02')
        .setValue('#bounceToName', '03')
        .setValue('#receiptToAddress', '04')
        .setValue('#receiptToName', '05')
        .setValue('#dispositionNotificationToAddress', '06')
        .setValue('#dispositionNotificationToName', '07')
        .setValue('#textCustomEmailHeaders', '08')
        .setValue('#textCustomSessionProperties', '09')
        .click('#btnJavaxMailDebug')
        .click('#btnTransportModeLoggingOnly')
        .setValue('#proxyHost', '10')
        .setValue('#proxyUserName', '11')
        .setValue('#proxyPort', '12')
        .setValue('#proxyPassword', '13')
        .setValue('#proxySocks5BridgePort', '14')
        .click('#leftMenuEmailSettings')
        .click('#tab-btn-emailMessageTab')
        .waitOnElementToBecomeVisible('#codeJarHtmlEmailEditorDiv')
        .elementShouldNotBeVisible('#wysiwygEmailMessage')
        // At this point, the code editor should contain the HTML from the WYSIWYG editor
        .codeJarShouldContainText('#codeJarHtmlEmailEditor', wysiwygTestContent)
        // Now, set the final content using the code editor
        .setCodeJarContent('#codeJarHtmlEmailEditor', codeJarTestContent)

        // Test Splitter and Preview functionality
        .click('#btnToggleEmailPreviewShow')
        .waitOnElementToBecomeVisible('as-split')
        .waitOnElementToBecomeVisible('#emailPreviewPane')
        // Assert initial 50/50 split
        .waitOnElementToBecomeVisible('as-split > .as-split-gutter') // Check that gutter is visible
        .click('#btnToggleEmailPreviewHide')
        .waitOnElementToBecomeInvisible('as-split')

        // Test Examples Gallery with assertions for specific email templates
        .waitOnElementToBecomeVisible('#btnAskAiForHelp')
        .waitOnElementToBecomeVisible('#btnAskAiForHelpDropdownToggle')
        .click('#btnAskAiForHelpDropdownToggle')
        .waitOnElementToBecomeVisible('#btnAskAiForHelpDropdownItem')
        .click('#btnAskAiForHelpDropdownItem')
        .waitOnElementToBecomeVisible('#btnCloseAiCopilotModal')
        .pageShouldContainText('A responsive two-column template with a boxed layout that includes a body image')
        .click('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeInvisible('#btnCloseAiCopilotModal')

        .waitOnElementToBecomeVisible('#btnAskAiForHelp')
        .waitOnElementToBecomeVisible('#btnAskAiForHelpDropdownToggle')
        .click('#btnAskAiForHelpDropdownToggle')

        .waitOnElementToBecomeVisible('#btnOpenTemplateGalleryDropdownItem')
        .click('#btnOpenTemplateGalleryDropdownItem')
        .waitOnElementToBecomeVisible('.dp-carousel-next')
        .waitOnElementToBecomeEnabled('.dp-carousel-next')
        .sleep(Constants.DELAY_ONE_SECOND)
        .click('.dp-carousel-next').sleep(Constants.DELAY_ONE_SECOND)
        .click('.dp-carousel-next').sleep(Constants.DELAY_ONE_SECOND)
        .click('#btnUseSelectedTemplate')
        .clickNoDontDoThis()
        .click('#btnUseSelectedTemplate')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#codeJarHtmlEmailEditor')
        .waitOnElementToBecomeEnabled('#codeJarHtmlEmailEditor')
        // Verify the content was replaced by the gallery template
        .codeJarShouldNotContainText('#codeJarHtmlEmailEditor', codeJarTestContent)
        .codeJarShouldContainText('#codeJarHtmlEmailEditor', 'border-bottom:1px solid #CCCCCC;') // Unique string from the first email template

        // values are supposed to be saved at this moment ==> go away and click burst top menu
        .click('#topMenuBurst')
        // STEP1 - load and assert the saved values
        .click('#topMenuConfiguration')
        .elementShouldHaveText(
          '#topMenuConfigurationLoad_burst_' + escapedWhich,
          'Bursting',
        )
        // general settings
        .click('#topMenuConfigurationLoad_burst_' + escapedWhich)
        .elementShouldHaveText(
          '#topMenuConfiguration',
          'Configuration (Bursting) ',
        )
        .elementShouldHaveText(
          '.sidebar-menu .header',
          'CONFIG (Bursting)',
        )
        .inputShouldHaveValue('#burstFileName', '00')
        .inputShouldHaveValue('#outputFolder', '01')
        .inputShouldHaveValue('#quarantineFolder', '02')
        // send checkbox settings
        .click('#btnEnableDisableDistribution')
        .elementCheckBoxShouldBeSelected('#btnSendDocumentsEmail')
        .elementShouldBeVisible('#btnEmailConfiguration')
        .elementShouldBeVisible('#btnUploadConfiguration')
        .elementCheckBoxShouldBeSelected('#btnSendDocumentsWeb')
        .elementShouldBeVisible('#btnWebConfiguration')
        .elementCheckBoxShouldBeSelected('#btnSendDocumentsSMS')
        .elementShouldBeVisible('#btnSMSConfiguration')
        .elementCheckBoxShouldBeSelected('#btnDeleteDocuments')
        .elementCheckBoxShouldNotBeSelected('#btnQuarantineDocuments')
        // email SMTP settings
        .click('#leftMenuEmailSettings')
        // user's uncheck persisted across save+reload → still in manual SMTP mode
        .elementCheckBoxShouldNotBeSelected('#btnUseExistingEmailConnection')
        .inputShouldHaveValue('#fromName', '00')
        .inputShouldHaveValue('#fromEmailAddress', '01')
        .inputShouldHaveValue('#emailServerHost', '02')
        .inputShouldHaveValue('#userName', '03')
        .inputShouldHaveValue('#smtpPassword', '******')
        .inputShouldHaveValue('#smtpPort', '05')
        .elementCheckBoxShouldBeSelected('#btnSSL')
        .elementCheckBoxShouldBeSelected('#btnTLS')
        // email message settings
        .click('#tab-btn-emailMessageTab')
        .inputShouldHaveValue('#emailToAddress', '00')
        .inputShouldHaveValue('#emailCcAddress', '01')
        .inputShouldHaveValue('#emailBccAddress', '02')
        .inputShouldHaveValue('#emailSubject', '03')
        .elementShouldNotBeVisible('#wysiwygEmailMessage')
        .waitOnElementToBecomeVisible('#codeJarHtmlEmailEditorDiv')
        .codeJarShouldContainText('#codeJarHtmlEmailEditor', 'border-bottom:1px solid #CCCCCC;')
        .codeJarShouldNotContainText('#codeJarHtmlEmailEditor', codeJarTestContent)
        .codeJarShouldNotContainText('#codeJarHtmlEmailEditor', wysiwygTestContent)
        // email attachments settings
        .click('#tab-btn-attachmentsTab')
        .elementShouldHaveText(
          'tbody tr:first-child td',
          '${extracted_file_path}',
        )
        .elementShouldHaveText(
          'tbody tr:last-child td',
          '${extracted_file_path}',
        )
        .elementCheckBoxShouldBeSelected('#btnArchiveAttachmentsTogether')
        .inputShouldHaveValue('#archiveFileName', '01')
        // upload settings
        .click('#leftMenuUploadSettings')
        .click('#tab-btn-ftpTab')
        .inputShouldHaveValue('#ftpCommand', 'ftp')
        // File Share settings
        .click('#tab-btn-fileShareTab')
        .inputShouldHaveValue('#fileShareCommand', 'fileshare')
        // FTPS settings
        .click('#tab-btn-ftpsTab')
        .inputShouldHaveValue('#ftpsCommand', 'ftps')
        // SFTP settings
        .click('#tab-btn-sftpTab')
        .inputShouldHaveValue('#sftpCommand', 'sftp')
        // HTTPS settings
        .click('#tab-btn-httpTab')
        .inputShouldHaveValue('#httpCommand', 'http')
        // Cloud settings
        .click('#tab-btn-cloudUploadTab')
        .inputShouldHaveValue('#cloudUploadCommand', 'cloud')
        // documents2web settings
        .click('#leftMenuDocuments2WebSettings')
        .click('#tab-btn-documentBursterWebTab')
        //.inputShouldHaveValue(
        //  '#documentBursterWebCommand',
        //  'documentbursterweb',
        //)
        // SharePoint settings
        .click('#tab-btn-sharePointTab')
        .inputShouldHaveValue('#sharePointCommand', 'sharepoint')
        // WordPress settings
        .click('#tab-btn-wordPressTab')
        .inputShouldHaveValue('#wordPressCommand', 'wordpress')
        // Drupal settings
        .click('#tab-btn-drupalTab')
        .inputShouldHaveValue('#drupalCommand', 'drupal')
        // Joomla settings
        .click('#tab-btn-joomlaTab')
        .inputShouldHaveValue('#joomlaCommand', 'joomla')
        // Other Web Platforms settings
        .click('#tab-btn-otherWebPlatformsTab')
        .inputShouldHaveValue('#otherWebPlatformsCommand', 'otherwebplatforms')
        // SMS settings
        .click('#leftMenuSMSSettings')
        .inputShouldHaveValue('#accountSid', '00')
        .inputShouldHaveValue('#authToken', '******')
        // Twilio settings
        .click('#leftMenuTwilioSettings')
        .inputShouldHaveValue('#accountSid', '00')
        .inputShouldHaveValue('#authToken', '******')
        // SMS Message settings
        .click('#tab-btn-smsMessageTab')
        .inputShouldHaveValue('#fromTelephoneNumber', '00')
        .inputShouldHaveValue('#toTelephoneNumber', '01')
        .inputShouldHaveValue('#smsText', '02')
        // QA settings
        .click('#leftMenuQualitySettings')
        .inputShouldHaveValue('#qaFromName', '00')
        .inputShouldHaveValue('#qaFromEmailAddress', '01')
        .inputShouldHaveValue('#qaEmailServerHost', '02')
        .inputShouldHaveValue('#qaUserName', '03')
        .inputShouldHaveValue('#qaPassword', '******')
        .inputShouldHaveValue('#qaPort', '05')
        .elementCheckBoxShouldBeSelected('#btnQASSL')
        .elementCheckBoxShouldBeSelected('#btnQATLS')
        .click('#leftMenuTestEmailServerSettings')
        .inputShouldHaveValue('#qaFromName', '00')
        .inputShouldHaveValue('#qaFromEmailAddress', '01')
        .inputShouldHaveValue('#qaEmailServerHost', '02')
        .inputShouldHaveValue('#qaUserName', '03')
        .inputShouldHaveValue('#qaPassword', '******')
        .inputShouldHaveValue('#qaPort', '05')
        .elementCheckBoxShouldBeSelected('#btnQASSL')
        .elementCheckBoxShouldBeSelected('#btnQATLS')
        // Advanced settings
        .click('#leftMenuAdvancedSettings')
        .inputShouldHaveValue('#delayEachDistributionBy', '0')
        .inputShouldHaveValue('#numberOfUserVariables', '1')
        .inputShouldHaveValue('#burstTokenDelimitersStart', '02')
        .inputShouldHaveValue('#burstTokenDelimitersEnd', '03')
        .elementCheckBoxShouldBeSelected('#btnReuseToken')
        // .isSelectedShouldEventuallyEqual('#btnHTMLEmailEditCode', true)
        .elementCheckBoxShouldBeSelected('#btnSplit2ndTime')
        .inputShouldHaveValue('#burstTokenDelimitersStart2nd', '04')
        .inputShouldHaveValue('#burstTokenDelimitersEnd2nd', '05')
        // Error Handling settings
        .click('#leftMenuErrorHandlingSettings')
        .elementCheckBoxShouldNotBeSelected('#stopImmediatelyOnError')
        .elementCheckBoxShouldBeSelected('#continueOnError')
        .elementCheckBoxShouldBeSelected('#btnEnableRetryPolicy')
        .inputShouldHaveValue('#retryPolicyDelay', '1')
        .inputShouldHaveValue('#retryPolicyMaxDelay', '2')
        .inputShouldHaveValue('#retryPolicyMaxRetries', '3')
        .click('#leftMenuAdvancedSettings') // Advanced settings
        .click('#tab-btn-emailAddressValidationTab') // Email Address Validation
        .elementCheckBoxShouldNotBeSelected('#btnAllowQuotedIdentifiers')
        .elementCheckBoxShouldNotBeSelected('#btnAllowParensInLocalPart')
        .elementCheckBoxShouldBeSelected('#btnAllowDomainLiterals')
        .elementCheckBoxShouldBeSelected('#btnAllowDotInaText')
        .elementCheckBoxShouldBeSelected('#btnAllowSquareBracketsInaText')
        .inputShouldHaveValue('#txtSkipValidationFor', '00')
        .click('#tab-btn-emailTuningTab') // Email Tuning
        .elementCheckBoxShouldBeSelected('#btnSJMActive')
        .inputShouldHaveValue('#replyToAddress', '00')
        .inputShouldHaveValue('#replyToName', '01')
        .inputShouldHaveValue('#bounceToAddress', '02')
        .inputShouldHaveValue('#bounceToName', '03')
        .inputShouldHaveValue('#receiptToAddress', '04')
        .inputShouldHaveValue('#receiptToName', '05')
        .inputShouldHaveValue('#dispositionNotificationToAddress', '06')
        .inputShouldHaveValue('#dispositionNotificationToName', '07')
        .inputShouldHaveValue('#textCustomEmailHeaders', '08')
        .inputShouldHaveValue('#textCustomSessionProperties', '09')
        .elementCheckBoxShouldBeSelected('#btnJavaxMailDebug')
        .elementCheckBoxShouldBeSelected('#btnTransportModeLoggingOnly')
        .inputShouldHaveValue('#proxyHost', '10')
        .inputShouldHaveValue('#proxyUserName', '11')
        .inputShouldHaveValue('#proxyPort', '12')
        .inputShouldHaveValue('#proxyPassword', '******')
        .inputShouldHaveValue('#proxySocks5BridgePort', '14')
    );
  }

  static assertDefaultDocumentBursterReportingConfiguration(
    ft: FluentTester,
    folderName: string,
  ): FluentTester {
    ft = ConfigurationTestHelper.loadConfiguration(ft, folderName)
      .waitOnElementToBecomeVisible('#leftMenuGeneralSettings')
      .waitOnElementToBecomeEnabled('#leftMenuGeneralSettings')
      .sleep(3 * Constants.DELAY_ONE_SECOND)
      .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
      .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
      .click('#leftMenuReportingSettings')
      // Test CSV Default Settings
      .waitOnElementToBecomeVisible('#dsTypes')
      .waitOnElementToBecomeEnabled('#dsTypes')
      .selectedOptionShouldContainText('#dsTypes', 'CSV File')
      .inputShouldHaveValue('#separatorChar', ',')
      .selectedOptionShouldContainText('#selectHeader', 'No Header')
      .inputShouldHaveValue('#skipLines', '0')
      .elementShouldBeDisabled('#skipLines')
      .elementCheckBoxShouldNotBeSelected('#btnShowMoreCsvOptions')
      .elementShouldNotBeVisible('#quotationChar')
      .elementShouldNotBeVisible('#escapeChar')
      .elementShouldNotBeVisible('#btnStrictQuotations')
      .elementShouldNotBeVisible('#btnIgnoreQuotations')
      .elementShouldNotBeVisible('#btnIgnoreLeadingWhitespace')

      // Test CSV header interaction behavior
      .dropDownSelectOptionHavingLabel('#selectHeader', 'First Line')
      .waitOnInputToHaveValue('#skipLines', '1')
      .dropDownSelectOptionHavingLabel('#selectHeader', 'Multiple Lines')
      .waitOnElementToBecomeEnabled('#skipLines')
      .waitOnInputToHaveValue('#skipLines', '2')
      .dropDownSelectOptionHavingLabel('#selectHeader', 'No Header')
      .waitOnElementToBecomeDisabled('#skipLines')
      .waitOnInputToHaveValue('#skipLines', '0')

      // Test CSV advanced options
      .click('#lblShowMoreCsvOptions')
      .waitOnElementToBecomeVisible('#csvIdColumn')
      .waitOnElementToBecomeVisible('#quotationChar')
      .waitOnElementToBecomeVisible('#escapeChar')
      .waitOnElementToBecomeVisible('#btnStrictQuotations')
      .waitOnElementToBecomeVisible('#btnIgnoreQuotations')
      .waitOnElementToBecomeVisible('#btnIgnoreLeadingWhitespace')
      .selectedOptionShouldContainText('#csvIdColumn', 'Not Used')
      .inputShouldHaveValue('#quotationChar', '"')
      .inputShouldHaveValue('#escapeChar', '\\')
      .elementCheckBoxShouldNotBeSelected('#btnStrictQuotations')
      .elementCheckBoxShouldNotBeSelected('#btnIgnoreQuotations')
      .elementCheckBoxShouldBeSelected('#btnIgnoreLeadingWhitespace')
      .click('#lblShowMoreCsvOptions')
      .waitOnElementToBecomeInvisible('#quotationChar')
      .waitOnElementToBecomeInvisible('#escapeChar')
      .waitOnElementToBecomeInvisible('#btnStrictQuotations')
      .waitOnElementToBecomeInvisible('#btnIgnoreQuotations')
      .waitOnElementToBecomeInvisible('#btnIgnoreLeadingWhitespace')

      // Test "Additional Data Transformation" for SQL Query
      .elementShouldBeVisible('#lblShowAdditionalTransformation')
      .elementCheckBoxShouldNotBeSelected('#btnShowAdditionalTransformation')
      .elementShouldNotBeVisible('#transformationCodeEditor')
      .elementShouldNotBeVisible('#btnHelpWithTransformationAI') // Assumed ID

      // Expand "Additional Data Transformation"
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor')
      .codeJarShouldContainText('#transformationCodeEditor', '') // Check default empty content
      .waitOnElementToBecomeVisible('#btnHelpWithTransformationAI') // Assumed ID
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')

      // Collapse "Additional Data Transformation"
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeInvisible('#transformationCodeEditor')
      .elementCheckBoxShouldNotBeSelected('#btnShowAdditionalTransformation')
      .elementShouldNotBeVisible('#btnHelpWithTransformationAI') // Assumed ID

      // Test TSV Default Settings
      .dropDownSelectOptionHavingLabel(
        '#dsTypes',
        'TSV File (tab-separated values)',
      )
      .waitOnElementToBecomeVisible('#separatorChar')
      .inputShouldHaveValue('#separatorChar', '→ [tab character]')
      .elementAttributeShouldHaveValue('#separatorChar', 'readonly', '')
      .selectedOptionShouldContainText('#selectHeader', 'No Header')
      .inputShouldHaveValue('#skipLines', '0')
      .elementShouldBeDisabled('#skipLines')

      // Test TSV header interaction behavior
      .dropDownSelectOptionHavingLabel('#selectHeader', 'First Line')
      .waitOnInputToHaveValue('#skipLines', '1')
      .dropDownSelectOptionHavingLabel('#selectHeader', 'Multiple Lines')
      .waitOnElementToBecomeEnabled('#skipLines')
      .waitOnInputToHaveValue('#skipLines', '2')

      // Test TSV advanced options (using same IDs as CSV)
      .click('#lblShowMoreCsvOptions')
      .waitOnElementToBecomeVisible('#quotationChar')
      .waitOnElementToBecomeVisible('#escapeChar')
      .elementCheckBoxShouldNotBeSelected('#btnStrictQuotations')
      .elementCheckBoxShouldNotBeSelected('#btnIgnoreQuotations')
      .elementCheckBoxShouldBeSelected('#btnIgnoreLeadingWhitespace')
      .click('#lblShowMoreCsvOptions')
      .waitOnElementToBecomeInvisible('#quotationChar')

      // Test "Additional Data Transformation" for SQL Query
      .elementShouldBeVisible('#lblShowAdditionalTransformation')
      .elementCheckBoxShouldNotBeSelected('#btnShowAdditionalTransformation')
      .elementShouldNotBeVisible('#transformationCodeEditor')
      .elementShouldNotBeVisible('#btnHelpWithTransformationAI') // Assumed ID

      // Expand "Additional Data Transformation"
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor')
      .codeJarShouldContainText('#transformationCodeEditor', '') // Check default empty content
      .waitOnElementToBecomeVisible('#btnHelpWithTransformationAI') // Assumed ID
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')

      // Collapse "Additional Data Transformation"
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeInvisible('#transformationCodeEditor')
      .elementCheckBoxShouldNotBeSelected('#btnShowAdditionalTransformation')
      .elementShouldNotBeVisible('#btnHelpWithTransformationAI') // Assumed ID

      // Test Excel Default Settings
      .dropDownSelectOptionHavingLabel('#dsTypes', 'Excel File')
      .selectedOptionShouldContainText('#selectExcelHeader', 'No Header')
      .inputShouldHaveValue('#excelSkipLines', '0')
      .inputShouldHaveValue('#excelSheetIndex', '0')
      .elementCheckBoxShouldNotBeSelected('#btnShowMoreExcelOptions')

      // Test Excel advanced options
      .click('#lblShowMoreExcelOptions')
      .waitOnElementToBecomeVisible('#excelIdColumn')
      .waitOnElementToBecomeVisible('#btnExcelIgnoreLeadingWhitespace')
      .waitOnElementToBecomeVisible('#btnExcelUseFormulaResults')
      .selectedOptionShouldContainText('#excelIdColumn', 'Not Used')
      .elementCheckBoxShouldBeSelected('#btnExcelIgnoreLeadingWhitespace')
      .elementCheckBoxShouldBeSelected('#btnExcelUseFormulaResults')

      // Test Excel header interaction behavior
      .dropDownSelectOptionHavingLabel('#selectExcelHeader', 'First Line')
      .waitOnInputToHaveValue('#excelSkipLines', '1')
      .waitOnElementToBecomeDisabled('#excelSkipLines')
      .dropDownSelectOptionHavingLabel('#selectExcelHeader', 'Multiple Lines')
      .waitOnElementToBecomeEnabled('#excelSkipLines')
      .waitOnInputToHaveValue('#excelSkipLines', '2')
      .click('#excelSkipLines')
      .typeText('5') // Test editing when enabled
      .waitOnInputToHaveValue('#excelSkipLines', '5')
      .dropDownSelectOptionHavingLabel('#selectExcelHeader', 'No Header')
      .waitOnElementToBecomeDisabled('#excelSkipLines')
      .waitOnInputToHaveValue('#excelSkipLines', '0')

      // Test Excel ID column options
      .dropDownSelectOptionHavingLabel('#excelIdColumn', 'First Column')
      .dropDownSelectOptionHavingLabel('#excelIdColumn', 'Last Column')
      .dropDownSelectOptionHavingLabel(
        '#excelIdColumn',
        'Custom Column Index...',
      )
      .dropDownSelectOptionHavingLabel('#excelIdColumn', 'Not Used')

      // Hide Excel options again
      .click('#lblShowMoreExcelOptions')
      .waitOnElementToBecomeInvisible('#excelIdColumn')
      .waitOnElementToBecomeInvisible('#btnExcelIgnoreLeadingWhitespace')
      .waitOnElementToBecomeInvisible('#btnExcelUseFormulaResults')

      // Test "Additional Data Transformation" for SQL Query
      .elementShouldBeVisible('#lblShowAdditionalTransformation')
      .elementCheckBoxShouldNotBeSelected('#btnShowAdditionalTransformation')
      .elementShouldNotBeVisible('#transformationCodeEditor')
      .elementShouldNotBeVisible('#btnHelpWithTransformationAI') // Assumed ID

      // Expand "Additional Data Transformation"
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor')
      .codeJarShouldContainText('#transformationCodeEditor', '') // Check default empty content
      .waitOnElementToBecomeVisible('#btnHelpWithTransformationAI') // Assumed ID
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')

      // Collapse "Additional Data Transformation"
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeInvisible('#transformationCodeEditor')
      .elementCheckBoxShouldNotBeSelected('#btnShowAdditionalTransformation')
      .elementShouldNotBeVisible('#btnHelpWithTransformationAI') // Assumed ID

      // Test Fixed Width Default Settings
      .dropDownSelectOptionHavingLabel(
        '#dsTypes',
        'Fixed-Width File (fixed-width columns)',
      )
      .waitOnElementToBecomeVisible('#fixedWidthColumns')
      .elementShouldBeVisible('#selectFixedWidthHeader')
      .elementShouldBeVisible('#fixedWidthSkipLines')
      .inputShouldHaveValue('#fixedWidthColumns', '')
      .selectedOptionShouldContainText('#selectFixedWidthHeader', 'No Header')
      .inputShouldHaveValue('#fixedWidthSkipLines', '0')
      .elementCheckBoxShouldNotBeSelected('#btnShowMoreFixedWidthOptions')
      .elementShouldNotBeVisible('#btnFixedWidthIgnoreLeadingWhitespace')

      // Test Fixed Width header interaction behavior
      .dropDownSelectOptionHavingLabel('#selectFixedWidthHeader', 'First Line')
      .waitOnInputToHaveValue('#fixedWidthSkipLines', '1')
      .waitOnElementToBecomeDisabled('#fixedWidthSkipLines') // Should be disabled
      .dropDownSelectOptionHavingLabel('#selectFixedWidthHeader', 'No Header')
      .waitOnInputToHaveValue('#fixedWidthSkipLines', '0') // Value should remain 0
      .waitOnElementToBecomeDisabled('#fixedWidthSkipLines') // Should still be disabled

      // Test Fixed Width columns format
      .click('#fixedWidthColumns')
      .typeText('Column1, 10\nColumn2, 15')

      // Test Fixed Width advanced options
      .elementShouldBeVisible('#lblShowMoreFixedWidthOptions')
      .click('#lblShowMoreFixedWidthOptions')
      .waitOnElementToBecomeVisible('#btnFixedWidthIgnoreLeadingWhitespace')
      .waitOnElementToBecomeVisible('#fixedWidthIdColumn')
      .selectedOptionShouldContainText('#fixedWidthIdColumn', 'Not Used')
      .elementCheckBoxShouldBeSelected('#btnFixedWidthIgnoreLeadingWhitespace')
      .click('#btnFixedWidthIgnoreLeadingWhitespace')
      .elementCheckBoxShouldNotBeSelected(
        '#btnFixedWidthIgnoreLeadingWhitespace',
      )
      .click('#btnFixedWidthIgnoreLeadingWhitespace')
      .elementCheckBoxShouldBeSelected('#btnFixedWidthIgnoreLeadingWhitespace')

      // Hide options again
      .click('#lblShowMoreFixedWidthOptions')
      .waitOnElementToBecomeInvisible('#btnFixedWidthIgnoreLeadingWhitespace')

      // Test "Additional Data Transformation" for SQL Query
      .elementShouldBeVisible('#lblShowAdditionalTransformation')
      .elementCheckBoxShouldNotBeSelected('#btnShowAdditionalTransformation')
      .elementShouldNotBeVisible('#transformationCodeEditor')
      .elementShouldNotBeVisible('#btnHelpWithTransformationAI') // Assumed ID

      // Expand "Additional Data Transformation"
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor')
      .codeJarShouldContainText('#transformationCodeEditor', '') // Check default empty content
      .waitOnElementToBecomeVisible('#btnHelpWithTransformationAI') // Assumed ID
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')

      // Collapse "Additional Data Transformation"
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeInvisible('#transformationCodeEditor')
      .elementCheckBoxShouldNotBeSelected('#btnShowAdditionalTransformation')
      .elementShouldNotBeVisible('#btnHelpWithTransformationAI') // Assumed ID

      // Test Google Sheets feature request modal
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.gsheet')
      .waitOnElementToBecomeVisible('#btnCloseAskForFeatureModal')
      .click('#btnCloseAskForFeatureModal')
      .waitOnElementToBecomeInvisible('#btnCloseAskForFeatureModal')

      // Test Office 365 feature request modal
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.o365sheet')
      .waitOnElementToBecomeVisible('#btnCloseAskForFeatureModal')
      .click('#btnCloseAskForFeatureModal')
      .waitOnElementToBecomeInvisible('#btnCloseAskForFeatureModal')

      // Test SQL Query datasource
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.sqlquery')
      // 3 sample DB connections (SQLite/DuckDB/ClickHouse) are always present in memory (virtual,
      // materialized to disk only on first save/test), so getDatabaseConnectionFilesForUI().length
      // is never 0 — the #databaseConnection dropdown always shows instead of the "no connections" message.
      .waitOnElementToBecomeVisible('#databaseConnection')
      .waitOnElementToBecomeVisible('#sqlQueryEditor')
      .codeJarShouldContainText('#sqlQueryEditor', '') // Assumes codejar content is checkable this way or use codeJarShouldContainText(selector, '')
      .waitOnElementToBecomeVisible('#btnHelpWithSqlQueryAI') // Assumed ID
      .elementShouldBeDisabled('#btnHelpWithSqlQueryAI') // Assumed ID
      .waitOnElementToBecomeVisible('#btnTestSqlQuery') // Assumed ID
      .elementShouldBeDisabled('#btnTestSqlQuery') // Assumed ID

      .waitOnElementToBecomeEnabled('#tab-btn-tabSqlReportParameters')
      .click('#tab-btn-tabSqlReportParameters') // Assumed ID
      .sleep(Constants.DELAY_ONE_SECOND) // Wait for the tab to be ready
      .waitOnElementToBecomeVisible('#paramsSpecEditor')
      .codeJarShouldContainText('#paramsSpecEditor', '')

      .waitOnElementToBecomeEnabled('#tab-btn-tabSqlExampleReportParameters')
      .click('#tab-btn-tabSqlExampleReportParameters') // Assumed ID
      .sleep(Constants.DELAY_ONE_SECOND)
      .waitOnElementToBecomeVisible('#paramsSpecExampleEditor')
      .codeJarShouldContainText('#paramsSpecExampleEditor', 'Report start date')
      .waitOnElementToBecomeVisible('#btnCopyToClipboardParametersSpecExampleSql')
      .waitOnElementToBecomeEnabled('#btnCopyToClipboardParametersSpecExampleSql')
      //.scrollIntoViewIfNeeded('#btnCopyToClipboardParametersSpecExampleSql')
      //.click('#btnCopyToClipboardParametersSpecExampleSql')
      //.waitOnElementWithTextToBecomeVisible('Example parameters script copied to clipboard!')
      //.clipboardShouldContainText('Report start date')
      .click('#tab-btn-tabSqlCode')
      .waitOnElementToBecomeVisible('#sqlQueryEditor')

      // .elementShouldBeDisabled('#btnHelpWithSqlQueryAI') // If no connection selected or available
      .elementCheckBoxShouldNotBeSelected('#btnShowMoreSqlOptions')
      .elementShouldNotBeVisible('#sqlIdColumn')

      // Test SQL Query advanced options
      .click('#lblShowMoreSqlOptions')
      .waitOnElementToBecomeVisible('#sqlIdColumn')
      .selectedOptionShouldContainText('#sqlIdColumn', 'Not Used')
      .elementShouldNotBeVisible('#sqlCustomIdColumnIndex')
      .click('#lblShowMoreSqlOptions') // Hide advanced options
      .waitOnElementToBecomeInvisible('#sqlIdColumn')

      // Test "Additional Data Transformation" for SQL Query
      .elementShouldBeVisible('#lblShowAdditionalTransformation')
      .elementCheckBoxShouldNotBeSelected('#btnShowAdditionalTransformation')
      .elementShouldNotBeVisible('#transformationCodeEditor')
      .elementShouldNotBeVisible('#btnHelpWithTransformationAI') // Assumed ID

      // Expand "Additional Data Transformation"
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor')
      .codeJarShouldContainText('#transformationCodeEditor', '') // Check default empty content
      .waitOnElementToBecomeVisible('#btnHelpWithTransformationAI') // Assumed ID
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')

      // Collapse "Additional Data Transformation"
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeInvisible('#transformationCodeEditor')
      .elementCheckBoxShouldNotBeSelected('#btnShowAdditionalTransformation')
      .elementShouldNotBeVisible('#btnHelpWithTransformationAI') // Assumed ID

      // Test Script Default Settings
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.scriptfile')
      // 3 sample DB connections always present in memory — dropdown shows, not "no connections" message.
      .waitOnElementToBecomeVisible('#databaseConnection')
      .waitOnElementToBecomeVisible('#groovyScriptEditor') // Wait for the section to be visible
      .waitOnElementToBecomeVisible('#btnHelpWithScriptAI') // Assumed ID

      .waitOnElementToBecomeEnabled('#tab-btn-tabScriptReportParameters')
      .click('#tab-btn-tabScriptReportParameters') // Assumed ID
      .sleep(Constants.DELAY_ONE_SECOND)
      .waitOnElementToBecomeVisible('#paramsSpecEditor')
      .codeJarShouldContainText('#paramsSpecEditor', '')

      .waitOnElementToBecomeEnabled('#tab-btn-tabScriptExampleReportParameters')
      .click('#tab-btn-tabScriptExampleReportParameters') // Assumed ID
      .sleep(Constants.DELAY_ONE_SECOND)
      .waitOnElementToBecomeVisible('#paramsSpecExampleEditor')
      .codeJarShouldContainText('#paramsSpecExampleEditor', 'Report start date')
      .waitOnElementToBecomeVisible('#btnCopyToClipboardParametersSpecExampleScript')
      .waitOnElementToBecomeEnabled('#btnCopyToClipboardParametersSpecExampleScript')
      //.scrollIntoViewIfNeeded('#btnCopyToClipboardParametersSpecExampleScript')
      //.click('#btnCopyToClipboardParametersSpecExampleScript')
      //.waitOnElementWithTextToBecomeVisible('Example parameters script copied to clipboard!')
      //.clipboardShouldContainText('Report start date')
      .click('#tab-btn-tabScriptCode')
      .waitOnElementToBecomeVisible('#groovyScriptEditor')

      .elementCheckBoxShouldNotBeSelected('#btnShowMoreScriptOptions')
      .elementShouldNotBeVisible('#scriptIdColumn')

      // Test Script advanced options
      .click('#lblShowMoreScriptOptions')
      .waitOnElementToBecomeVisible('#scriptIdColumn')
      .selectedOptionShouldContainText('#scriptIdColumn', 'Not Used')
      .elementShouldNotBeVisible('#scriptCustomIdColumnIndex')
      .waitOnElementToBecomeInvisible('#scriptCustomIdColumnIndex')
      .click('#lblShowMoreScriptOptions') // Hide advanced options
      .waitOnElementToBecomeInvisible('#scriptIdColumn')

      // Test "Additional Data Transformation" for Script
      .elementShouldBeVisible('#lblShowAdditionalTransformation')
      .elementCheckBoxShouldNotBeSelected('#btnShowAdditionalTransformation')
      .elementShouldNotBeVisible('#transformationCodeEditor')
      .elementShouldNotBeVisible('#btnHelpWithTransformationAI') // Assumed ID

      // Expand "Additional Data Transformation"
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor')
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .elementShouldBeVisible('#btnHelpWithTransformationAI') // Assumed ID
      .codeJarShouldContainText('#transformationCodeEditor', '') // Check default empty content

      // Collapse "Additional Data Transformation"
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeInvisible('#transformationCodeEditor')
      .elementCheckBoxShouldNotBeSelected('#btnShowAdditionalTransformation')
      .elementShouldNotBeVisible('#btnHelpWithTransformationAI') // Assumed ID

    // Test XML Default Settings
    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.xmlfile')
      .waitOnElementToBecomeVisible('#xmlRepeatingNodeXPath')
      .inputShouldHaveValue('#xmlRepeatingNodeXPath', '')
      .elementCheckBoxShouldNotBeSelected('#btnShowMoreXmlOptions')
      .elementShouldNotBeVisible('#xmlIdColumnSelect')
      .elementShouldNotBeVisible('#xmlNamespaceMappings')
      .elementShouldNotBeVisible('#xmlIgnoreLeadingWhitespace');

    // Test XML advanced options
    ft = ft
      .click('#lblShowMoreXmlOptions')
      .waitOnElementToBecomeVisible('#xmlIdColumnSelect')
      .selectedOptionShouldContainText('#xmlIdColumnSelect', 'Not Used')
      .elementShouldNotBeVisible('#xmlIdColumnCustom')
      .inputShouldHaveValue('#xmlNamespaceMappings', '')
      .elementCheckBoxShouldBeSelected('#xmlIgnoreLeadingWhitespace')
      .dropDownSelectOptionHavingValue('#xmlIdColumnSelect', 'custom')
      .waitOnElementToBecomeVisible('#xmlIdColumnCustom')
      .inputShouldHaveValue('#xmlIdColumnCustom', '')
      .dropDownSelectOptionHavingValue('#xmlIdColumnSelect', 'notused')
      .waitOnElementToBecomeInvisible('#xmlIdColumnCustom')
      .click('#lblShowMoreXmlOptions') // Hide advanced options
      .waitOnElementToBecomeInvisible('#xmlIdColumnSelect')

    // Test "Additional Data Transformation" for XML
    ft = ft
      .elementShouldBeVisible('#lblShowAdditionalTransformation')
      .elementCheckBoxShouldNotBeSelected('#btnShowAdditionalTransformation')
      .elementShouldNotBeVisible('#transformationCodeEditor')
      .elementShouldNotBeVisible('#btnHelpWithTransformationAI')
      // Expand "Additional Data Transformation"
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor')
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .elementShouldBeVisible('#btnHelpWithTransformationAI')
      .codeJarShouldContainText('#transformationCodeEditor', '') // Check default empty content
      // Collapse "Additional Data Transformation"
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeInvisible('#transformationCodeEditor')
      .elementCheckBoxShouldNotBeSelected('#btnShowAdditionalTransformation')
      .elementShouldNotBeVisible('#btnHelpWithTransformationAI')

      // Return to CSV format to reset for other tests
      .dropDownSelectOptionHavingLabel('#dsTypes', 'CSV File');

    // Test Template/Output tab basic functionality and UI elements
    ft = ft
      .click('#tab-btn-reportingTemplateOutputTab')
      .waitOnElementToBecomeVisible('#reportOutputType')
      .selectedOptionShouldContainText('#reportOutputType', 'None')
      .elementShouldNotBeVisible('#btnAskAiForHelpOutput')
      .elementShouldNotBeVisible('#btnOpenTemplateGallery')
      .waitOnElementToBecomeVisible('#noneOutputTypeHelp')
      .elementShouldContainText(
        '#noneOutputTypeHelp',
        "Output Type 'None' is useful when you only need to send emails",
      )
      .waitOnElementToBecomeInvisible('#reportTemplateContainer')
      .elementShouldNotBeVisible('#reportTemplateContainer')
      // Test for help text presence when 'None' is selected
      // Test PDF output type
      .dropDownSelectOptionHavingLabel(
        '#reportOutputType',
        'PDF Docs (html_template2pdf_docs)',
      )
      .waitOnElementToBecomeVisible('#reportTemplateContainer')
      .waitOnElementToBecomeVisible('#btnAskAiForHelpOutput')
      .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor')
      .waitOnElementToBecomeVisible('#btnOpenTemplateGallery')
      .elementShouldNotBeVisible('#divTruncatedAbsoluteTemplateFolderPath')
      .elementShouldNotBeVisible('#btnCopyTemplatePathToClipboard')

      // Test preview toggle - should be visible by default
      .waitOnElementToBecomeVisible('#reportPreviewPane')
      .waitOnElementToBecomeVisible('#btnToggleHtmlPreviewHide')

      // Test hiding preview
      .click('#btnToggleHtmlPreviewHide')
      .waitOnElementToBecomeInvisible('#reportPreviewPane')
      .waitOnElementToBecomeVisible('#btnToggleHtmlPreviewShow')

      // Test showing preview again
      .click('#btnToggleHtmlPreviewShow')
      .waitOnElementToBecomeVisible('#reportPreviewPane')
      .waitOnElementToBecomeVisible('#btnToggleHtmlPreviewHide')

      // Test Excel output type
      .dropDownSelectOptionHavingLabel(
        '#reportOutputType',
        'Microsoft Excel Docs (html_template2xlsx_docs)',
      )
      .waitOnElementToBecomeVisible('#reportTemplateContainer')
      .waitOnElementToBecomeVisible('#reportPreviewPane')
      .waitOnElementToBecomeVisible('#btnAskAiForHelpOutput')
      .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor')
      .waitOnElementToBecomeVisible('#btnOpenTemplateGallery')
      .elementShouldNotBeVisible('#divTruncatedAbsoluteTemplateFolderPath')
      .elementShouldNotBeVisible('#btnCopyTemplatePathToClipboard')

      // Test HTML output type
      .dropDownSelectOptionHavingLabel(
        '#reportOutputType',
        'HTML Docs (html_template2html_docs)',
      )
      .waitOnElementToBecomeVisible('#reportTemplateContainer')
      .waitOnElementToBecomeVisible('#reportPreviewPane')
      .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor')
      .waitOnElementToBecomeVisible('#btnAskAiForHelpOutput')
      .waitOnElementToBecomeVisible('#btnOpenTemplateGallery')
      .elementShouldNotBeVisible('#divTruncatedAbsoluteTemplateFolderPath')
      .elementShouldNotBeVisible('#btnCopyTemplatePathToClipboard');

    // Test DOCX Output Type UI elements
    ft = ft
      .dropDownSelectOptionHavingValue('#reportOutputType', 'output.docx')
      .waitOnElementToBecomeVisible('#btnAskAiForHelpOutput')
      .waitOnElementToBecomeVisible('#btnOpenTemplateGallery')
      .waitOnElementToBecomeVisible('#reportTemplateContainer')
      .waitOnElementToBecomeVisible('#selectTemplateFile')
      .click('.ng-select-container') // Open dropdown to see "no templates found" message
      .waitOnElementToBecomeVisible('#noDocxTemplatesFound')
      .waitOnElementToBecomeVisible('#noDocxTemplatesFoundCode')
      .elementShouldContainText(
        '#noDocxTemplatesFoundCode',
        'templates/reports/payslips',
      )
      .pressKey('Escape') // Close the dropdown
      .waitOnElementToBecomeVisible('#divTruncatedAbsoluteTemplateFolderPath')
      .elementShouldBeVisible('#divTruncatedAbsoluteTemplateFolderPath')
      .elementShouldContainText(
        '#divTruncatedAbsoluteTemplateFolderPath',
        `templates/reports/${folderName}`,
      )
      .elementShouldBeVisible('#btnCopyTemplatePathToClipboard')
      .click('#btnCopyTemplatePathToClipboard')
      .waitOnElementWithTextToBecomeVisible('Copied to clipboard');

    // Reset to None for clean state
    ft = ft
      .dropDownSelectOptionHavingLabel('#reportOutputType', 'None')
      .waitOnElementToBecomeInvisible('#btnAskAiForHelpOutput')
      .waitOnElementToBecomeInvisible('#reportTemplateContainer')
      .waitOnElementToBecomeInvisible('#btnOpenTemplateGallery')
      .waitOnElementToBecomeInvisible('#selectTemplateFile');

    ft = ft
      .click('#tab-btn-reportingTabulatorTab')
      .waitOnElementToBecomeVisible('#noDataTabulator')
      .click('#tab-btn-reportingTemplateOutputTab')
      .waitOnElementToBecomeVisible('#reportOutputType')
      .selectedOptionShouldContainText('#reportOutputType', 'None')

    return ft;
  }

  static changeSaveLoadAssertSavedReportingConfiguration(
    ft: FluentTester,
    folderName: string,
    reportOutputType: string,
    galleryTemplateCount: number,
  ): FluentTester {
    // Global counter for all text/numeric fields
    let globalCounter = 1;

    const uniqueTimestamp = Date.now();
    let lastSetTransformationValue = '';

    // --- Define unique values for new fields ---
    const uniqueSqlValue = `SELECT column_a, column_b FROM your_table WHERE created_at > '${uniqueTimestamp}';`;
    const uniqueScriptValue = `// Unique Groovy Script Content ${uniqueTimestamp}\ndef currentTime = ${uniqueTimestamp}\nprintln "Executing script at: " + currentTime`;

    const sqlIdColumnCustomIndex = `${(uniqueTimestamp % 3) + 1}`; // e.g., 1, 2, or 3
    const scriptIdColumnCustomIndex = `${(uniqueTimestamp % 3) + 2}`; // e.g., 2, 3, or 4 to be different

    // First, handle the datasource tab
    ft = ConfigurationTestHelper.loadConfiguration(ft, folderName)
      .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
      .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
      .click('#leftMenuReportingSettings')
      .waitOnElementToBecomeVisible('#tab-btn-reportingDataSourceDataTablesTab')
      .waitOnElementToBecomeEnabled('#tab-btn-reportingDataSourceDataTablesTab')
      .click('#tab-btn-reportingDataSourceDataTablesTab')
      .waitOnElementToBecomeVisible('#dsTypes')
      .waitOnElementToBecomeEnabled('#dsTypes');

    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.csvfile')
      .waitOnElementToBecomeVisible('#separatorChar')
      // Verify separator is editable for CSV
      .elementShouldNotHaveAttribute('#separatorChar', 'readonly')
      // Set separator char to deterministic value using global counter
      .setValue('#separatorChar', `Field Value ${globalCounter++}`)
      // Select "Multiline" for header so we can set skipLines
      .dropDownSelectOptionHavingValue('#selectHeader', 'multiline')

      // Set Skip Lines value - should be enabled with multiline
      .setValue('#skipLines', `${globalCounter++}`)

      // Show more CSV options to access additional settings
      .click('#lblShowMoreCsvOptions')

      // Set ID Column to "Not Used"
      .dropDownSelectOptionHavingValue('#csvIdColumn', 'notused')

      // Set text values for quotation and escape characters
      .setValue('#quotationChar', `Field Value ${globalCounter++}`)
      .setValue('#escapeChar', `Field Value ${globalCounter++}`)

      // Set checkbox states using the new API
      .setCheckboxState('#btnStrictQuotations', globalCounter++ % 2 === 0)
      .setCheckboxState('#btnIgnoreQuotations', globalCounter++ % 2 === 0)
      .setCheckboxState(
        '#btnIgnoreLeadingWhitespace',
        globalCounter++ % 2 === 0,
      ) // Set Additional Transformation (shared, so set once, assert many times)
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor');

    // Start with CSV datasource to verify separator is editable
    const csvTransformationValue = `// CSV Transformation ${uniqueTimestamp}-${globalCounter++}`;

    ft = ft
      .setCodeJarContent('#transformationCodeEditor', csvTransformationValue)
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation') // Verify it's checked after click/set
      .click('#lblShowAdditionalTransformation'); // Collapse

    lastSetTransformationValue = csvTransformationValue;

    // Store expected values for later verification of both CSV and TSV (since they share the model)
    const csvTsvSeparatorCharValue = 'Field Value 1';
    const csvTsvSkipLinesValue = '2';
    const csvTsvQuotationCharValue = 'Field Value 3';
    const csvTsvEscapeCharValue = 'Field Value 4';
    const csvTsvStrictQuotationsState = 5 % 2 === 0; // true
    const csvTsvIgnoreQuotationsState = 6 % 2 === 0; // false
    const csvTsvIgnoreLeadingWhitespaceState = 7 % 2 === 0; // true

    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.tsvfile')
      .waitOnElementToBecomeReadonly('#separatorChar')
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor');

    // Change to TSV to verify the readonly separator char (the only difference)
    const tsvTransformationValue = `// TSV Transformation ${uniqueTimestamp}-${globalCounter++}`;

    ft = ft
      .setCodeJarContent('#transformationCodeEditor', tsvTransformationValue)
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .click('#lblShowAdditionalTransformation'); // Collapse
    lastSetTransformationValue = tsvTransformationValue;

    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.csvfile')
      .waitOnElementToBecomeEditable('#separatorChar')
      .setValue('#separatorChar', csvTsvSeparatorCharValue);

    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.fixedwidthfile')

      // Set column definitions using the specified format
      .setValue(
        '#fixedWidthColumns',
        `Column 1, 10\nColumn 2, 20\nColumn 3, 15`,
      )
      // Select "No Header" option for Fixed Width Header dropdown
      .dropDownSelectOptionHavingValue('#selectFixedWidthHeader', 'noheader')

      // Show more Fixed Width options to access additional settings
      .click('#lblShowMoreFixedWidthOptions')

      // Set ID Column to "Not Used" (consistent with requirement)
      .waitOnElementToBecomeVisible('#fixedWidthIdColumn')
      .dropDownSelectOptionHavingValue('#fixedWidthIdColumn', 'notused')

      // Set Trim Whitespaces checkbox state using global counter for deterministic testing
      .setCheckboxState(
        '#btnFixedWidthIgnoreLeadingWhitespace',
        globalCounter++ % 2 === 0,
      ) // Set Additional Transformation for Fixed Width
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor');

    // Change to Fixed Width datasource and test its settings
    const fwTransformationValue = `// Fixed Width Transformation ${uniqueTimestamp}-${globalCounter++}`;

    ft = ft
      .setCodeJarContent('#transformationCodeEditor', fwTransformationValue)
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .click('#lblShowAdditionalTransformation'); // Collapse

    lastSetTransformationValue = fwTransformationValue;

    // Store expected values for Fixed Width verification
    const fixedWidthColumnsValue = 'Column 1, 10\nColumn 2, 20\nColumn 3, 15';
    const fixedWidthSkipLinesValue = '0'; // Always 0 for noheader, regardless of what we tried to set
    const fixedWidthIgnoreLeadingWhitespaceState = 8 % 2 === 0; // false

    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.excelfile')
      // Excel options
      .dropDownSelectOptionHavingValue('#selectExcelHeader', 'multiline')
      .setValue('#excelSkipLines', `${globalCounter++}`)
      .setValue('#excelSheetIndex', `${globalCounter++}`)
      // Excel toggle options - set specific state
      .click('#lblShowMoreExcelOptions')
      // Excel dropdown and numeric - use counter
      .dropDownSelectOptionHavingValue('#excelIdColumn', 'custom')
      .setValue('#excelCustomIdColumnIndex', `${globalCounter++}`)
      // More Excel toggle options - set specific states
      .setCheckboxState('#btnExcelIgnoreLeadingWhitespace', true)
      .setCheckboxState('#btnExcelUseFormulaResults', true) // Set Additional Transformation for Excel
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor');

    // Change to Excel
    const excelTransformationValue = `// Excel Transformation ${uniqueTimestamp}-${globalCounter++}`;

    ft = ft
      .setCodeJarContent('#transformationCodeEditor', excelTransformationValue)
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .click('#lblShowAdditionalTransformation'); // Collapse
    lastSetTransformationValue = excelTransformationValue;

    // Store expected values for Excel verification
    const excelSkipLinesValue = '12';
    const excelSheetIndexValue = '13';
    const excelCustomIdColumnIndexValue = '14';

    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.sqlquery')
      .waitOnElementToBecomeVisible('#sqlQueryEditor')
      .setCodeJarContent('#sqlQueryEditor', uniqueSqlValue)
      // .dropDownSelectOptionHavingValue('#databaseConnection', 'yourTestConnectionCode') // If testing with a connection
      .click('#lblShowMoreSqlOptions')
      .waitOnElementToBecomeVisible('#sqlIdColumn')
      .dropDownSelectOptionHavingValue('#sqlIdColumn', 'custom')
      .waitOnElementToBecomeVisible('#sqlCustomIdColumnIndex')
      .setValue('#sqlCustomIdColumnIndex', sqlIdColumnCustomIndex)
      .click('#lblShowMoreSqlOptions') // Collapse "Show More"
      // Set Additional Transformation for SQL Query
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor');

    // --- SQL Query (New Input Type) ---
    const sqlTransformationValue = `// SQL Transformation ${uniqueTimestamp}-${globalCounter++}`;

    ft = ft
      .setCodeJarContent('#transformationCodeEditor', sqlTransformationValue)
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .click('#lblShowAdditionalTransformation'); // Collapse

    lastSetTransformationValue = sqlTransformationValue;

    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.scriptfile')
      .waitOnElementToBecomeVisible('#groovyScriptEditor')
      .setCodeJarContent('#groovyScriptEditor', uniqueScriptValue)
      // .dropDownSelectOptionHavingValue('#scriptDatabaseConnection', 'yourTestConnectionCode') // If testing with a connection
      .sleep(Constants.DELAY_ONE_SECOND) // Wait for script editor to be ready
      .click('#lblShowMoreScriptOptions')
      .waitOnElementToBecomeVisible('#scriptIdColumn')
      .dropDownSelectOptionHavingValue('#scriptIdColumn', 'custom')
      .waitOnElementToBecomeVisible('#scriptCustomIdColumnIndex')
      .setValue('#scriptCustomIdColumnIndex', scriptIdColumnCustomIndex)
      .click('#lblShowMoreScriptOptions') // Collapse "Show More"
      // Set Additional Transformation for Script
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor');

    // --- Script (New Input Type) ---
    const scriptTransformationValue = `// Script Transformation ${uniqueTimestamp}-${globalCounter++}`;

    ft = ft
      .setCodeJarContent('#transformationCodeEditor', scriptTransformationValue)
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .click('#lblShowAdditionalTransformation'); // Collapse

    // --- XML File (New Input Type) ---
    const uniqueXmlRepeatingNodeXPath = `/invoices/invoice[${uniqueTimestamp}]`;
    const uniqueXmlIdColumnCustom = `@invoiceID_${uniqueTimestamp}`;
    const uniqueXmlNamespaceMappings = `inv=http://my-company.com/invoices/${uniqueTimestamp}`;
    const xmlIgnoreLeadingWhitespaceState = globalCounter++ % 2 === 0;

    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.xmlfile')
      .waitOnElementToBecomeVisible('#xmlRepeatingNodeXPath')
      .setValue('#xmlRepeatingNodeXPath', uniqueXmlRepeatingNodeXPath)
      .click('#lblShowMoreXmlOptions')
      .waitOnElementToBecomeVisible('#xmlIdColumnSelect')
      .dropDownSelectOptionHavingValue('#xmlIdColumnSelect', 'custom')
      .waitOnElementToBecomeVisible('#xmlIdColumnCustom')
      .setValue('#xmlIdColumnCustom', uniqueXmlIdColumnCustom)
      .setValue('#xmlNamespaceMappings', uniqueXmlNamespaceMappings)
      .setCheckboxState(
        '#xmlIgnoreLeadingWhitespace',
        xmlIgnoreLeadingWhitespaceState,
      )
      .click('#lblShowMoreXmlOptions') // Collapse "Show More"
      // Set Additional Transformation for XML
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor');

    const xmlTransformationValue = `// XML Transformation ${uniqueTimestamp}-${globalCounter++}`;
    ft = ft
      .setCodeJarContent('#transformationCodeEditor', xmlTransformationValue)
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .click('#lblShowAdditionalTransformation'); // Collapse

    lastSetTransformationValue = xmlTransformationValue;

    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.csvfile')
      .waitOnToastToBecomeVisible('info', 'Saved')
      .waitOnElementToBecomeEditable('#separatorChar')
      .setValue('#separatorChar', csvTsvSeparatorCharValue)
      .waitOnToastToBecomeVisible('info', 'Saved');

    // Now move to Template Output tab
    ft = ft.click('#tab-btn-reportingTemplateOutputTab').sleep(2 * Constants.DELAY_ONE_SECOND);

    // Define HTML-based output types (exclude DOCX)
    const htmlBasedOutputTypes = ['output.pdf', 'output.xlsx', 'output.html', 'output.fop2pdf', 'output.any'];

    // Log the output type being used (passed from outside)
    ft = ft.consoleLog(
      `Using output type: ${reportOutputType} for gallery test`,
    );

    // First switch to our output type for gallery test
    ft = ft
      .dropDownSelectOptionHavingValue('#reportOutputType', reportOutputType)
      .waitOnElementToBecomeVisible('#reportTemplateContainer');

    // Test the gallery for the specified output type
    ft = ft
      .waitOnElementToBecomeVisible('#btnOpenTemplateGallery')
      .waitOnElementToBecomeEnabled('#btnOpenTemplateGallery')
      .click('#btnOpenTemplateGallery')
      // If there are initial instructions, confirm them
      //.waitOnElementToBecomeVisible('#btnConfirmAiGalleryInstructions')
      //.click('#btnConfirmAiGalleryInstructions')
      // Wait for template gallery to load
      .waitOnElementToBecomeVisible('.dp-carousel-next')
      .waitOnElementToBecomeEnabled('.dp-carousel-next');

    // Choose a random template from the available ones
    const randomTemplateIndex =
      Math.floor(Math.random() * galleryTemplateCount) + 1;
    ft = ft.consoleLog(
      `Will select random template #${randomTemplateIndex} from gallery`,
    );

    // Navigate to that random template (if not already on the first one)
    if (randomTemplateIndex > 1) {
      for (let i = 1; i < randomTemplateIndex; i++) {
        ft = ft.click('.dp-carousel-next').sleep(Constants.DELAY_HALF_SECOND);
      }
    }

    // Use the selected template
    ft = ft
      .click('#btnUseSelectedTemplate')
      .clickYesDoThis()
      .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor');

    // a) Verify template is correctly loaded in the code editor
    ft = ft.codeJarShouldContainText('#codeJarHtmlTemplateEditor', '<html');

    // b) Verify the template is correctly previewed in the iframe
    if (reportOutputType !== 'output.fop2pdf' && reportOutputType !== 'output.any') {
      ft = ft
        .waitOnElementToBecomeVisible('#reportPreviewPane')
        .elementShouldBeVisible('#reportPreviewPane');

      // c) Test view in browser button
      ft = ft
        .click('#btnViewHtmlInBrowser')
        // When view in browser is clicked, we stay on the same page
        // so we need to check that the view still exists
        .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor');

      // Test the preview toggle functionality
      ft = ft
        .elementShouldBeVisible('#btnToggleHtmlPreviewHide')
        .click('#btnToggleHtmlPreviewHide')
        .waitOnElementToBecomeVisible('#btnToggleHtmlPreviewShow')
        .waitOnElementToBecomeInvisible('#reportPreviewPane')
        .elementShouldNotBeVisible('#reportPreviewPane')
        .click('#btnToggleHtmlPreviewShow')
        .waitOnElementToBecomeVisible('#reportPreviewPane')
        .waitOnElementToBecomeVisible('#btnToggleHtmlPreviewHide')
        .elementShouldBeVisible('#reportPreviewPane');

      // Test the splitter functionality
      ft = ft
        .elementShouldBeVisible('.as-split-gutter-icon')
        .click('.as-split-gutter-icon')
        .hover('.as-split-gutter-icon')
        .hover('#codeJarHtmlTemplateEditor')
        .hover('#reportPreviewPane');
    }
    else
      ft = ft
        .elementShouldNotBeVisible('#reportPreviewPane');

    // For the other HTML-based output types, set simple HTML content
    const remainingHtmlOutputTypes = htmlBasedOutputTypes.filter(
      (type) => type !== reportOutputType,
    );
    for (const outputType of remainingHtmlOutputTypes) {
      ft = ft
        .dropDownSelectOptionHavingValue('#reportOutputType', outputType)
        .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor')
        .sleep(Constants.DELAY_ONE_SECOND)
        // Use setCodeJarContent instead of keyboard simulation
        .setCodeJarContent(
          '#codeJarHtmlTemplateEditor',
          `<html><body><h1>Hello ${outputType}</h1></body></html>`,
        )

      if (outputType in ['output.any', 'output.fop2pdf']) {
        ft = ft
          .elementShouldNotBeVisible('#reportPreviewPane');

      }

      // Wait for preview to update
      ft = ft.sleep(Constants.DELAY_ONE_SECOND);

    }

    // Now test the DOCX output type specifically
    ft = ft
      .dropDownSelectOptionHavingValue('#reportOutputType', 'output.docx')
      .waitOnElementToBecomeVisible('#selectTemplateFile')
      .selectNgOption('#selectTemplateFile', 'payslips-template.docx');

    // Test trying to use HTML template with DOCX output type
    ft = ft
      .waitOnElementToBecomeVisible('#btnOpenTemplateGallery')
      .click('#btnOpenTemplateGallery')
      // If there are initial instructions, confirm them
      //.waitOnElementToBecomeVisible('#btnConfirmAiGalleryInstructions')
      //.click('#btnConfirmAiGalleryInstructions')
      // Wait for gallery to load and try to use first template
      .waitOnElementToBecomeVisible('.dp-carousel-next')
      .click('#btnUseSelectedTemplate')
      .clickYesDoThis()
      .waitOnToastToBecomeVisible(
        'warning',
        'HTML templates cannot be used with DOCX output type',
      )
      // .click('#btnCloseTemplateGalleryX')
      .sleep(Constants.DELAY_TEN_SECONDS); // Wait for the value to be set

    ft = ConfigurationTestHelper.loadConfiguration(ft, folderName)
      .waitOnElementToBecomeVisible('#leftMenuReportingSettings')
      .waitOnElementToBecomeEnabled('#leftMenuReportingSettings')
      .click('#leftMenuReportingSettings')
      .waitOnElementToBecomeVisible('#tab-btn-reportingDataSourceDataTablesTab')
      .click('#tab-btn-reportingDataSourceDataTablesTab');

    // Verify the CSV datasource settings were correctly saved
    ft = ft
      //.dropDownSelectOptionHavingValue('#dsTypes', 'ds.csvfile')
      // Verify separator char
      .dropDownShouldHaveSelectedOption('#dsTypes', 'ds.csvfile')
      .waitOnElementToBecomeVisible('#separatorChar')
      .inputShouldHaveValue('#separatorChar', csvTsvSeparatorCharValue)
      // Verify "Show More Options" is checked
      .click('#lblShowMoreCsvOptions')
      .elementCheckBoxShouldBeSelected('#btnShowMoreCsvOptions')
      // Verify ID Column is "notused" (by checking custom input is not visible)
      .elementShouldNotBeVisible('#csvCustomIdColumnIndex')
      // Verify quotation char and escape char
      .inputShouldHaveValue('#quotationChar', csvTsvQuotationCharValue)
      .inputShouldHaveValue('#escapeChar', csvTsvEscapeCharValue);

    // Verify checkboxes based on calculated states
    if (csvTsvStrictQuotationsState) {
      ft = ft.elementCheckBoxShouldBeSelected('#btnStrictQuotations');
    } else {
      ft = ft.elementCheckBoxShouldNotBeSelected('#btnStrictQuotations');
    }

    if (csvTsvIgnoreQuotationsState) {
      ft = ft.elementCheckBoxShouldBeSelected('#btnIgnoreQuotations');
    } else {
      ft = ft.elementCheckBoxShouldNotBeSelected('#btnIgnoreQuotations');
    }

    if (csvTsvIgnoreLeadingWhitespaceState) {
      ft = ft.elementCheckBoxShouldBeSelected('#btnIgnoreLeadingWhitespace');
    } else {
      ft = ft.elementCheckBoxShouldNotBeSelected('#btnIgnoreLeadingWhitespace');
    }

    // Assert Additional Transformation for CSV (should have the last set value)
    ft = ft
      .click('#lblShowMoreCsvOptions')
      .click('#lblShowAdditionalTransformation')
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor')
      .codeJarShouldContainText(
        '#transformationCodeEditor',
        lastSetTransformationValue,
      )
      .click('#lblShowAdditionalTransformation');

    // Verify TSV datasource settings - only check TSV-specific aspects
    // (readonly separator and that it retained the multiline header option)
    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.tsvfile')
      // Verify separator is readonly for TSV
      .waitOnElementToBecomeReadonly('#separatorChar')
      // Verify header dropdown for TSV
      .dropDownShouldHaveSelectedOption('#selectHeader', 'multiline')
      // Verify skipLines value
      .inputShouldHaveValue('#skipLines', csvTsvSkipLinesValue);

    // Assert Additional Transformation for CSV (should have the last set value)
    ft = ft
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor')
      .codeJarShouldContainText(
        '#transformationCodeEditor',
        lastSetTransformationValue,
      )
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .click('#lblShowAdditionalTransformation');

    // Verify Fixed Width datasource settings were correctly saved
    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.fixedwidthfile')
      .waitOnElementToBecomeVisible('#fixedWidthColumns')
      // Verify columns text content
      .inputShouldHaveValue('#fixedWidthColumns', fixedWidthColumnsValue)
      // Verify header dropdown option
      .dropDownShouldHaveSelectedOption('#selectFixedWidthHeader', 'noheader')
      // Verify skip lines is 0 and disabled (as expected with noheader)
      .inputShouldHaveValue('#fixedWidthSkipLines', fixedWidthSkipLinesValue)
      // Verify "Show More Options" is checked
      .click('#lblShowMoreFixedWidthOptions')
      .elementCheckBoxShouldBeSelected('#btnShowMoreFixedWidthOptions')
      // Verify ID Column is "notused"
      .dropDownShouldHaveSelectedOption('#fixedWidthIdColumn', 'notused')
      // Verify Trim Whitespaces checkbox state
      .elementShouldBeVisible('#btnFixedWidthIgnoreLeadingWhitespace');

    // Verify Fixed Width checkbox state based on calculated value
    if (fixedWidthIgnoreLeadingWhitespaceState) {
      ft = ft.elementCheckBoxShouldBeSelected(
        '#btnFixedWidthIgnoreLeadingWhitespace',
      );
    } else {
      ft = ft.elementCheckBoxShouldNotBeSelected(
        '#btnFixedWidthIgnoreLeadingWhitespace',
      );
    }

    // Assert Additional Transformation for CSV (should have the last set value)
    ft = ft
      .click('#lblShowMoreFixedWidthOptions')
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor')
      .codeJarShouldContainText(
        '#transformationCodeEditor',
        lastSetTransformationValue,
      )
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .click('#lblShowAdditionalTransformation');

    // Excel - verify values
    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.excelfile')
      .waitOnElementToBecomeVisible('#excelSkipLines')
      .inputShouldHaveValue('#excelSkipLines', excelSkipLinesValue)
      .inputShouldHaveValue('#excelSheetIndex', excelSheetIndexValue)
      .click('#lblShowMoreExcelOptions')
      .elementCheckBoxShouldBeSelected('#btnShowMoreExcelOptions')
      .inputShouldHaveValue(
        '#excelCustomIdColumnIndex',
        excelCustomIdColumnIndexValue,
      )
      .elementCheckBoxShouldBeSelected('#btnExcelIgnoreLeadingWhitespace')
      .elementCheckBoxShouldBeSelected('#btnExcelUseFormulaResults');

    // Assert Additional Transformation for CSV (should have the last set value)
    ft = ft
      .click('#lblShowMoreExcelOptions')
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor')
      .codeJarShouldContainText(
        '#transformationCodeEditor',
        lastSetTransformationValue,
      )
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .click('#lblShowAdditionalTransformation');

    // --- Assert SQL Query (New Input Type) ---
    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.sqlquery')
      .waitOnElementToBecomeVisible('#sqlQueryEditor')
      .codeJarShouldContainText('#sqlQueryEditor', uniqueSqlValue)
      // .selectedOptionShouldContainText('#databaseConnection', 'Your Test Connection Name') // If asserting
      .click('#lblShowMoreSqlOptions')
      .waitOnElementToBecomeVisible('#sqlIdColumn')
      .elementCheckBoxShouldBeSelected('#btnShowMoreSqlOptions')
      .selectedOptionShouldContainText('#sqlIdColumn', 'Custom Column Index...')
      .waitOnElementToBecomeVisible('#sqlCustomIdColumnIndex')
      .inputShouldHaveValue('#sqlCustomIdColumnIndex', sqlIdColumnCustomIndex)
      .click('#lblShowMoreSqlOptions') // Collapse
      // Assert Additional Transformation for SQL Query (should have the last set value)
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor')
      .codeJarShouldContainText(
        '#transformationCodeEditor',
        lastSetTransformationValue,
      )
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .click('#lblShowAdditionalTransformation');

    // --- Assert Script (New Input Type) ---
    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.scriptfile')
      .sleep(3 * Constants.DELAY_ONE_SECOND) 
      .waitOnElementToBecomeVisible('#groovyScriptEditor')
      .codeJarShouldContainText('#groovyScriptEditor', uniqueScriptValue)
      // .selectedOptionShouldContainText('#scriptDatabaseConnection', 'Your Test Connection Name') // If asserting
      .click('#lblShowMoreScriptOptions')
      .waitOnElementToBecomeVisible('#scriptIdColumn')
      .elementCheckBoxShouldBeSelected('#btnShowMoreScriptOptions')
      .selectedOptionShouldContainText(
        '#scriptIdColumn',
        'Custom Column Index...',
      )
      .waitOnElementToBecomeVisible('#scriptCustomIdColumnIndex')
      .inputShouldHaveValue(
        '#scriptCustomIdColumnIndex',
        scriptIdColumnCustomIndex,
      )




      .click('#lblShowMoreScriptOptions') // Collapse
      // Assert Additional Transformation for Script (should have the last set value)
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor')
      .codeJarShouldContainText(
        '#transformationCodeEditor',
        lastSetTransformationValue,
      )
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .click('#lblShowAdditionalTransformation');

    // --- Assert XML (New Input Type) ---
    ft = ft
      .dropDownSelectOptionHavingValue('#dsTypes', 'ds.xmlfile')
      .waitOnElementToBecomeVisible('#xmlRepeatingNodeXPath')
      .inputShouldHaveValue('#xmlRepeatingNodeXPath', uniqueXmlRepeatingNodeXPath)
      .click('#lblShowMoreXmlOptions')
      .waitOnElementToBecomeVisible('#xmlIdColumnSelect')
      .elementCheckBoxShouldBeSelected('#btnShowMoreXmlOptions')
      .selectedOptionShouldContainText(
        '#xmlIdColumnSelect',
        'Custom XPath Expression...',
      )
      .waitOnElementToBecomeVisible('#xmlIdColumnCustom')
      .inputShouldHaveValue('#xmlIdColumnCustom', uniqueXmlIdColumnCustom)
      .inputShouldHaveValue('#xmlNamespaceMappings', uniqueXmlNamespaceMappings);

    if (xmlIgnoreLeadingWhitespaceState) {
      ft = ft.elementCheckBoxShouldBeSelected('#xmlIgnoreLeadingWhitespace');
    } else {
      ft = ft.elementCheckBoxShouldNotBeSelected('#xmlIgnoreLeadingWhitespace');
    }

    ft = ft
      .click('#lblShowMoreXmlOptions') // Collapse
      // Assert Additional Transformation for XML (should have the last set value)
      .click('#lblShowAdditionalTransformation')
      .waitOnElementToBecomeVisible('#transformationCodeEditor')
      .codeJarShouldContainText(
        '#transformationCodeEditor',
        lastSetTransformationValue,
      )
      .elementCheckBoxShouldBeSelected('#btnShowAdditionalTransformation')
      .click('#lblShowAdditionalTransformation');

    // Verify the template output settings
    ft = ft.click('#tab-btn-reportingTemplateOutputTab');

    // IMPROVED: First check the gallery-selected template (should have complex HTML content)
    ft = ft
      .waitOnElementToBecomeVisible('#reportOutputType')
      .dropDownShouldHaveSelectedOption('#reportOutputType', 'output.docx')
      .elementShouldContainText('.ng-value', 'payslips-template.docx')
      .dropDownSelectOptionHavingValue('#reportOutputType', reportOutputType)
      .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor')
      .sleep(3 * Constants.DELAY_ONE_SECOND)
      // Verify it starts with <html, this confirms it's HTML content
      .codeJarShouldContainText('#codeJarHtmlTemplateEditor', '<html')
      // Verify it contains other HTML structural elements (more robust than just checking for <html)
      .codeJarShouldContainText('#codeJarHtmlTemplateEditor', '<body')
      .codeJarShouldContainText('#codeJarHtmlTemplateEditor', '<head');

    // <style> check only for output types that use rich HTML templates (not xlsx which uses a skeleton)
    if (reportOutputType !== 'output.xlsx') {
      ft = ft.codeJarShouldContainText('#codeJarHtmlTemplateEditor', '<style');
    }

    ft = ft
      // Make sure the preview is visible, confirming template renders correctly
      .elementShouldBeVisible('#reportPreviewPane')
      .sleep(Constants.DELAY_ONE_SECOND); // Wait for the value to be set

    for (const outputType of remainingHtmlOutputTypes) {
      ft = ft
        .dropDownSelectOptionHavingValue('#reportOutputType', outputType)
        .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor')
        .sleep(3 * Constants.DELAY_ONE_SECOND)
        .waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor')
        // Verify the exact content matches our simple template format
        .codeJarShouldContainText(
          '#codeJarHtmlTemplateEditor',
          `<html><body><h1>Hello ${outputType}</h1></body></html>`,
        )
        .sleep(Constants.DELAY_ONE_SECOND); // Wait for the value to be set
    }

    return ft;
  }

  static assertTemplateOutputAIHelpFeatures(
    ft: FluentTester,
    outputTypeCode: string,
  ): FluentTester {
    // Map output type codes to their dropdown label equivalents
    const outputTypeLabels = {
      'output.pdf': 'PDF Docs (html_template2pdf_docs)',
      'output.xlsx': 'Microsoft Excel Docs (html_template2xlsx_docs)',
      'output.html': 'HTML Docs (html_template2html_docs)',
      'output.docx': 'Microsoft Word Docs (docx_template2docx_docs)',
      'output.fop2pdf': 'PDF FOP Docs (fop_template2pdf_docs)',
      'output.any': 'XML/Any Docs (freemarker_template2any_docs)',
      'output.none': 'None',
    };

    // We're already on the template output tab, select the requested output type
    ft = ft
      .waitOnElementToBecomeVisible('#reportOutputType')
      .dropDownSelectOptionHavingLabel(
        '#reportOutputType',
        outputTypeLabels[outputTypeCode],
      )
      ;

    // Wait for appropriate element based on output type
    if (outputTypeCode === 'output.docx') {
      ft = ft.waitOnElementToBecomeVisible('#selectTemplateFile');
    } else {
      if (outputTypeCode !== 'output.none') {
        ft = ft.waitOnElementToBecomeVisible('#btnAskAiForHelpOutput').waitOnElementToBecomeVisible('#codeJarHtmlTemplateEditor');
      }
    }

    // Step 2: Test "Hey AI" workflow
    if (outputTypeCode !== 'output.none') {
      ft = ft.elementShouldContainText(
        '#btnAskAiForHelpOutput',
        'Hey AI, Help Me',
      );
      ft = ft.click('#btnAskAiForHelpOutput')
        .waitOnElementToBecomeVisible('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeEnabled('#btnCloseAiCopilotModal');
    }

    if (outputTypeCode === 'output.pdf') {
      ft = ft.waitOnElementToBecomeVisible('#btnCopyPromptText');

      ft = ft
        .click('#btnCopyPromptText')
        .waitOnConfirmDialogToBecomeVisible()
        .click('.dburst-button-question-confirm:visible')
        .waitOnConfirmDialogToBecomeInvisible();

      ft = ft.clipboardShouldContainText(
        'conversion to a PDF report using OpenHTMLToPDF',
      );
    }

    if (outputTypeCode === 'output.xlsx') {
      ft = ft.waitOnElementToBecomeVisible('#btnCopyPromptText');

      ft = ft
        .click('#btnCopyPromptText')
        .waitOnConfirmDialogToBecomeVisible()
        .click('.dburst-button-question-confirm:visible')
        .waitOnConfirmDialogToBecomeInvisible();

      ft = ft.clipboardShouldContainText(
        'conversion to an Excel spreadsheet using html-exporter',
      );
    }

    if (outputTypeCode === 'output.html') {
      ft = ft.waitOnElementToBecomeVisible('#btnCopyPromptText');

      ft = ft
        .click('#btnCopyPromptText')
        .waitOnConfirmDialogToBecomeVisible()
        .click('.dburst-button-question-confirm:visible')
        .waitOnConfirmDialogToBecomeInvisible();

      ft = ft.clipboardShouldContainText(
        'You are tasked with creating a professional HTML template',
      );
    }

    if (outputTypeCode !== 'output.none') {
      return ft
        .click('#btnCloseAiCopilotModal')
        .waitOnElementToBecomeInvisible('#btnCloseAiCopilotModal');
    }

    return ft;
  }

  static assertTemplateOutputGalleryFeatures(
    ft: FluentTester,
    outputTypeCode: string,
    galleryTemplateCount: number,
  ): FluentTester {
    if (outputTypeCode === 'output.none') return ft;
    ft = ft
      .waitOnElementToBecomeVisible('#btnOpenTemplateGallery')
      .click('#btnOpenTemplateGallery')
      //.waitOnElementToBecomeVisible('#aiInstructionsContainer')
      //.elementShouldBeVisible('#aiInstructionsContent')
      //.waitOnElementToBecomeVisible('#btnConfirmAiGalleryInstructions')
      //.click('#btnConfirmAiGalleryInstructions')
      .waitOnElementToBecomeVisible('.dp-carousel-next')
      .pageShouldContainText('View Template'); // Verify at least one template exists

    // Calculate random template index based on provided count
    const randomTemplateIndex =
      Math.floor(Math.random() * galleryTemplateCount) + 1;

    ft = ft.consoleLog(
      `Will browse ${galleryTemplateCount} templates and test random template #${randomTemplateIndex}`,
    );

    // Assert the first template's title before starting navigation
    ft = ft
      .elementShouldContainText('#galleryDialogTitle', 'Examples (Gallery)')
      .elementShouldBeVisible('.template-tags');

    // Navigate through all templates
    for (let i = 1; i < galleryTemplateCount; i++) {
      if (outputTypeCode === 'output.xlsx') {
        ft = ft.waitOnElementToBecomeVisible(
          '.template-tags span.tag-badge:text("excel")',
        );
      } else
        ft = ft.elementShouldNotBeVisible(
          '.template-tags span.tag-badge:text("excel")',
        );

      ft = ft
        .click('.dp-carousel-next')
        .waitOnElementToBecomeVisible('.template-footer')
        // Verify each template has a title and tags
        .elementShouldContainText('#galleryDialogTitle', 'Examples (Gallery)')
        .elementShouldBeVisible('.template-tags');

      // When we reach our randomly selected template, test all interactive elements
      if (i === randomTemplateIndex) {
        // Test zoom controls for the random template
        ft = ft.elementShouldBeVisible('.iframe-zoom-controls');
        //not uniquely identifiable, so we skip for now
        //.click('.iframe-zoom-controls button[title="Zoom In"]:visible')
        //.click('.iframe-zoom-controls button[title="Zoom Out"]:visible')
        //.click('.iframe-zoom-controls button[title="Reset Zoom"]:visible');

        // Step 4: Test "Get AI Prompt" functionality for modify
        ft = ft
          .elementShouldBeVisible('#btnGetAiPrompt')
          .click('#btnGetAiPrompt')
          .waitOnElementToBecomeVisible('#aiPromptContainer')
          .waitOnElementToBecomeVisible('#aiPromptContent')
          .elementShouldContainText(
            '#aiPromptSteps',
            'Tailor Customization Instructions',
          )
          .waitOnElementToBecomeVisible('#btnCopyTemplatePromptToClipboardTop')
          .click('#btnCopyTemplatePromptToClipboardTop')
          .waitOnElementWithTextToBecomeVisible('Copied to clipboard')
          .waitOnElementToBecomeVisible('#btnBackToTemplate')
          .click('#btnBackToTemplate')
          .waitOnElementToBecomeVisible('#galleryTemplateCarousel');

        // Step 5: Test "Get AI Prompt" with rebuild option
        ft = ft
          .elementShouldBeVisible('#btnAiPromptDropdownToggle')
          .click('#btnAiPromptDropdownToggle')
          .waitOnElementToBecomeVisible('#btnAiPromptRebuild')
          .click('#btnAiPromptRebuild')
          .waitOnElementToBecomeVisible('#aiPromptContainer')
          .waitOnElementToBecomeVisible('#aiPromptContent')
          .elementShouldContainText('#aiPromptSteps', 'tailor the prompt')
          .waitOnElementToBecomeVisible('#btnBackToTemplate')
          .click('#btnBackToTemplate')
          .waitOnElementToBecomeVisible('#galleryTemplateCarousel');

        // Step 6: Test README button if it exists
        ft = ft
          .elementShouldBeVisible('.template-footer')
          .elementShouldBeVisible('#btnViewTemplateReadme')
          .click('#btnViewTemplateReadme')
          .waitOnElementToBecomeVisible('#readmeDialogContainer')
          .waitOnElementToBecomeVisible('#templateReadmeContent')
          .elementShouldBeVisible('#templateReadmeContent')
          .click('#btnBackToTemplate')
          .waitOnElementToBecomeVisible('#galleryTemplateCarousel');

        // Step 7: Test "View in Browser" button exists
        ft = ft.elementShouldBeVisible('#btnViewHtmlInBrowserModal');
      }
    }

    // Step 8: Close the gallery modal via dp-dialog's built-in close button
    ft = ft.click('#templateGalleryModal .dp-close-btn');

    // Return to original state - set output type to None
    return ft
      .waitOnElementToBecomeVisible('#reportOutputType')
      .dropDownSelectOptionHavingLabel('#reportOutputType', 'None')
      .waitOnElementToBecomeInvisible('#reportTemplateContainer');
  }
}
