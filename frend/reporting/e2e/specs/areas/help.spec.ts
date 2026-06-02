import { electronBeforeAfterAllTest } from '../../utils/common-setup';
import { FluentTester } from '../../helpers/fluent-tester';

//DONE2
electronBeforeAfterAllTest(
  'should correctly display all the screens from the Help area',
  async function ({ beforeAfterEach: firstPage }) {
    let ft = new FluentTester(firstPage);

    ft = ft
      .gotoBurstScreen()
      .click('#supportEmail')
      .elementShouldHaveText(
        '#checkPointHelpSupport',
        'ParkTrent Properties Group, Australia',
      )
      .click('#tab-btn-licenseTab')
      .elementShouldHaveText(
        '#statusDemoLicense',
        'Open Source (Community Support)',
      )
      .click('#tab-btn-logsTab')
      .elementShouldBeVisible('#warningsLog')
      .click('#leftMenuHelpServices')
      .elementShouldHaveText(
        '#checkPointHelpServices',
        'sales@datapallas.com',
      )
      .click('#tab-btn-licenseTab')
      .elementShouldHaveText(
        '#statusDemoLicense',
        'Open Source (Community Support)',
      )
      .click('#leftMenuStarterPacks')
      .waitOnElementToBecomeVisible('#cmd-db-northwind-postgres')
      .waitOnElementToBecomeEnabled('#tab-btn-extraPackagesTab')
      .click('#tab-btn-extraPackagesTab')
      .waitOnElementToBecomeVisible('#package-notepadplusplus')
      .click('#leftMenuHelpDocumentation')
      .elementShouldContainText(
        '#checkPointHelpDocumentation',
        'Advanced Report Delivery Scenarios',
      )
      .click('#tab-btn-licenseTab')
      .elementShouldHaveText(
        '#statusDemoLicense',
        'Open Source (Community Support)',
      )
      .click('#leftMenuHelpExamples')
      .elementShouldHaveText(
        '#checkPointHelpExamples',
        'DataPallas Examples',
      )
      .click('#tab-btn-licenseTab')
      .elementShouldHaveText(
        '#statusDemoLicense',
        'Open Source (Community Support)',
      )
      .click('#leftMenuHelpCustomerReviews')
      .elementShouldHaveText(
        '#checkPointHelpCustomerReviews',
        'Michael B., Finance Systems Team',
      )
      .click('#tab-btn-licenseTab')
      .elementShouldHaveText(
        '#statusDemoLicense',
        'Open Source (Community Support)',
      )
      .click('#leftMenuHelpBlog')
      //this depends on a specific website to be up and the specific website stopped working
      /*
        .waitOnElementToBecomeVisible(
          '#blogRss .feed-container',
          Constants.DELAY_FIVE_THOUSANDS_SECONDS
        )
        */
      .click('#tab-btn-licenseTab')
      .elementShouldHaveText(
        '#statusDemoLicense',
        'Open Source (Community Support)',
      );
    const isElectron = process.env.TEST_ENV === 'electron';

    if (isElectron) {
      ft = ft
        .click('#leftMenuHelpInstallSetup')
        .elementShouldContainText(
          '#checkPointJavaPreRequisite',
          'as a prerequisite',
        )
        .click('#tab-btn-systemDiagnosticsTab')
        .elementShouldHaveText('#checkPointHelpJavaPreRequisite', 'Status')
        .click('#tab-btn-terminalTab')
        .elementShouldBeVisible('#p-terminal')
        .click('#tab-btn-updateTab')
        .elementShouldBeVisible('#btnLetMeUpdateManually');
    }

    ft = ft
      .click('#leftMenuHelpLicense')
      .elementShouldHaveText(
        '#statusDemoLicense',
        'Open Source (Community Support)',
      )
      .click('#tab-btn-logsTab')
      .elementShouldBeVisible('#warningsLog')
      .click('#leftMenuHelpAbout')
      .elementShouldHaveText('#checkPointHelpAbout', 'Copyright')
      .click('#tab-btn-comparisonTab')
      .elementShouldHaveText(
        '#checkPointHelpComparison',
        'DocumentBurster Server Features',
      )
      .gotoBurstScreen()
      .click('#topMenuHelp')
      .click('#topMenuHelpSupport')
      .elementShouldHaveText(
        '#checkPointHelpSupport',
        'ParkTrent Properties Group, Australia',
      )
      .gotoBurstScreen()
      .click('#topMenuHelp')
      .click('#topMenuHelpServices')
      .elementShouldHaveText(
        '#checkPointHelpServices',
        'sales@datapallas.com',
      )
      .gotoBurstScreen()
      .click('#topMenuHelp')
      .click('#topMenuStarterPacks')
      .waitOnElementToBecomeVisible('#cmd-db-northwind-postgres')
      .waitOnElementToBecomeEnabled('#tab-btn-extraPackagesTab')
      .click('#tab-btn-extraPackagesTab')
      .waitOnElementToBecomeVisible('#package-notepadplusplus')
      .gotoBurstScreen()
      .click('#topMenuHelp')
      .click('#topMenuHelpDocumentation')
      .elementShouldContainText(
        '#checkPointHelpDocumentation',
        'Advanced Report Delivery Scenarios',
      )
      .click('#tab-btn-licenseTab')
      .elementShouldHaveText(
        '#statusDemoLicense',
        'Open Source (Community Support)',
      )
      .gotoBurstScreen()
      .click('#topMenuHelp')
      .click('#topMenuHelpExamples')
      .elementShouldHaveText(
        '#checkPointHelpExamples',
        'DataPallas Examples',
      )
      .click('#tab-btn-licenseTab')
      .elementShouldHaveText(
        '#statusDemoLicense',
        'Open Source (Community Support)',
      )
      .gotoBurstScreen()
      .click('#topMenuHelp')
      .click('#topMenuHelpCustomerReviews')
      .elementShouldHaveText(
        '#checkPointHelpCustomerReviews',
        'Michael B., Finance Systems Team',
      )
      .click('#tab-btn-licenseTab')
      .elementShouldHaveText(
        '#statusDemoLicense',
        'Open Source (Community Support)',
      )
      .gotoBurstScreen()
      .click('#topMenuHelp')
      .click('#topMenuHelpBlog')
      .elementShouldBeVisible('#blogRss')
      .click('#tab-btn-licenseTab')
      .elementShouldHaveText(
        '#statusDemoLicense',
        'Open Source (Community Support)',
      )
      .gotoBurstScreen()
      .click('#topMenuHelp')
      .click('#topMenuHelpLicense')
      .elementShouldHaveText(
        '#statusDemoLicense',
        'Open Source (Community Support)',
      )
      .click('#tab-btn-logsTab')
      .elementShouldBeVisible('#warningsLog')
      .gotoBurstScreen()
      .click('#topMenuHelp')
      .click('#topMenuHelpAbout')
      .elementShouldHaveText('#checkPointHelpAbout', 'Copyright');

    return ft;
  },
);
