import { test } from '@playwright/test';
import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { FluentTester } from '../../helpers/fluent-tester';

//DONE2
test.describe('', async () => {
  electronBeforeAfterAllTest(
    'should allow to remove the default attachment with the intention of sending emails without any attachment',
    async function ({ beforeAfterEach: firstPage }) {
      const ft = new FluentTester(firstPage);

      await ft
        .gotoConfigurationEmailSettings()
        .click('#tab-btn-attachmentsTab')
        .click('#attachmentsTable tbody tr:first-child td')
        .click('#btnDeleteAttachment')
        .clickYesDoThis()
        .waitOnElementToBecomeVisible('#noAttachments')
        .click('#topMenuBurst')
        .gotoConfigurationGeneralSettings()
        .click('#leftMenuEmailSettings')
        .click('#tab-btn-attachmentsTab')
        .elementShouldBeVisible('#noAttachments');
    },
  );

  electronBeforeAfterAllTest(
    'should allow to edit existing attachments',
    async function ({ beforeAfterEach: firstPage }) {
      const ft = new FluentTester(firstPage);

      await ft
        .gotoConfigurationEmailSettings()
        .click('#tab-btn-attachmentsTab')
        .click('#attachmentsTable tbody tr:first-child td')
        .click('#btnEditAttachment')
        .click('#attachmentPath')
        .typeText('C:/Test/Test.pdf')
        .click('.dburst-button-question-confirm-attachment')
        .click('#topMenuBurst')
        .gotoConfigurationEmailSettings()
        .click('#leftMenuEmailSettings')
        .click('#tab-btn-attachmentsTab')
        .elementShouldContainText(
          '#attachmentsTable tbody tr:first-child td',
          'C:/Test/Test.pdf',
        );
    },
  );

  electronBeforeAfterAllTest(
    'should allow to add, delete, edit, up, down and clear attachments',
    async function ({ beforeAfterEach: firstPage }) {
      const ft = new FluentTester(firstPage);

      await ft
        .gotoConfigurationEmailSettings()
        .click('#tab-btn-attachmentsTab')
        .click('#btnNewAttachment')
        .click('#btnAttachmentPathVariables')
        .click('#\\$\\{var0\\}')
        .clickYesDoThis()
        .click(
          '#modalSelectAttachment .dburst-button-question-confirm-attachment',
        )
        .click('#btnNewAttachment')
        .click('#btnAttachmentPathVariables')
        .click('#\\$\\{var1\\}')
        .clickYesDoThis()
        .click(
          '#modalSelectAttachment .dburst-button-question-confirm-attachment',
        )
        .click('#btnNewAttachment')
        .click('#btnAttachmentPathVariables')
        .click('#\\$\\{var2\\}')
        .clickYesDoThis()
        .click(
          '#modalSelectAttachment .dburst-button-question-confirm-attachment',
        )
        .click('#attachmentsTable tbody tr:last-child td')
        .click('#btnUpAttachment')
        .click('#btnUpAttachment')
        .click('#attachmentsTable tbody tr:nth-child(3) td')
        .click('#btnDownAttachment')
        .click('#attachmentsTable tbody tr:nth-child(3) td')
        .click('#btnEditAttachment')
        .click('#attachmentPath')
        .typeText('$var1111$')
        .click(
          '#modalSelectAttachment .dburst-button-question-confirm-attachment',
        )
        .click('#topMenuBurst')
        .gotoConfigurationEmailSettings()
        .click('#tab-btn-attachmentsTab')
        .elementShouldContainText(
          '#attachmentsTable tbody tr:first-child td',
          '${extracted_file_path}',
        )
        .elementShouldContainText(
          '#attachmentsTable tbody tr:nth-child(2) td',
          '${var2}',
        )
        .elementShouldContainText(
          '#attachmentsTable tbody tr:nth-child(3) td',
          '$var1111$',
        )
        .elementShouldContainText(
          '#attachmentsTable tbody tr:last-child td',
          '${var0}',
        )
        .click('#attachmentsTable tbody tr:nth-child(3) td')
        .click('#btnDeleteAttachment')
        .clickYesDoThis()
        .click('#topMenuBurst')
        .gotoConfigurationEmailSettings()
        .click('#tab-btn-attachmentsTab')
        .elementShouldContainText(
          '#attachmentsTable tbody tr:first-child td',
          '${extracted_file_path}',
        )
        .elementShouldContainText(
          '#attachmentsTable tbody tr:nth-child(2) td',
          '${var2}',
        )
        .elementShouldContainText(
          '#attachmentsTable tbody tr:last-child td',
          '${var0}',
        )
        .click('#btnClearAttachments')
        .clickYesDoThis()
        .click('#topMenuBurst')
        .gotoConfigurationEmailSettings()
        .click('#tab-btn-attachmentsTab')
        .waitOnElementToBecomeVisible('#noAttachments');
    },
  );
});
