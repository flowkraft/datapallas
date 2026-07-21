import { Locator, Page } from 'playwright';
import { takeScreenshotIfRequested } from '../utils/helpers';
import { expect, chromium } from '@playwright/test';
import { pathToFileURL } from 'url';

const slash = require('slash');
import * as path from 'path';
import { spawnSync } from 'child_process';

import * as jetpack from 'fs-jetpack';

import { Constants } from '../utils/constants';
import { Helpers } from '../utils/helpers';
import * as PATHS from '../utils/paths';

import chai from 'chai';
import chaiHttp from 'chai-http';
import chaiFiles from 'chai-files';
//import chaiWaitFor from 'chai-wait-for';

import chaiAsPromised from 'chai-as-promised';

chai.use(chaiHttp);
//chai.use(chaiWaitFor);
chai.use(chaiFiles);
chai.use(chaiAsPromised);

const should = chai.should();

export class FluentTester implements PromiseLike<void> {
  private focusedElement: Locator;
  actions: (() => Promise<void>)[] = [];
  //waitOnElementToExists: any;

  /** Global default wait (ms) applied after every click when > 0. Can be set per-file/suite. */
  //public static globalClickWaitMs: number = 0;

  public static globalClickWaitMs: number = 500;

  /** Optional per-instance override (if undefined, global is used). */
  private clickWaitMs?: number;
  /** Set global click wait (affects future FluentTester instances and calls). */
  public static setGlobalClickWaitMs(ms: number): void {
    FluentTester.globalClickWaitMs = Math.max(0, Math.floor(ms || 0));
  }

  /** Set click wait for this FluentTester instance only. */
  public setClickWaitMs(ms: number): FluentTester {
    this.clickWaitMs = Math.max(0, Math.floor(ms || 0));
    return this;
  }

  public async then<TResult1 = void, TResult2 = never>(
    onfulfilled?:
      | ((value: void) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
      | undefined,
  ): Promise<TResult1 | TResult2> {
    // prettier-ignore
    return await this.executeActions()
      .then(onfulfilled)
      .catch(onrejected);
  }

  private _lastError?: Error;
  public lastError(): Error | undefined {
    return this._lastError;
  }

  private async executeActions(): Promise<void> {
    try {
      this._lastError = undefined;
      // eslint-disable-next-line no-constant-condition
      let actionIndex = 0;
      while (true) {
        if (this.actions.length === 0) {
          break;
        }
        const action = this.actions.shift();
        if (!action) break;

        // Log before executing the queued action (gives ordering & where it fails)
        try {
          const fnPreview = action.toString().split('\n')[0].slice(0, 160);
          //console.log(`[FluentTester] Executing action #${actionIndex} - preview: ${fnPreview}`);
        } catch (e) {
          //console.log(`[FluentTester] Executing action #${actionIndex}`);
        }

        await action();

        //console.log(`[FluentTester] Action #${actionIndex} completed`);
        actionIndex++;
      }
    } catch (error) {
      this._lastError = error as Error;
      //console.error(`[FluentTester] ERROR in queued action: ${error && (error as Error).message}`);
      // keep remaining actions cleared for deterministic state
      this.actions = [];
      throw error;
    } finally {
      this.actions = [];
    }
  }

  constructor(public window: Page) { }

  public scrollIntoViewIfNeeded(selector: string): FluentTester {
    const action = (): Promise<void> => this.doScrollIntoViewIfNeeded(selector);

    this.actions.push(action);
    return this;
  }

  public scrollContainerUntilElementVisible(
    containerSelector: string,
    targetSelector: string,
    maxScrolls: number = 40,
    stepPx: number = 900,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doScrollContainerUntilElementVisible(containerSelector, targetSelector, maxScrolls, stepPx);
    this.actions.push(action);
    return this;
  }

  public click(selector: string): FluentTester {
    const action = async (): Promise<void> => {
      await this.doClick(selector);
      const ms = (this.clickWaitMs !== undefined) ? this.clickWaitMs : FluentTester.globalClickWaitMs;
      if (ms && ms > 0) {
        // short explicit wait after click to reduce flakiness when enabled
        await this.window.waitForTimeout(ms);
      }
    };

    this.actions.push(action);
    return this;
  }

  public clickElementContainingText(text: string): FluentTester {
    const action = (): Promise<void> => this.doClickElementContainingText(text);

    this.actions.push(action);
    return this;
  }

  /**
   * Ensures a tree node is expanded. Reads the toggle button's aria-expanded
   * attribute: when "false" (collapsed), clicks the toggle to expand; when
   * "true", does nothing. aria-expanded is the stable, icon-independent signal
   * (the chevron itself is an inline SVG with no state class).
   * @param nodeSelector CSS selector for the tree node container (e.g. '#treeNodecategoriestargetTreedatabaseSchemaPicklist')
   */
  public ensureTreeNodeExpanded(nodeSelector: string): FluentTester {
    const action = async (): Promise<void> => {
      // The node's own toggle is the first match; descendant toggles only
      // exist once the node is already expanded.
      const toggleBtn = this.window
        .locator(`${nodeSelector} .p-tree-node-toggle-button`)
        .first();
      const isCollapsed =
        (await toggleBtn.getAttribute('aria-expanded')) === 'false';
      console.log(`[ensureTreeNodeExpanded] ${nodeSelector} — collapsed=${isCollapsed}`);
      if (isCollapsed) {
        await toggleBtn.click();
        console.log(`[ensureTreeNodeExpanded] Clicked toggle to expand`);
      }
    };

    this.actions.push(action);
    return this;
  }

  public hover(selector: string): FluentTester {
    const action = (): Promise<void> => this.doHover(selector);

    this.actions.push(action);
    return this;
  }

  public renameFile(path: string, newName: string): FluentTester {
    const action = (): Promise<void> => this.doRenameFile(path, newName);

    this.actions.push(action);
    return this;
  }

  public moveFile(srcPath: string, destPath: string): FluentTester {
    const action = (): Promise<void> => this.doMoveFile(srcPath, destPath);

    this.actions.push(action);
    return this;
  }

  public createFolder(path: string): FluentTester {
    const action = (): Promise<void> => this.doCreateFolder(path);
    this.actions.push(action);
    return this;
  }

  public copyFile(srcPath: string, destPath: string): FluentTester {
    const action = (): Promise<void> => this.doCopyFile(srcPath, destPath);
    this.actions.push(action);
    return this;
  }

  public deleteFolder(path: string): FluentTester {
    const action = (): Promise<void> => this.doDeleteFolder(path);
    this.actions.push(action);
    return this;
  }

  // ── File Content Assertions ──

  public fileShouldExist(filePath: string): FluentTester {
    const action = (): Promise<void> => this.doFileShouldExist(filePath);
    this.actions.push(action);
    return this;
  }

  public fileShouldNotExist(filePath: string): FluentTester {
    const action = (): Promise<void> => this.doFileShouldNotExist(filePath);
    this.actions.push(action);
    return this;
  }

  public fileContentShouldContain(filePath: string, text: string): FluentTester {
    const action = (): Promise<void> => this.doFileContentShouldContain(filePath, text);
    this.actions.push(action);
    return this;
  }

  public fileContentShouldNotContain(filePath: string, text: string): FluentTester {
    const action = (): Promise<void> => this.doFileContentShouldNotContain(filePath, text);
    this.actions.push(action);
    return this;
  }

  public apiGetJsonValueShouldEqual(
    url: string,
    jsonPath: string,
    expectedValue: string,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doApiGetJsonValueShouldEqual(url, jsonPath, expectedValue);
    this.actions.push(action);
    return this;
  }

  public apiPostJsonValueShouldEqual(
    url: string,
    body: any,
    jsonPath: string,
    expectedValue: string,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doApiPostJsonValueShouldEqual(url, body, jsonPath, expectedValue);
    this.actions.push(action);
    return this;
  }

  public fileContentShouldMatch(filePath: string, regex: RegExp): FluentTester {
    const action = (): Promise<void> => this.doFileContentShouldMatch(filePath, regex);
    this.actions.push(action);
    return this;
  }

  public dblClick(selector: string): FluentTester {
    const action = (): Promise<void> => this.doDblClick(selector);

    this.actions.push(action);
    return this;
  }

  public clickAndSelectTableRow(selector: string): FluentTester {
    const action = (): Promise<void> => this.doClickAndSelectTableRow(selector);

    this.actions.push(action);
    return this;
  }

  public clickYesDoThis(): FluentTester {
    const action = (): Promise<void> =>
      this.doClick(Constants.BTN_CONFIRM_SELECTOR + ':visible');

    this.actions.push(action);
    return this;
  }

  public sleep(ms: number = 0): FluentTester {
    let delay = Constants.DELAY_ONE_SECOND;
    if (ms > 0) delay = ms;

    const action = (): Promise<void> => Helpers.delay(delay);

    this.actions.push(action);
    return this;
  }

  public async getElementTextContent(selector: string): Promise<string> {
    const content = await this.window.locator(selector).textContent();
    return content ? content.trim() : '';
  }

  public clipboardShouldContainText(text: string): FluentTester {
    const action = (): Promise<void> => this.doClipboardShouldContainText(text);
    this.actions.push(action);
    return this;
  }

  private async doClipboardShouldContainText(text: string): Promise<void> {
    try {
      const clipboardText = await this.window.evaluate(() =>
        navigator.clipboard.readText(),
      );
      // Using Playwright's expect for assertion within the async action
      expect(clipboardText).toContain(text);
    } catch (error) {
      console.error(
        'Failed to read clipboard text or assertion failed:',
        error,
      );
      throw new Error(
        `Failed to read clipboard or assert text: ${error.message}`,
      );
    }
  }

  public clipboardShouldNotContainText(text: string): FluentTester {
    const action = (): Promise<void> => this.doClipboardShouldNotContainText(text);
    this.actions.push(action);
    return this;
  }

  private async doClipboardShouldNotContainText(text: string): Promise<void> {
    try {
      const clipboardText = await this.window.evaluate(() =>
        navigator.clipboard.readText(),
      );
      expect(clipboardText).not.toContain(text);
    } catch (error) {
      console.error(
        'Failed to read clipboard text or assertion failed:',
        error,
      );
      throw new Error(
        `Failed to read clipboard or assert text not contained: ${error.message}`,
      );
    }
  }

  public consoleLog(message: string): FluentTester {
    const action = (): Promise<void> =>
      new Promise((resolve) => {
        console.log(message);
        resolve();
      });

    this.actions.push(action);
    return this;
  }

  public clickNoDontDoThis(): FluentTester {
    const action = (): Promise<void> =>
      this.doClick(Constants.BTN_DECLINE_SELECTOR + ':visible');

    this.actions.push(action);
    return this;
  }

  public typeText(text: string): FluentTester {
    const action = (): Promise<void> => this.doTypeText(text);

    this.actions.push(action);
    return this;
  }

  public pressKey(key: string): FluentTester {
    const action = (): Promise<void> => this.doPressKey(key);

    this.actions.push(action);
    return this;
  }

  //public reload(): FluentTester {
  //  const action = (): Promise<void> => this.doPageReload();

  //this.actions.push(action);
  //return this;
  //}

  public waitOnElementWithTextToBecomeVisible(
    text: string,
    waitTime?: number,
  ): FluentTester {
    let delay = Constants.DELAY_FIVE_THOUSANDS_SECONDS;
    if (waitTime) delay = waitTime;
    const action = (): Promise<void> =>
      this.doWaitOnElementWithTextToBecome(text, true, delay);

    this.actions.push(action);
    return this;
  }

  public waitOnElementWithTextToBecomeInvisible(
    text: string,
    waitTime?: number,
  ): FluentTester {
    let delay = Constants.DELAY_FIVE_THOUSANDS_SECONDS;
    if (waitTime) delay = waitTime;
    const action = (): Promise<void> =>
      this.doWaitOnElementWithTextToBecome(text, false, delay);

    this.actions.push(action);
    return this;
  }

  public pageShouldContainText(text: string): FluentTester {
    const action = (): Promise<void> => this.doCheckPageToContainText(text);

    this.actions.push(action);
    return this;
  }

  public pageShouldNotContainText(text: string): FluentTester {
    const action = (): Promise<void> => this.doCheckPageNotToContainText(text);

    this.actions.push(action);
    return this;
  }

  /**
   * Wait for the Tabulator table to become visible (at least one row).
   */
  public waitOnTabulatorToBecomeVisible(waitTime?: number): FluentTester {
    let delay = Constants.DELAY_HUNDRED_SECONDS;
    if (waitTime) delay = waitTime;
    // Wait for the rb-tabulator host (parent) to be visible instead of exact row count
    const action = (): Promise<void> =>
      this.doWaitOnElementToBecomeVisible('rb-tabulator', delay);

    this.actions.push(action);
    return this;
  }

  /**
   * Wait for the Tabulator table to have exactly expectedCount rows.
   */
  public waitOnTabulatorToHaveRowCount(expectedCount: number, waitTime?: number): FluentTester {
    // don't log immediately here — log when the action runs
    let delay = Constants.DELAY_HUNDRED_SECONDS;
    if (waitTime) delay = waitTime;
    const action = async (): Promise<void> => {
      //console.log(`[waitOnTabulatorToHaveRowCount] Executing expect count: ${expectedCount}`);
      try {
        // reuse existing helper which already implements waiting semantics
        await this.doWaitOnElementToHaveCount('div.tabulator-row', expectedCount, delay);
        const actual = await this.window.locator('div.tabulator-row').count();
        //console.log(`[waitOnTabulatorToHaveRowCount] Success: expected=${expectedCount}, actual=${actual}`);
      } catch (err) {
        // extra diagnostics when wait fails
        let actual = -1;
        try {
          actual = await this.window.locator('div.tabulator-row').count();
        } catch (e) {
          //console.log('[waitOnTabulatorToHaveRowCount] Failed to read actual count:', e);
        }
        //console.log(`[waitOnTabulatorToHaveRowCount] Timeout: expected=${expectedCount}, actual=${actual}`);
        // optionally dump the server-side last response or take a screenshot here
        // await this.window.screenshot({ path: `debug-tabulator-${Date.now()}.png` });
        throw err;
      }
    };

    this.actions.push(action);
    return this;
  }

  /**
   * Wait for the Tabulator table to have at least one row of data.
   */
  public waitOnTabulatorToHaveData(waitTime?: number): FluentTester {
    let delay = Constants.DELAY_HUNDRED_SECONDS;
    if (waitTime) delay = waitTime;
    const action = async (): Promise<void> => {
      await expect(this.window.locator('div.tabulator-row').first()).toBeVisible({ timeout: delay });
    };
    this.actions.push(action);
    return this;
  }

  /**
   * Assert the Tabulator cell at (rowIndex, columnField) has the expected text.
   */
  public tabulatorCellShouldHaveText(rowIndex: number, columnField: string, expectedText: string): FluentTester {
    const action = async (): Promise<void> => {
      const cell = this.window
        .locator('div.tabulator-row')
        .nth(rowIndex)
        .locator(`div[tabulator-field="${columnField}"]`);
      await expect(cell).toHaveText(expectedText);
    };
    this.actions.push(action);
    return this;
  }

  /**
   * Assert at least one Tabulator row has a cell in the given column with the expected text.
   */
  public tabulatorShouldContainCellText(columnField: string, expectedText: string): FluentTester {
    const action = async (): Promise<void> => {
      const cells = this.window.locator(`div[tabulator-field="${columnField}"]`);
      const count = await cells.count();
      let found = false;
      for (let i = 0; i < count; i++) {
        const text = await cells.nth(i).textContent();
        if (text && text.trim() === expectedText) {
          found = true;
          break;
        }
      }
      expect(found).toBeTruthy();
    };
    this.actions.push(action);
    return this;
  }

  public waitOnElementToBecomeVisible(
    selector: string,
    waitTime?: number,
  ): FluentTester {
    let delay = Constants.DELAY_HUNDRED_SECONDS;
    if (waitTime) delay = waitTime;
    const action = (): Promise<void> =>
      this.doWaitOnElementToHaveCount(selector, 1, delay);

    this.actions.push(action);
    return this;
  }

  public waitOnElementToBecomeInvisible(
    selector: string,
    waitTime?: number,
  ): FluentTester {
    //console.log(selector);

    let delay = Constants.DELAY_HUNDRED_SECONDS;
    if (waitTime) delay = waitTime;

    const action = (): Promise<void> =>
      this.doWaitOnElementToHaveCount(selector + ':visible', 0, delay);

    this.actions.push(action);
    return this;
  }

  public waitOnElementToBecomeEnabled(
    selector: string,
    waitTime?: number,
  ): FluentTester {
    let delay = Constants.DELAY_HUNDRED_SECONDS;
    if (waitTime) delay = waitTime;
    const action = (): Promise<void> =>
      this.doWaitOnElementToBecomeEnabledDisabled(selector, true, delay);

    this.actions.push(action);
    return this;
  }

  public waitOnElementToBecomeDisabled(
    selector: string,
    waitTime?: number,
  ): FluentTester {
    let delay = Constants.DELAY_HUNDRED_SECONDS;
    if (waitTime) delay = waitTime;
    const action = (): Promise<void> =>
      this.doWaitOnElementToBecomeEnabledDisabled(selector, false, delay);

    this.actions.push(action);
    return this;
  }

  public waitOnProcessingToStart(howToCheck: string): FluentTester {
    const action = (): Promise<void> =>
      this.doWaitOnProcessingToStart(howToCheck);

    this.actions.push(action);
    return this;
  }

  public waitOnProcessingToFinish(howToCheck: string): FluentTester {
    const action = (): Promise<void> =>
      this.doWaitOnProcessingToFinish(howToCheck);

    this.actions.push(action);
    return this;
  }

  public killHangingJavaProcesses(): FluentTester {
    const action = (): Promise<void> => Helpers.killHangingJavaProcesses();

    this.actions.push(action);
    return this;
  }

  public appStatusShouldBeGreatNoErrorsNoWarnings(): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckAppStatus(Constants.STATUS_GREAT_NO_ERRORS_NO_WARNINGS);

    this.actions.push(action);
    return this;
  }

  public appStatusShouldShowErrorsOrWarnings(): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckElementExists('#btnGreatNoErrorsNoWarnings', false);

    this.actions.push(action);
    return this;
  }

  public appStatusShouldShowErrors(): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckAppStatus(Constants.STATUS_ERRORS);

    this.actions.push(action);
    return this;
  }

  public appStatusShouldShowWarnings(): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckAppStatus(Constants.STATUS_WARNINGS);

    this.actions.push(action);
    return this;
  }

  public elementCheckBoxShouldBeSelected(selector: string): FluentTester {
    const isChecked = true;
    const action = (): Promise<void> =>
      this.doCheckCheckBoxValue(selector, isChecked);

    this.actions.push(action);
    return this;
  }

  public elementCheckBoxShouldNotBeSelected(selector: string): FluentTester {
    const isChecked = false;
    const action = (): Promise<void> =>
      this.doCheckCheckBoxValue(selector, isChecked);

    this.actions.push(action);
    return this;
  }

  public elementAttributeShouldHaveValue(
    selector: string,
    attribute: string,
    value: string,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckElementAttributeHasValue(selector, attribute, value);

    this.actions.push(action);
    return this;
  }

  public elementShouldHaveAttribute(
    selector: string,
    attribute: string,
  ): FluentTester {
    const isPresent = true;

    const action = (): Promise<void> =>
      this.doCheckElementAttributeExistence(selector, attribute, isPresent);

    this.actions.push(action);
    return this;
  }

  public elementShouldNotHaveAttribute(
    selector: string,
    attribute: string,
  ): FluentTester {
    const isPresent = false;

    const action = (): Promise<void> =>
      this.doCheckElementAttributeExistence(selector, attribute, isPresent);

    this.actions.push(action);
    return this;
  }

  public clearValue(selector: string): FluentTester {
    const action = (): Promise<void> => this.doClearValue(selector);

    this.actions.push(action);
    return this;
  }

  public setValue(selector: string, value: string): FluentTester {
    const action = (): Promise<void> => this.doSetValue(selector, value);

    this.actions.push(action);
    return this;
  }

  public setInputFiles(
    selector: string,
    files: string | readonly string[],
  ): FluentTester {
    const action = (): Promise<void> => this.doSetInputFiles(selector, files);

    this.actions.push(action);
    return this;
  }

  public selectedOptionShouldContainText(
    selector: string,
    value: string,
  ): FluentTester {
    let action = (): Promise<void> =>
      this.doCheckSelectedOptionShouldContainText(selector, value);

    this.actions.push(action);
    return this;
  }

  public dropDownSelectOptionHavingLabel(
    selector: string,
    label: string,
  ): FluentTester {
    let action = (): Promise<void> =>
      this.doDropDownSelectOptionHavingLabel(selector, label);

    this.actions.push(action);
    return this;
  }

  // Add this public method
  public dropDownSelectOptionHavingValue(
    selector: string,
    value: string,
  ): FluentTester {
    let action = (): Promise<void> =>
      this.doDropDownSelectOptionHavingValue(selector, value);

    this.actions.push(action);
    return this;
  }

  public selectNgOption(
    dropdownSelector: string,
    optionText: string,
    waitForValueSelection: boolean = true,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doSelectNgOption(
        dropdownSelector,
        optionText,
        waitForValueSelection,
      );
    this.actions.push(action);
    return this;
  }

  public waitOnToastToBecomeVisible(
    type: 'success' | 'warning' | 'error' | 'info',
    messageText?: string,
    waitTime?: number,
  ): FluentTester {
    let delay = Constants.DELAY_TEN_SECONDS; // Use a shorter default timeout
    if (waitTime) delay = waitTime;

    const action = (): Promise<void> =>
      this.doWaitOnToastToBecomeVisible(type, messageText, delay);

    this.actions.push(action);
    return this;
  }

  private async doWaitOnToastToBecomeVisible(
    type: 'success' | 'warning' | 'error' | 'info',
    messageText?: string,
    waitTime?: number,
  ): Promise<void> {
    // Map type to the appropriate toast class
    const typeClass = `alert-${type}`;

    // First wait for any toast of the specified type
    await this.window.waitForSelector(`.${typeClass}`, {
      state: 'visible',
      timeout: waitTime,
    });

    // If no specific message checking is needed, return immediately
    if (!messageText) return;

    // For specific message text, find all toast messages of this type
    const toastElements = await this.window.$$(`.${typeClass}`);

    // Check each toast message's text content
    for (const toast of toastElements) {
      const text = await toast.textContent();
      if (text && text.toLowerCase().includes(messageText.toLowerCase())) {
        return; // Found the message, exit immediately
      }
    }

    // If we get here, the specific message wasn't found
    throw new Error(
      `Toast of type ${type} with message "${messageText}" not found`,
    );
  }

  private async doSelectNgOption(
    dropdownSelector: string,
    optionText: string,
    waitForValueSelection: boolean = true,
  ): Promise<void> {
    // Click the dropdown to open it
    await this.doClick(dropdownSelector);

    // Find and click the specific option
    const optionSelector = `span.ng-option-label:has-text("${optionText}")`;
    await this.window.waitForSelector(optionSelector, {
      state: 'visible',
      timeout: Constants.DELAY_HUNDRED_SECONDS,
    });
    await this.window.click(optionSelector);

    // If requested, wait for selection to be visible
    if (waitForValueSelection) {
      await this.window
        .waitForSelector('.ng-value', {
          state: 'visible',
          timeout: Constants.DELAY_HUNDRED_SECONDS,
        })
        .catch(() => {
          // Some dropdowns may have different selection indicators
          //console.log('Warning: .ng-value not found after option selection');
        });
    }
  }

  public dropDownShouldHaveSelectedOption(
    selector: string,
    expectedValue: string,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doDropDownShouldHaveSelectedOption(selector, expectedValue);

    this.actions.push(action);
    return this;
  }

  public elementShouldContainText(
    selector: string,
    value: string,
  ): FluentTester {
    let action = (): Promise<void> =>
      this.doCheckElementToContainText(selector, value);

    this.actions.push(action);
    return this;
  }

  public elementShouldNotContainText(
    selector: string,
    value: string,
  ): FluentTester {
    let action = (): Promise<void> =>
      this.doCheckElementToNotContainText(selector, value);

    this.actions.push(action);
    return this;
  }

  private async doCheckElementToNotContainText(
    selector: string,
    text: string,
  ): Promise<void> {
    return expect(this.window.locator(selector)).not.toContainText(text);
  }

  public waitOnElementToContainText(
    selector: string,
    value: string,
    waitTime?: number,
  ): FluentTester {
    /*
    if (selector == '#divMONTHLY-PAYSLIPS-SPLIT') {
      const content = this.window.locator(selector);
      console.log(`#divMONTHLY-PAYSLIPS-SPLIT content = ${content}`);
    }
    */

    let action = (): Promise<void> =>
      this.doWaitOnElementToContainText(selector, value, waitTime);

    this.actions.push(action);
    return this;
  }

  public elementShouldHaveText(selector: string, value: string): FluentTester {
    let action = (): Promise<void> =>
      this.doCheckElementToHaveText(selector, value);

    this.actions.push(action);
    return this;
  }

  public waitOnElementToHaveText(
    selector: string,
    text: string,
    waitTime?: number,
  ): FluentTester {
    let wTime = Constants.DELAY_FIVE_THOUSANDS_SECONDS;
    if (waitTime) wTime = waitTime;
    let action = (): Promise<void> =>
      this.doWaitOnElementToHaveText(selector, text, wTime);

    this.actions.push(action);
    return this;
  }

  public waitOnInputToHaveValue(
    selector: string,
    text: string,
    waitTime?: number,
  ): FluentTester {
    let wTime = Constants.DELAY_FIVE_THOUSANDS_SECONDS;
    if (waitTime) wTime = waitTime;
    let action = (): Promise<void> =>
      this.doWaitOnInputToHaveValue(selector, text, wTime);

    this.actions.push(action);
    return this;
  }

  public waitOnInputValueToContainText(
    selector: string,
    text: string,
    waitTime?: number,
  ): FluentTester {
    let action = (): Promise<void> =>
      this.doWaitOnInputValueToContainText(selector, text, waitTime);

    this.actions.push(action);
    return this;
  }

  public inputValueShouldContainText(
    selector: string,
    text: string,
  ): FluentTester {
    let action = (): Promise<void> =>
      this.doWaitOnInputValueToContainText(selector, text);

    this.actions.push(action);
    return this;
  }

  public inputShouldHaveValue(selector: string, value: string): FluentTester {
    let action = (): Promise<void> =>
      this.doWaitOnInputToHaveValue(selector, value);

    this.actions.push(action);
    return this;
  }

  public elementShouldNotBeVisible(selector: string): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckElementExists(selector, false);

    this.actions.push(action);
    return this;
  }

  public elementShouldBeVisible(selector: string): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckElementExists(selector, true);

    this.actions.push(action);
    return this;
  }

  public async elementExistsNowFast(selector: string, timeout = 1000): Promise<boolean> {
    try {
      await this.window.waitForSelector(selector, { state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  public async elementExistsNow(
    selector: string,
    timeout: number = Constants.DELAY_ONE_SECOND,
    stabilityMs: number = 120,
    pollIntervalMs: number = 80,
  ): Promise<boolean> {
    // Fast, non-throwing probe that requires the element to be visible and stable
    const start = Date.now();
    try {
      while (Date.now() - start < timeout) {
        const loc = this.window.locator(selector).first();

        // check count quickly (no long implicit wait)
        const count = await loc.count().catch(() => 0);
        if (count > 0) {
          // FAST PATH: if it's visible right now, return immediately
          const visibleNow = await loc.isVisible().catch(() => false);
          if (visibleNow) return true;

          // Otherwise attempt a short stability window to avoid transient attach/remove races
          const stableStart = Date.now();
          let becameVisible = false;
          while (Date.now() - stableStart < stabilityMs) {
            if (await loc.isVisible().catch(() => false)) {
              becameVisible = true;
              break;
            }
            await this.window.waitForTimeout(pollIntervalMs);
          }
          if (becameVisible) {
            // tiny additional pause to reduce chance of immediate removal
            await this.window.waitForTimeout(Math.min(40, stabilityMs));
            if (await loc.isVisible().catch(() => false)) return true;
          }

          // not visible/stable yet — retry soon
          await this.window.waitForTimeout(pollIntervalMs);
          continue;
        }

        // not present yet — quick sleep and retry
        await this.window.waitForTimeout(pollIntervalMs);
      }

      return false;
    } catch (err) {
      // keep helper non-throwing; caller decides what to do on false
      return false;
    }
  }

  public async elementExistsNow2(
    selector: string,
    timeout: number = Constants.DELAY_ONE_SECOND,
    stabilityMs: number = 120,
    pollIntervalMs: number = 80,
  ): Promise<boolean> {
    // Fast, non-throwing probe that requires the element to be visible and stable.
    // This implementation adds a bounding-box stability check (when available)
    // and uses short polling to avoid Playwright's long implicit waits.
    const start = Date.now();
    try {
      const loc = (selector && typeof selector === 'string') ? this.window.locator(selector).first() : null;
      while (Date.now() - start < timeout) {
        if (!loc) return false;

        // quick presence check (no long wait)
        const count = await loc.count().catch(() => 0);
        if (count === 0) {
          await this.window.waitForTimeout(pollIntervalMs);
          continue;
        }

        // quick visible check
        const visibleNow = await loc.isVisible().catch(() => false);
        if (!visibleNow) {
          // not visible yet — short sleep and retry
          await this.window.waitForTimeout(pollIntervalMs);
          continue;
        }

        // Try to obtain a bounding box; if available, require it to be stable
        let box = await loc.boundingBox().catch(() => null);
        if (box) {
          const stableStart = Date.now();
          let stable = true;
          // check that bounding box remains essentially identical for stabilityMs
          while (Date.now() - stableStart < stabilityMs) {
            await this.window.waitForTimeout(Math.min(pollIntervalMs, 40));
            const box2 = await loc.boundingBox().catch(() => null);
            if (!box2) {
              stable = false;
              break;
            }
            // small tolerance to allow sub-pixel/animation moves
            const dx = Math.abs((box2.x || 0) - (box.x || 0));
            const dy = Math.abs((box2.y || 0) - (box.y || 0));
            const dw = Math.abs((box2.width || 0) - (box.width || 0));
            const dh = Math.abs((box2.height || 0) - (box.height || 0));
            if (dx > 2 || dy > 2 || dw > 2 || dh > 2) {
              stable = false;
              box = box2;
              break;
            }
          }
          if (stable) return true;
          // otherwise retry quickly
          await this.window.waitForTimeout(pollIntervalMs);
          continue;
        }

        // If boundingBox not available, fall back to a short visible-stability window
        const stableStart2 = Date.now();
        let becameVisible = false;
        while (Date.now() - stableStart2 < stabilityMs) {
          if (await loc.isVisible().catch(() => false)) {
            becameVisible = true;
            break;
          }
          await this.window.waitForTimeout(pollIntervalMs);
        }
        if (becameVisible) {
          // brief pause to reduce race conditions
          await this.window.waitForTimeout(Math.min(40, stabilityMs));
          if (await loc.isVisible().catch(() => false)) return true;
        }

        // not stable/visible yet — retry
        await this.window.waitForTimeout(pollIntervalMs);
      }

      return false;
    } catch (err) {
      // keep helper non-throwing; caller decides what to do on false
      return false;
    }
  }

  private async getElementDebugInfo(selector: string): Promise<any> {
    try {
      return await this.window.evaluate((sel) => {
        let el: HTMLElement | null = null;
        if (sel.startsWith('xpath=')) {
          const xp = sel.slice(6);
          const node = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
          el = node instanceof HTMLElement ? node : null;
        } else {
          el = document.querySelector(sel) as HTMLElement | null;
        }
        if (!el) return { found: false };
        const s = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          found: true,
          id: el.id,
          text: (el.textContent || '').trim(),
          display: s.display,
          visibility: s.visibility,
          opacity: s.opacity,
          width: rect.width,
          height: rect.height,
          inDocument: document.contains(el),
          outerHTML: el.outerHTML.slice(0, 200),
        };
      }, selector);
    } catch {
      return { found: false };
    }
  }

  public debugElement(selector: string): FluentTester {
    const action = async (): Promise<void> => {
      const info = await this.getElementDebugInfo(selector);
      console.log('DEBUG element:', selector, info);
    };
    this.actions.push(action);
    return this;
  }


  public async fullProbe(connectionName: string): Promise<any> {
    const page = this.window;
    const kebab = (connectionName || '').replace(/\s+/g, '-').toLowerCase();
    const idBase = `btnDefault_db-${kebab}`;
    const selectors: Record<string, string> = {
      rawCss: `#${idBase}\\.xml`,
      attrExact: `[id="${idBase}.xml"]`,
      prefixCss: `[id^="${idBase}"]`,
      xpathExact: `xpath=//button[@id="${idBase}.xml"]`,
      xpathPrefix: `xpath=//button[starts-with(@id, "${idBase}")]`,
      textButton: `button:has-text("Default")`,
    };

    const evalAncestors = async (sel: string) =>
      page.evaluate((s) => {
        const resolve = (str: string) =>
          str.startsWith('xpath=') ? document.evaluate(str.slice(6), document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue : document.querySelector(str);
        const el = resolve(s) as HTMLElement | null;
        if (!el) return { found: false };
        const rect = el.getBoundingClientRect();
        const ancestors: any[] = [];
        let cur: HTMLElement | null = el;
        while (cur) {
          const st = window.getComputedStyle(cur);
          ancestors.push({ tag: cur.tagName, id: cur.id, display: st.display, visibility: st.visibility, opacity: st.opacity, w: cur.offsetWidth, h: cur.offsetHeight });
          cur = cur.parentElement;
        }
        return { found: true, rect, clientRects: el.getClientRects().length, offsetParent: !!el.offsetParent, ancestors };
      }, sel).catch(() => ({ found: false }));

    const evalFrames = async (id: string) =>
      page.evaluate((idStr) => {
        const matches: number[] = [];
        Array.from(document.querySelectorAll('iframe')).forEach((f, i) => {
          try {
            const d = (f as HTMLIFrameElement).contentDocument;
            if (!d) return;
            if (d.getElementById(idStr) || d.querySelector(`[id="${idStr}"]`)) matches.push(i);
          } catch (e) { }
        });
        return matches;
      }, `${idBase}.xml`).catch(() => []);

    const results: Record<string, any> = {};
    for (const [name, sel] of Object.entries(selectors)) {
      const domInfo = await this.getElementDebugInfo(sel).catch(() => ({ found: false }));
      const loc = page.locator(sel).first();
      const count = await loc.count().catch(() => 0);
      const visible = await loc.isVisible().catch(() => false);
      const box = await loc.boundingBox().catch(() => null);
      const fast = await this.elementExistsNowFast(sel).catch(() => false);
      const now = await this.elementExistsNow(sel).catch(() => false);
      const now2 = await this.elementExistsNow2(sel).catch(() => false);
      let screenshot: string | null = null;
      if (count > 0) {
        try {
          screenshot = `e2e-debug-${name}-${Date.now()}.png`;
          // swallow errors — may not be allowed in all runners
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          await loc.screenshot({ path: screenshot }).catch(() => { screenshot = null; });
        } catch { screenshot = null; }
      }
      const ancestors = await evalAncestors(sel);
      const frames = await evalFrames(`${idBase}.xml`);
      results[name] = { selector: sel, domInfo, playwright: { count, visible, box }, helpers: { fast, now, now2 }, screenshot, ancestors, frames };
    }

    // role-based probe
    try {
      const roleLoc = page.getByRole('button', { name: 'Default' });
      const rc = await roleLoc.count().catch(() => 0);
      const rv = await roleLoc.isVisible().catch(() => false);
      const rbox = await roleLoc.boundingBox().catch(() => null);
      results.role = { count: rc, visible: rv, box: rbox };
      if (rc > 0) {
        const p = `e2e-debug-role-${Date.now()}.png`;
        await roleLoc.screenshot({ path: p }).catch(() => null);
        results.role.screenshot = p;
      }
    } catch (e) {
      results.role = { error: e && e.message };
    }

    return { idBase, results };
  }

  public debugFullProbe(connectionName: string): FluentTester {
    const action = async (): Promise<void> => {
      const info = await this.fullProbe(connectionName).catch((e) => ({ error: e && e.message }));
      console.log('FULL PROBE:', connectionName, JSON.stringify(info, null, 2));
    };
    this.actions.push(action);
    return this;
  }
  
  public elementShouldHaveClass(
    selector: string,
    className: string,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckElementClass(selector, className, true);

    this.actions.push(action);
    return this;
  }

  public elementShouldNotHaveClass(
    selector: string,
    className: string,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckElementClass(selector, className, false);

    this.actions.push(action);
    return this;
  }

  public waitOnElementToHaveClass(
    selector: string,
    className: string,
    waitTime?: number,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doWaitOnElementClass(selector, className, true, waitTime);

    this.actions.push(action);
    return this;
  }

  public waitOnElementNotToHaveClass(
    selector: string,
    className: string,
    waitTime?: number,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doWaitOnElementClass(selector, className, false, waitTime);

    this.actions.push(action);
    return this;
  }

  public elementShouldBeEnabled(selector: string): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckElementEnabledStatus(selector, true);

    this.actions.push(action);
    return this;
  }

  public elementShouldBeDisabled(selector: string): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckElementEnabledStatus(selector, false);

    this.actions.push(action);
    return this;
  }

  public infoDialogShouldBeVisible(): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckElementExists('dburst-info-dialog', true);

    this.actions.push(action);
    return this;
  }

  public confirmDialogShouldBeVisible(): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckElementExists('.dburst-button-question-confirm', true);

    this.actions.push(action);
    return this;
  }

  /**
   * Polling wait for the confirm dialog to render — use this instead of the
   * synchronous `confirmDialogShouldBeVisible()` when the action that triggers
   * the dialog is not synchronous to the same microtask. Common offenders:
   * `<select>` changes routed through Angular `(ngModelChange)` and any handler
   * that `await`s before opening the dialog. Same selector, but with a timeout.
   */
  public waitOnConfirmDialogToBecomeVisible(waitTime?: number): FluentTester {
    return this.waitOnElementToBecomeVisible(
      '.dburst-button-question-confirm:visible',
      waitTime,
    );
  }

  /**
   * Polling wait for the confirm dialog to disappear — use after `clickYesDoThis()`
   * or `clickNoDontDoThis()` when the next step needs the dialog to be gone
   * (e.g. clicking an underlying button covered by the dialog backdrop).
   * Replaces the copy-pasted `waitOnElementToBecomeInvisible('.dburst-button-question-confirm')`.
   */
  public waitOnConfirmDialogToBecomeInvisible(waitTime?: number): FluentTester {
    return this.waitOnElementToBecomeInvisible(
      '.dburst-button-question-confirm',
      waitTime,
    );
  }

  /**
   * Polling wait for the info dialog to render. Same rationale as
   * `waitOnConfirmDialogToBecomeVisible` — use when the trigger isn't
   * synchronous to the same microtask as the assertion.
   */
  public waitOnInfoDialogToBecomeVisible(waitTime?: number): FluentTester {
    return this.waitOnElementToBecomeVisible('dburst-info-dialog', waitTime);
  }

  /**
   * Polling wait for the info dialog to disappear after dismissing it.
   */
  public waitOnInfoDialogToBecomeInvisible(waitTime?: number): FluentTester {
    return this.waitOnElementToBecomeInvisible('dburst-info-dialog', waitTime);
  }

  public appShouldBeReadyToRunNewJobs(): FluentTester {
    const action = (): Promise<void> => this.doAppShouldBeReadyToRunNewJobs();

    this.actions.push(action);
    return this;
  }

  public waitOnAppSkinToBeCorrectlySaved(skin: string): FluentTester {
    const action = (): Promise<void> =>
      this.doWaitOnSkinToBeCorrectlySaved(skin);

    this.actions.push(action);
    return this;
  }

  public processingShouldHaveGeneratedOutputFiles(
    listOfFiles: string[],
    fileSuffix: string = 'pdf',
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doVerifyOutputFiles(listOfFiles, fileSuffix);

    this.actions.push(action);
    return this;
  }

  public processingShouldHaveGeneratedQuarantineFiles(
    listOfFiles: string[],
    fileSuffix: string = 'pdf',
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doVerifyQuarantineFiles(listOfFiles, fileSuffix);

    this.actions.push(action);
    return this;
  }

  public processingShouldHaveGeneratedNFilesHavingSuffix(
    n: number,
    suffix: string,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doVerifyNumberOfOutputFilesHavingSuffix(n, suffix);

    this.actions.push(action);
    return this;
  }

  public processingShouldHaveGeneratedFewFilesHavingSuffix(
    suffix: string,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doVerifyFewOutputFilesHavingSuffix(suffix);

    this.actions.push(action);
    return this;
  }

  /**
   * Screenshot ONE generated PDF — the visual payoff of a report run.
   *
   * The Electron app can never show you this: the documents only exist on disk
   * once processing ends. So we open the file in a browser that renders PDFs and
   * shoot that instead.
   *
   * Picks the newest `output/**\/*.pdf` (the same place
   * doVerifyNumberOfOutputFilesHavingSuffix looks), and inside that run prefers
   * `1.pdf` so the shot is deterministic rather than "whatever the OS listed
   * first". ONE file — a run makes hundreds and they only differ by data.
   *
   * @param outputFilePath absolute path of the PNG to write
   * @param waitMs         time to let the PDF viewer paint (no DOM event to await)
   */
  public screenshotOneGeneratedPdf(
    outputFilePath: string,
    waitMs: number = 4000,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doScreenshotOneGeneratedPdf(outputFilePath, waitMs);

    this.actions.push(action);
    return this;
  }

  public appShouldHaveNoActiveJob(): FluentTester {
    const action = (): Promise<void> => this.doVerifyTempFolderIsClean();

    this.actions.push(action);
    return this;
  }

  public appShouldHaveNActiveJobs(n: number): FluentTester {
    const action = (): Promise<void> => this.doVerifyNActiveJobs(n);

    this.actions.push(action);
    return this;
  }

  public takeNamedScreenshotIfRequested(screenshotName: string): FluentTester {
    const action = (): Promise<void> =>
      takeScreenshotIfRequested(this.window, screenshotName);

    this.actions.push(action);
    return this;
  }

  public shouldHaveSentNCorrectEmails(
    qaMode: string,
    n: number,
    attachmentsCommand: string,
    attachmentType?: string
  ): FluentTester;

  public shouldHaveSentNCorrectEmails(n: number): FluentTester;

  // Then implement a single method that handles both cases
  public shouldHaveSentNCorrectEmails(
    qaModeOrN: string | number,
    n?: number,
    attachmentsCommand?: string,
    attachmentType: string = 'pdf'
  ): FluentTester {
    const action = (): Promise<void> => {
      if (typeof qaModeOrN === 'number') {
        // Called with just a number - do the COUNT_ONLY check
        return this.doVerifyEmails('COUNT_ONLY', qaModeOrN, Constants.ATTACHMENTS_DEFAULT);
      } else {
        // Called with full parameter list
        return this.doVerifyEmails(qaModeOrN, n!, attachmentsCommand!, attachmentType);
      }
    };

    this.actions.push(action);
    return this;
  }


  public gotoBurstScreen(): FluentTester {
    const action = (): Promise<void> => this.doGoToBurstScreen();

    this.actions.push(action);
    return this;
  }

  public gotoReportGenerationScreen(): FluentTester {
    const action = (): Promise<void> => this.doGotoProcessingReportGeneration();

    this.actions.push(action);
    return this;
  }

  public gotoStartScreen(): FluentTester {
    const action = (): Promise<void> => this.doGotoStart();

    this.actions.push(action);
    return this;
  }

  public gotoProcessingMergeBurstScreen(): FluentTester {
    const action = (): Promise<void> => this.doGotoProcessingMergeBurstScreen();

    this.actions.push(action);
    return this;
  }

  public gotoProcessingQualityAssuranceScreen(): FluentTester {
    const action = (): Promise<void> =>
      this.doGotoProcessingQualityAssuranceScreen();

    this.actions.push(action);
    return this;
  }

  public gotoStarterPacks(): FluentTester {
    const action = (): Promise<void> => this.doGotoStarterPacks();
    this.actions.push(action);
    return this;
  }

  private async doGotoStarterPacks(): Promise<void> {
    // Open the Help dropdown, then click "Starter Packs / Extra Utils"
    await this.doHover('#topMenuHelp');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doClick('#topMenuHelp');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doWaitOnElementToBecomeVisible('#topMenuStarterPacks');
    await this.doClick('#topMenuStarterPacks');

    //await this.doWaitOnElementToBecomeVisible('#starterPacksLoadingIndicator');
    //await this.waitOnElementToBecomeInvisible('#starterPacksLoadingIndicator');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doWaitOnElementToBecomeVisible('#appSearch');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doClick('#tab-btn-starterPacksTab');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doWaitOnElementToBecomeVisible('#packSearch');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

  }

  public gotoApps(): FluentTester {
    const action = (): Promise<void> => this.doGotoApps();
    this.actions.push(action);
    return this;
  }

  private async doGotoApps(): Promise<void> {
    // Navigate to Help → Apps / Starter Packs / Extra Utils → Apps tab
    await this.doHover('#topMenuHelp');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doClick('#topMenuHelp');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doWaitOnElementToBecomeVisible('#topMenuStarterPacks');
    await this.doClick('#topMenuStarterPacks');

    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doWaitOnElementToBecomeVisible('#appSearch');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
  }

  public gotoCmsWebPortal(): FluentTester {
    return this.gotoApps();
  }

  public gotoDataCanvas(): FluentTester {
    const action = (): Promise<void> => this.doGotoDataCanvas();
    this.actions.push(action);
    return this;
  }

  private async doGotoDataCanvas(): Promise<void> {
    await this.doHover('#topMenuBurst');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doClick('#topMenuBurst');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doWaitOnElementToBecomeVisible('#tab-btn-cmsWebPortalTab');
    await this.doClick('#tab-btn-cmsWebPortalTab');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doWaitOnElementToBecomeVisible('#appPanel_flowkraft-data-canvas');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
  }

  gotoConfigurationReports = (): FluentTester => {
    const action = (): Promise<void> => this.doGotoConfigurationReports();

    this.actions.push(action);
    return this;
  };

  private async doGotoConfigurationReports(): Promise<void> {
    await this.doHover('#topMenuBurst');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doClick('#topMenuBurst');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doHover('#topMenuConfiguration');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doClick('#topMenuConfiguration');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doHover('#topConfigurationCrud');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doClick('#topConfigurationCrud');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doClickAndSelectTableRow(
      `#confTemplatesTable tbody tr:first-child`,
    );

    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doWaitOnElementToBecomeEnabledDisabled(
      '#btnEdit',
      true,
      Constants.DELAY_TEN_SECONDS,
    );
    await this.doWaitOnElementToBecomeEnabledDisabled(
      '#btnDuplicate',
      true,
      Constants.DELAY_TEN_SECONDS,
    );
    await this.doWaitOnElementToBecomeEnabledDisabled(
      '#btnDelete',
      true,
      Constants.DELAY_TEN_SECONDS,
    );
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
  }

  public gotoConfigurationGeneralSettings(): FluentTester {
    const action = (): Promise<void> =>
      this.doGotoConfigurationGeneralSettings();

    this.actions.push(action);
    return this;
  }

  public gotoConnections(): FluentTester {
    const action = (): Promise<void> => this.doGotoConnections();

    this.actions.push(action);
    return this;
  }

  public gotoCubeDefinitions(): FluentTester {
    const action = (): Promise<void> => this.doGotoCubeDefinitions();

    this.actions.push(action);
    return this;
  }

  public navigateToConnectionsPage(): FluentTester {
    const action = (): Promise<void> => this.doNavigateToConnectionsPage();
    this.actions.push(action);
    return this;
  }

  public gotoConfiguration(): FluentTester {
    const action = (): Promise<void> => this.doGotoConfiguration();

    this.actions.push(action);
    return this;
  }

  public gotoConfigurationEmailSettings(): FluentTester {
    const action = (): Promise<void> => this.doGotoConfigurationEmailSettings();

    this.actions.push(action);
    return this;
  }

  public gotoConfigurationSMSSettings(): FluentTester {
    const action = (): Promise<void> => this.doGotoConfigurationSMSSettings();

    this.actions.push(action);
    return this;
  }

  public setCodeJarContentFromFile(
    selector: string,
    filePath: string,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doSetCodeJarContentFromFile(selector, filePath);

    this.actions.push(action);
    return this;
  }

  //PRIVATE STUFF

  private async doVerifyEmails(
    qaMode: string,
    howManyEmails: number,
    attachmentsCommand: string,
    attachmentType: string = 'pdf',
  ): Promise<void> {
    // New mode: If COUNT_ONLY is specified, only verify the email count
    const isCountOnlyMode = qaMode === 'COUNT_ONLY';

    let emailMessages: any;

    if (qaMode != Constants.QA_TA) {
      const emailMessagesResponse = await (<any>chai)
        .request('http://localhost:8025')
        .get('/api/v2/messages');

      should.exist(emailMessagesResponse);
      emailMessagesResponse.should.have.status(200);
      emailMessagesResponse.should.be.a('object');
      emailMessages = JSON.parse(emailMessagesResponse.text);

      // Check email count in MailHog
      emailMessages.total.should.equal(howManyEmails);
      emailMessages.count.should.equal(howManyEmails);

      // If COUNT_ONLY mode, stop here - we've verified the count
      if (isCountOnlyMode) {
        return;
      }
    }

    let recipientEmailAddresses = [];

    for (let i = 0; i < howManyEmails; i++) {
      let recipientEmailAddress = Constants.PAYSLIPS_PDF_BURST_TOKENS[i];

      if (qaMode != Constants.QA_TA) {
        emailMessages.items[i].To[0].Domain.should.equal(
          'northridgehealth.org',
        );

        // assert the email subject is correct
        recipientEmailAddress =
          emailMessages.items[i].To[0].Mailbox +
          '@' +
          emailMessages.items[i].To[0].Domain;

        // assert the email message is correct
        const emailSubject = emailMessages.items[i].Content.Headers.Subject[0];
        emailSubject.startsWith('Subject ').should.be.true;

        const identifiedToken = emailSubject.replace('Subject ', '');

        const emailBody = emailMessages.items[i].Content.Body;

        // body0.should.have.string('Message ' + recipientEmailAddress);
        emailBody.should.have.string(`Message ${identifiedToken}`);

        //assert branding
        emailBody.should.have.string('Sent by');

        // assert there are no attachments
        if (attachmentsCommand === Constants.ATTACHMENTS_CLEAR)
          emailBody.should.not.have.string('Content-Disposition: attachment;');
        else if (attachmentsCommand === Constants.ATTACHMENTS_ADD_AND_ZIP) {
          // assert there is a correct zip file attached
          emailBody.should.have.string('Content-Disposition: attachment;');
          emailBody.should.have.string(`reports-${identifiedToken}.zip`);
        } else if (attachmentsCommand === Constants.ATTACHMENTS_DEFAULT) {
          // assert there is a correct zip file attached
          emailBody.should.have.string('Content-Disposition: attachment;');

          if (attachmentType == 'pdf')
            emailBody.should.have.string(
              `${identifiedToken}.${attachmentType}`,
            );

          // Log the entire email body for debugging
          // console.log('Email Body:', emailBody);

          if (attachmentType == 'docx')
            emailBody.should.have.string(
              `${Constants.PAYSLIPS_PDF_BURST_TOKENS.indexOf(recipientEmailAddress)}.${attachmentType}`,
            );
        } else if (attachmentsCommand === Constants.ATTACHMENTS_XLS_ONLY) {
          // assert there is a correct zip file attached
          emailBody.should.have.string('Content-Disposition: attachment;');
          emailBody.should.have.string('Customers-Distinct-Column-Values.xls');
        } else if (attachmentsCommand === Constants.ATTACHMENTS_PDF_AND_XLS) {
          // assert there is a correct zip file attached
          emailBody.should.have.string('Content-Disposition: attachment;');
          emailBody.should.have.string(recipientEmailAddress + '.pdf');
          emailBody.should.have.string('Customers-Distinct-Column-Values.xls');
        }
        // assert ${recipientEmailAddress}_email.txt was generated
        let emailFilePath = await jetpack.findAsync(
          process.env.PORTABLE_EXECUTABLE_DIR,
          {
            matching: `output/**/${identifiedToken}_email.txt`,
          },
        );
        if (attachmentType == 'docx')
          emailFilePath = await jetpack.findAsync(
            process.env.PORTABLE_EXECUTABLE_DIR,
            {
              matching: `output/**/${Constants.PAYSLIPS_PDF_BURST_TOKENS.indexOf(recipientEmailAddress)}_email.txt`,
            },
          );

        should.exist(emailFilePath);
        emailFilePath.length.should.equal(1);
      }

      recipientEmailAddresses.push(recipientEmailAddress);
    }

    /*
    await jetpack.writeAsync(
      `${process.env.PORTABLE_EXECUTABLE_DIR}/e2e-${qaMode}.log`,
      `${qaMode} - ${recipientEmailAddresses}`
    );
    */

    Constants.PAYSLIPS_PDF_BURST_TOKENS.should.include.members(
      recipientEmailAddresses,
    );
  }

  private async doVerifyTempFolderIsClean(): Promise<void> {
    const jobFiles = await jetpack.findAsync(
      path.join(process.env.PORTABLE_EXECUTABLE_DIR, '/temp'),
      {
        matching: ['**/*.*', '!**/*.pdf'],
      },
    );

    expect(jobFiles.length).toEqual(0);
  }

  private async doVerifyNActiveJobs(n: number): Promise<void> {
    const jobFiles = await jetpack.findAsync(
      path.join(process.env.PORTABLE_EXECUTABLE_DIR, '/temp'),
      {
        matching: ['**/*.*', '!**/*.pdf'],
      },
    );

    expect(jobFiles.length).toEqual(n);
  }

  private async doVerifyNumberOfOutputFilesHavingSuffix(
    n: number,
    suffix: string,
  ): Promise<void> {
    const outputFilePaths = await jetpack.findAsync(
      process.env.PORTABLE_EXECUTABLE_DIR,
      {
        matching: `output/**/*${suffix}`,
      },
    );
    should.exist(outputFilePaths);

    expect(outputFilePaths.length).toEqual(n);
  }

  private async doVerifyFewOutputFilesHavingSuffix(
    suffix: string,
  ): Promise<void> {
    const outputFilePaths = await jetpack.findAsync(
      process.env.PORTABLE_EXECUTABLE_DIR,
      {
        matching: `output/**/*${suffix}`,
      },
    );
    should.exist(outputFilePaths);

    expect(outputFilePaths.length).toBeGreaterThan(0);
  }

  private async doScreenshotOneGeneratedPdf(
    outputFilePath: string,
    waitMs: number,
  ): Promise<void> {
    const pdfPaths = await jetpack.findAsync(
      process.env.PORTABLE_EXECUTABLE_DIR,
      { matching: 'output/**/*.pdf' },
    );
    should.exist(pdfPaths);
    expect(pdfPaths.length).toBeGreaterThan(0);

    // Newest run wins; inside it prefer 1.pdf — ScriptedReporter names burst
    // files by 1-based row index when `idcolumn` is `notused` (the default).
    const newest = pdfPaths
      .map((p) => ({
        p,
        t: jetpack.inspect(p, { times: true })?.modifyTime?.getTime() ?? 0,
      }))
      .sort((a, b) => b.t - a.t)[0].p;
    const preferred = path.join(path.dirname(newest), '1.pdf');
    const target = jetpack.exists(preferred) === 'file' ? preferred : newest;

    // HEADED system Edge, and both parts are load-bearing:
    //  - headless:false — Chromium's PDF viewer is a PLUGIN that headless does
    //    not load. Headless yields a BLANK page, not an error, so this would
    //    fail silently and ship an empty frame.
    //  - channel:'msedge' — same reason createExternalBrowser uses it: the
    //    bundled Chromium is old. (We cannot call that helper: it imports
    //    FluentTester, so using it here would be a circular import.)
    const browser = await chromium.launch({ headless: false, channel: 'msedge' });
    try {
      // A4 aspect (210:297). With `view=Fit` below, the page then fills the frame
      // instead of floating in a slab of the viewer's grey background.
      const context = await browser.newContext({
        viewport: { width: 900, height: 1273 },
      });
      const page = await context.newPage();
      // pathToFileURL, NOT a hand-built 'file:///' string: the output folder is
      // named after the report's DISPLAY name (e.g. "output/Customer Invoices/"),
      // and an unencoded space silently fails to navigate.
      //
      // The #-params are PDF Open Parameters, honoured by Chromium's viewer:
      // toolbar=0 + navpanes=0 remove the viewer's own chrome, view=Fit sizes the
      // page to the window. The result is the DOCUMENT, not a screenshot of a PDF
      // reader — which is what the video is actually about.
      await page.goto(`${pathToFileURL(target).href}#toolbar=0&navpanes=0&view=Fit`);
      // The viewer paints inside the plugin — there is no DOM event to await.
      await page.waitForTimeout(waitMs);
      await jetpack.dirAsync(path.dirname(outputFilePath));
      await page.screenshot({ path: outputFilePath });
      console.log(`[pdf-shot] ${target} -> ${outputFilePath}`);
    } finally {
      await browser.close();
    }
  }

  private async doVerifyOutputFiles(
    listOfFiles: string[],
    fileSuffix: string = 'pdf',
  ): Promise<void> {
    const outputFilePaths = await jetpack.findAsync(
      process.env.PORTABLE_EXECUTABLE_DIR,
      {
        matching: `output/**/*${fileSuffix}`,
      },
    );
    const outputFileNames = outputFilePaths.map(function (filePath) {
      return path.basename(filePath);
    });

    should.exist(outputFileNames);

    try {
      expect(
        Helpers.arrayEquals(outputFileNames.sort(), listOfFiles.sort()),
      ).toBeTruthy();
    } catch (e) {
      throw new Error(
        `Expected ${listOfFiles.sort()} but generated ${outputFileNames.sort()}`,
      );
    }
  }

  private async doDropDownShouldHaveSelectedOption(
    selector: string,
    expectedValue: string,
  ): Promise<void> {
    const selectElement = this.window.locator(selector);

    // Get the currently selected option's value
    const actualValue = await selectElement.evaluate((select) => {
      const selectElem = select as HTMLSelectElement;
      return selectElem.value;
    });

    // Assert that the actual value matches the expected value
    return expect(actualValue).toEqual(expectedValue);
  }

  private async doVerifyQuarantineFiles(
    listOfFiles: string[],
    fileSuffix: string = 'pdf',
  ): Promise<void> {
    const quarantineFilePaths = await jetpack.findAsync(
      process.env.PORTABLE_EXECUTABLE_DIR,
      {
        matching: `quarantine/**/*${fileSuffix}`,
      },
    );
    const quarantineFileNames = quarantineFilePaths.map(function (filePath) {
      return path.basename(filePath);
    });

    should.exist(quarantineFileNames);

    try {
      expect(
        Helpers.arrayEquals(quarantineFileNames.sort(), listOfFiles.sort()),
      ).toBeTruthy();
    } catch (e) {
      throw new Error(
        `Expected ${listOfFiles.sort()} but generated ${quarantineFileNames.sort()}`,
      );
    }
  }

  private async doRenameFile(path: string, newName: string): Promise<void> {
    return jetpack.renameAsync(path, newName);
  }

  private async doMoveFile(srcPath: string, destPath: string): Promise<void> {
    return jetpack.moveAsync(srcPath, destPath, { overwrite: true });
  }

  private async doCreateFolder(path: string): Promise<void> {
    await jetpack.dirAsync(path);
  }

  private async doCopyFile(srcPath: string, destPath: string): Promise<void> {
    await jetpack.copyAsync(srcPath, destPath, { overwrite: true });
  }

  private async doDeleteFolder(path: string): Promise<void> {
    await jetpack.removeAsync(path);
  }

  // ── File Content Assertion Implementations ──

  private async doFileShouldExist(filePath: string): Promise<void> {
    const exists = await jetpack.existsAsync(filePath);
    if (!exists) {
      throw new Error(`File should exist: ${filePath}`);
    }
  }

  private async doFileShouldNotExist(filePath: string): Promise<void> {
    const exists = await jetpack.existsAsync(filePath);
    if (exists) {
      throw new Error(`File should NOT exist: ${filePath}`);
    }
  }

  private async doFileContentShouldContain(filePath: string, text: string): Promise<void> {
    const content = await jetpack.readAsync(filePath);
    if (!content || !content.includes(text)) {
      throw new Error(`File ${filePath} should contain "${text}" but ${content ? 'does not' : 'file is empty/missing'}`);
    }
  }

  private async doFileContentShouldNotContain(filePath: string, text: string): Promise<void> {
    const content = await jetpack.readAsync(filePath);
    if (content && content.includes(text)) {
      throw new Error(`File ${filePath} should NOT contain "${text}" but it does`);
    }
  }

  private async doFileContentShouldMatch(filePath: string, regex: RegExp): Promise<void> {
    const content = await jetpack.readAsync(filePath);
    if (!content || !regex.test(content)) {
      throw new Error(`File ${filePath} should match ${regex} but ${content ? 'does not' : 'file is empty/missing'}`);
    }
  }

  private async doApiPostJsonValueShouldEqual(
    url: string,
    requestBody: any,
    jsonPath: string,
    expectedValue: string,
  ): Promise<void> {
    const body = await this.window.evaluate(
      async ({ fetchUrl, postBody }: { fetchUrl: string; postBody: any }) => {
        const res = await fetch(fetchUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(postBody),
        });
        if (!res.ok) throw new Error(`API POST ${fetchUrl} failed: ${res.status}`);
        return res.json();
      },
      { fetchUrl: url, postBody: requestBody },
    );
    const keys = jsonPath.split('.');
    let actual: any = body;
    for (const key of keys) {
      if (actual == null) break;
      actual = actual[key];
    }
    if (actual !== expectedValue) {
      throw new Error(
        `API POST ${url} → ${jsonPath}: expected "${expectedValue}" but got "${actual}"`,
      );
    }
  }

  private async doApiGetJsonValueShouldEqual(
    url: string,
    jsonPath: string,
    expectedValue: string,
  ): Promise<void> {
    // Use page.evaluate + fetch() instead of page.request.get() because
    // Playwright's APIRequestContext is not supported in Electron context.
    const body = await this.window.evaluate(async (fetchUrl: string) => {
      const res = await fetch(fetchUrl);
      if (!res.ok) throw new Error(`API GET ${fetchUrl} failed: ${res.status}`);
      return res.json();
    }, url);
    // Navigate the JSON path (e.g., "password" or "data.value")
    const keys = jsonPath.split('.');
    let actual: any = body;
    for (const key of keys) {
      if (actual == null) break;
      actual = actual[key];
    }
    if (actual !== expectedValue) {
      throw new Error(
        `API GET ${url} → ${jsonPath}: expected "${expectedValue}" but got "${actual}"`,
      );
    }
  }

  protected async doHover(selector: string): Promise<void> {
    this.focusedElement = this.window.locator(selector);
    return this.focusedElement.hover();
  }

  private async doFocus(selector: string): Promise<void> {
    this.focusedElement = this.window.locator(selector);

    return this.focusedElement.focus();
  }

  protected async doScrollIntoViewIfNeeded(selector: string): Promise<void> {
    this.focusedElement = this.window.locator(selector);

    return this.focusedElement.scrollIntoViewIfNeeded();
  }

  protected async doClick(selector: string): Promise<void> {
    this.focusedElement = this.window.locator(selector);

    return this.focusedElement.click();
  }

  protected async doClickElementContainingText(text: string): Promise<void> {
    this.focusedElement = this.window.locator(`:has-text('${text}')`);

    return this.focusedElement.click();
  }

  private async doDblClick(selector: string): Promise<void> {
    this.focusedElement = this.window.locator(selector);
    return this.focusedElement.dblclick();
  }

  protected async doClickAndSelectTableRow(selector: string): Promise<void> {
    //await this.doFocus(selector);

    try {
      await this.doHover(selector);
      await this.doClick(selector);
      await this.doWaitOnElementClass(
        selector,
        'info',
        true);
    } catch {
      await this.doHover(selector);
      await this.doDblClick(selector);
      await this.doWaitOnElementClass(
        selector,
        'info',
        true);
    }
  }

  private async doScrollContainerUntilElementVisible(
    containerSelector: string,
    targetSelector: string,
    maxScrolls: number,
    stepPx: number,
  ): Promise<void> {
    for (let i = 0; i < maxScrolls; i++) {
      // Check if element is visible within its scrollable container (not window viewport)
      const isVisible = await this.window.evaluate(
        ({ container, target }) => {
          const containerEl = document.querySelector(container);
          const targetEl = document.querySelector(target);

          if (!containerEl || !targetEl) return false;

          const containerRect = containerEl.getBoundingClientRect();
          const targetRect = targetEl.getBoundingClientRect();

          // Check if target is within the container's visible bounds
          return (
            targetRect.top >= containerRect.top &&
            targetRect.bottom <= containerRect.bottom &&
            targetRect.left >= containerRect.left &&
            targetRect.right <= containerRect.right
          );
        },
        { container: containerSelector, target: targetSelector },
      );

      if (isVisible) return;

      // Scroll the container (not the window)
      await this.window.evaluate(
        ({ container, step }) => {
          const el = document.querySelector(container);
          if (el) el.scrollBy(0, step);
        },
        { container: containerSelector, step: stepPx },
      );

      await Helpers.delay(150);
    }
    throw new Error(`scrollContainerUntilElementVisible: '${targetSelector}' not visible in viewport after ${maxScrolls} scrolls`);
  }

  private async doTypeText(text: string): Promise<void> {
    return this.focusedElement.fill(text);
  }

  private async doPressKey(key: string): Promise<void> {
    return this.window.keyboard.press(key);
  }

  private async doSetCodeJarContentFromFile(
    selector: string,
    filePath: string,
  ): Promise<void> {
    const content = await jetpack.readAsync(filePath);

    if (!content) {
      throw new Error(`Failed to read file content from ${filePath}`);
    }

    return this.doSetCodeJarContentSingleShot(selector, content);
  }

  //private async doPageReload(): Promise<void> {
  //this.window.reload();
  //this.window.goto(this.window.url());
  //}

  private async doWaitOnElementToBecomeVisible(
    selector: string,
    waitTime?: number,
  ): Promise<void> {
    return expect(this.window.locator(selector)).toBeVisible({
      timeout: waitTime,
    });
  }

  private async doCheckPageToContainText(text: string): Promise<void> {
    return expect(this.window.getByText(text) !== undefined).toBeTruthy();
  }

  private async doCheckPageNotToContainText(text: string): Promise<void> {
    return expect(this.window.getByText(text) !== undefined).toBeFalsy();
  }

  private async doWaitOnElementToHaveCount(
    selector: string,
    count: number,
    waitTime: number,
  ): Promise<void> {
    return expect(this.window.locator(selector)).toHaveCount(count, {
      timeout: waitTime,
    });
  }

  private async doWaitOnInputValueToContainText(
    selector: string,
    text: string,
    waitTime?: number,
  ): Promise<void> {
    let wTime = Constants.DELAY_FIVE_THOUSANDS_SECONDS;
    if (waitTime) wTime = waitTime;

    return expect(this.window.locator(selector)).toHaveValue(
      new RegExp(text, 'i'),
      {
        timeout: wTime,
      },
    );
  }

  private async doWaitOnInputToHaveValue(
    selector: string,
    value: string,
    waitTime?: number,
  ): Promise<void> {
    let wTime = Constants.DELAY_TEN_SECONDS;
    if (waitTime) wTime = waitTime;

    return expect(this.window.locator(selector)).toHaveValue(value, {
      timeout: wTime,
    });
  }

  private async doWaitOnElementToHaveText(
    selector: string,
    text: string,
    waitTime: number,
  ): Promise<void> {
    return expect(this.window.locator(selector)).toHaveText(
      FluentTester.toLooseTextMatcher(text),
      { timeout: waitTime },
    );
  }

  /**
   * Build a regex that matches `text` ignoring all whitespace and case.
   * Use this to compare against rendered text where template whitespace,
   * non-breaking spaces, or theme casing might vary without changing intent.
   */
  private static toLooseTextMatcher(text: string): RegExp {
    const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const collapsed = escaped.replace(/\s+/g, '\\s*');
    return new RegExp(collapsed, 'i');
  }

  public waitOnElementToBecomeReadonly(
    selector: string,
    waitTime?: number,
  ): FluentTester {
    let delay = Constants.DELAY_HUNDRED_SECONDS;
    if (waitTime) delay = waitTime;
    const action = (): Promise<void> =>
      this.doWaitOnElementToBecomeReadonlyEditable(selector, true, delay);

    this.actions.push(action);
    return this;
  }

  public waitOnElementToBecomeEditable(
    selector: string,
    waitTime?: number,
  ): FluentTester {
    let delay = Constants.DELAY_HUNDRED_SECONDS;
    if (waitTime) delay = waitTime;
    const action = (): Promise<void> =>
      this.doWaitOnElementToBecomeReadonlyEditable(selector, false, delay);

    this.actions.push(action);
    return this;
  }

  public setQuillContent(selector: string, content: string): FluentTester {
    const action = (): Promise<void> => this.doSetQuillContent(selector, content);
    this.actions.push(action);
    return this;
  }

  private async doSetQuillContent(selector: string, content: string): Promise<void> {
    const editorSelector = `${selector} .ql-editor`;
    await this.window.locator(editorSelector).click();
    await this.window.locator(editorSelector).fill(''); // Clear existing content
    await this.window.locator(editorSelector).press('Control+A');
    await this.window.locator(editorSelector).press('Delete');
    await this.window.locator(editorSelector).fill(content);
  }

  public quillShouldContainText(selector: string, text: string): FluentTester {
    const action = (): Promise<void> => this.doQuillShouldContainText(selector, text);
    this.actions.push(action);
    return this;
  }

  private async doQuillShouldContainText(selector: string, text: string): Promise<void> {
    const editorSelector = `${selector} .ql-editor`;
    await expect(this.window.locator(editorSelector)).toContainText(text);
  }

  // Add this to your FluentTester class
  public codeJarShouldContainText(
    selector: string,
    text: string,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckCodeJarContainsText(selector, text);
    this.actions.push(action);
    return this;
  }

  public codeJarShouldNotContainText(
    selector: string,
    text: string,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doCheckCodeJarDoesNotContainText(selector, text);
    this.actions.push(action);
    return this;
  }

  private async doCheckCodeJarContainsText(
    selector: string, // This is the main CodeJar container, e.g., '#sqlQueryEditor'
    expectedText: string,
  ): Promise<void> {
    //const codeJarContainer = this.window.locator(selector);
    //await expect(codeJarContainer).toBeVisible({
    //  timeout: Constants.DELAY_FIVE_THOUSANDS_SECONDS,
    //});

    // Selector for the actual editable <pre> element within the CodeJar component
    const editablePreSelector = `${selector} pre[contenteditable]`;

    const actualContent = await this.window.evaluate((sel) => {
      const preElement = document.querySelector(sel) as HTMLPreElement | null;
      if (!preElement) {
        return null;
      }
      // For an empty editor, textContent should be "" or perhaps "\n" if it contains a single <br>
      // Using innerText might be slightly more robust for how browsers interpret visible text
      // but textContent is generally faster. Let's stick with textContent and normalize.
      //return preElement.textContent || '';
      return preElement.innerText || '';
    }, editablePreSelector);

    if (actualContent === null) {
      throw new Error(
        `CodeJar editor's editable <pre> element with selector "${editablePreSelector}" was not found.`,
      );
    }

    // Normalize newline characters and trim whitespace.
    // Trimming is important because an "empty" editor might have a newline character.
    const normalizeAndTrim = (str: string) =>
      str.replace(/\r\n|\r/g, '\n').trim();

    const normalizedActualContent = normalizeAndTrim(actualContent);
    const normalizedExpectedText = normalizeAndTrim(expectedText);

    if (normalizedExpectedText === '') {
      // If expecting an empty string, the normalized content must be exactly empty.
      expect(normalizedActualContent).toEqual('');
    } else {
      // If expecting non-empty text, check if the normalized content includes it.
      // Using toEqual for non-empty might be too strict if formatting/whitespace within the expected text matters.
      // Using toContain is generally safer for "contains" checks.
      // If an exact match is needed for non-empty strings, change toEqual here too.
      expect(normalizedActualContent).toContain(normalizedExpectedText);
    }
  }

  private async doCheckCodeJarDoesNotContainText(
    selector: string,
    expectedText: string,
  ): Promise<void> {
    const editablePreSelector = `${selector} pre[contenteditable]`;

    const actualContent = await this.window.evaluate((sel) => {
      const preElement = document.querySelector(sel) as HTMLPreElement | null;
      if (!preElement) {
        return null;
      }
      return preElement.innerText || '';
    }, editablePreSelector);

    if (actualContent === null) {
      // If the element doesn't exist, it doesn't contain the text, so this passes.
      return;
    }

    const normalizeAndTrim = (str: string) =>
      str.replace(/\r\n|\r/g, '\n').trim();

    const normalizedActualContent = normalizeAndTrim(actualContent);
    const normalizedExpectedText = normalizeAndTrim(expectedText);

    expect(normalizedActualContent).not.toContain(normalizedExpectedText);
  }

  public setCodeJarContent(selector: string, content: string): FluentTester {
    const action = (): Promise<void> =>
      this.doSetCodeJarContent(selector, content);
    this.actions.push(action);
    return this;
  }

  public setCodeJarContentSingleShot(
    selector: string,
    content: string,
  ): FluentTester {
    const action = (): Promise<void> =>
      this.doSetCodeJarContentSingleShot(selector, content);
    this.actions.push(action);
    return this;
  }

  private async doSetCodeJarContent(
    selector: string,
    content: string,
  ): Promise<void> {
    // First find and focus the editor
    await this.window.locator(`${selector} [contenteditable]`).click();

    // Clear existing content using keyboard shortcuts
    await this.window.keyboard.press('Control+a');
    await this.window.keyboard.press('Delete');

    // Wait briefly for the editor to update
    await this.window.waitForTimeout(100);

    // Type the content using the keyboard API
    await this.window.keyboard.type(content, { delay: 0 });

    // Wait for CodeJar to process events and trigger change detection
    await this.window.waitForTimeout(500);

    // Force save by pressing Ctrl+S (optional - only if your app supports this)
    await this.window.keyboard.press('Control+s');

    // Wait for potential toast notifications
    try {
      await this.window.waitForSelector('.alert-success', {
        state: 'visible',
        timeout: 5000,
      });
      //console.log('Toast success notification appeared');
    } catch (err) {
      console.warn('No success toast appeared after setting content');
    }
  }

  private async doSetCodeJarContentSingleShot(
    selector: string,
    content: string,
  ): Promise<void> {
    // One-shot insertion via Playwright's keyboard.insertText: fires a single
    // beforeinput+input event pair with inputType:'insertText' and data set to
    // the full content — same event shape a real paste produces. This is what
    // ngx-codejar / CodeJar's internal listener treats as an authentic content
    // change, so the (update) emit fires once with the full content and the
    // bound [(code)] property propagates to the host component (which in turn
    // sets things like `domainGroupedSchemaExists`).
    //
    // Why not the previous approach (`editor.textContent = content` +
    // `dispatchEvent(new Event('input'))` + End-keypress nudge): synthetic
    // `Event('input')` has no `inputType`/`data`, ngx-codejar's debounced
    // update emits but the host's (update) handler doesn't always see the
    // final content propagate through `[(code)]` — leaving Angular's model
    // empty even though the DOM shows the text.
    //
    // Why not `keyboard.type` (the older `setCodeJarContent`): char-by-char
    // fires one keydown per char, and each intermediate state runs the (update)
    // handler on partial/invalid JSON which the handler discards in its
    // try/catch. The final valid-JSON emission can be coalesced or arrive too
    // late for the test's downstream waits. Also: typing 5KB of JSON one char
    // at a time is slow.
    // TRUE bulk insertion in a single operation — preserves newlines AND
    // triggers OnPush + signal-based change detection on the host component.
    //
    // The pieces and why each one is necessary:
    //
    //   1. `editor.textContent = content` — single bulk write to the DOM.
    //      Newlines (`\n`) are stored verbatim in the resulting text node,
    //      and `white-space: pre` on the editor renders them as real line
    //      breaks. This is what `keyboard.insertText(content)` cannot do —
    //      it dispatches one `input(inputType:'insertText')` event whose
    //      embedded LFs are treated as whitespace and never become Enter
    //      keystrokes (Playwright docs: "multiline support is platform
    //      specific"). For JSON that's harmless because the parser ignores
    //      whitespace; for newline-significant code (Groovy/Python/SQL)
    //      it silently corrupts the script (`import groovy.sql.Sql\ndef…`
    //      becomes the unparseable `import groovy.sql.Sqldef…`).
    //
    //   2. `dispatchEvent(new Event('input'))` — tells ngx-codejar's
    //      internal input listener that content changed, so it runs its
    //      highlight pass and emits its `(update)` Output. Synthetic
    //      events DO go through Zone.js (it patches dispatchEvent), so
    //      ngx-codejar receives them. This part worked on main.
    //
    //   3. Real `Tab` keystroke afterwards — the regression-specific bit.
    //      The post-refactor host components (connection-details,
    //      ai-manager, etc.) are signal-based + OnPush. With OnPush, an
    //      `@Output` emit triggered by a SYNTHETIC dispatchEvent doesn't
    //      always mark the host for check, so the host's `(update)`
    //      handler runs but its property assignments don't propagate
    //      through the next CD cycle — the bound property looks empty to
    //      downstream code. A real keystroke (Tab) goes through
    //      Electron's input pipeline → Chrome event loop → Zone.js,
    //      which DOES schedule an appRef.tick() that re-evaluates the
    //      OnPush host. Tab specifically blurs the editor too, which
    //      ngx-codejar 7.x uses as a "flush pending update" trigger.
    //
    // Single bulk write (#1) + synthetic event (#2) for the editor +
    // real keystroke (#3) for the host's CD = fast AND correct.
    //
    //   0. Real Ctrl+A + Delete BEFORE the bulk write — clears whatever
    //      the editor previously contained through the real input pipeline.
    //      A bare `textContent = ''` is insufficient for the empty-content
    //      case: contenteditables routinely keep a `<br>` placeholder or a
    //      zero-width text node after a textContent='' assignment, and
    //      ngx-codejar reads that back as non-empty — the bound property
    //      keeps its prior value, downstream "is empty?" assertions stay
    //      false. Real `Delete` after `Ctrl+A` removes those placeholders
    //      AND fires real input events through Zone.js so OnPush+signal
    //      CD sees the delete. (For non-empty content this prelude is also
    //      cheap and harmless — selects whatever is there, deletes it, then
    //      step #1 writes the new content.)
    const editor = this.window.locator(`${selector} [contenteditable]`);
    await editor.click();
    await this.window.keyboard.press('Control+a');
    await this.window.keyboard.press('Delete');

    await this.window.evaluate(
      ({ sel, c }) => {
        const el = document.querySelector(`${sel} [contenteditable]`);
        if (!el) throw new Error('CodeJar editor element not found: ' + sel);
        el.textContent = c;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
      { sel: selector, c: content },
    );
    // Reliable (update) trigger after the fast bulk fill above.
    //
    // The bulk write (textContent = content) is fast but its SYNTHETIC
    // dispatchEvent('input') does NOT reliably reach CodeJar's onUpdate for an
    // editor whose tab/section was display:none at init (e.g. #paramsSpecEditor
    // in a dp-tab). When onUpdate never fires, ngx-codejar's (update) never
    // emits, the host handler never runs, and the DSL is saved empty.
    //
    // So we finish with a net-zero REAL edit that a human-equivalent input
    // pipeline drives: re-CLICK the editor to place an actual caret (the
    // textContent assignment cleared the selection — .focus() alone does NOT
    // place a caret, so subsequent keystrokes wouldn't edit anything), jump to
    // End, type one space, then Backspace it. Each real keystroke goes through
    // Electron → Chrome → CodeJar's input listener → onUpdate with the TRUE
    // content, exactly like manual typing — for BOTH visible- and hidden-init
    // editors. Net content is unchanged. (Space+Backspace is safe for the
    // empty-content case too, unlike Tab which leaves a stray indent \t.)
    await editor.click();
    await this.window.keyboard.press('End');
    await this.window.keyboard.type(' ');
    await this.window.keyboard.press('Backspace');
    await this.sleep(Constants.DELAY_HALF_SECOND);
  }

  /**
   * Pastes the current OS-clipboard text into a CodeJar contenteditable.
   *
   * Electron-Playwright's synthesised `Control+V` does not couple the OS
   * clipboard to the contenteditable's paste event in a way CodeJar's
   * `(update)` model picks up — the editor stays empty even though the
   * clipboard holds the right content. This helper bridges that gap by
   * reading `navigator.clipboard.readText()` inside the page and dispatching
   * a real `input` event after assigning `textContent`, which is what CodeJar
   * actually listens to. The OS clipboard is still the source — Copy buttons
   * remain end-to-end tested through `clipboardShouldContainText` upstream.
   */
  public pasteClipboardIntoCodeJar(selector: string): FluentTester {
    const action = (): Promise<void> =>
      this.doPasteClipboardIntoCodeJar(selector);
    this.actions.push(action);
    return this;
  }

  private async doPasteClipboardIntoCodeJar(selector: string): Promise<void> {
    // 1. Read clipboard, write into the contenteditable, dispatch synthetic events.
    await this.window.evaluate(async (sel) => {
      const editor = document.querySelector(
        `${sel} [contenteditable]`,
      ) as HTMLElement | null;
      if (!editor) {
        throw new Error(`CodeJar editor element not found: ${sel}`);
      }

      const content = await navigator.clipboard.readText();

      editor.textContent = content;
      const rawContent = editor.innerHTML;
      editor.innerHTML = rawContent;

      editor.dispatchEvent(new Event('input', { bubbles: true }));
      editor.dispatchEvent(new Event('change', { bubbles: true }));
    }, selector);

    // 2. CodeJar's onUpdate callback (the one that propagates to Angular's
    //    `[(code)]` two-way binding and `(update)` output) fires reliably on
    //    real keyup events but not always on synthetic dispatch from
    //    page.evaluate. Focus + a real End keypress nudge it to sync — same
    //    trick `doSetCodeJarContentSingleShot` uses. Without this, the DOM
    //    has the script but the Angular model stays empty, leaving Run
    //    disabled (`!customSeedScript?.trim()` is true).
    await this.window.locator(`${selector} [contenteditable]`).focus();
    await this.window.keyboard.press('End');
    await this.sleep(Constants.DELAY_HALF_SECOND);
  }

  /*
  private async doSetCodeJarContent(
    selector: string,
    content: string,
  ): Promise<void> {
    // Set content in the code jar component
    await this.window.evaluate(
      ({ selector, content }) => {
        // Find the ngx-codejar component
        const codeJarComponent = document.querySelector(selector);
        if (!codeJarComponent) {
          throw new Error(`CodeJar component not found: ${selector}`);
        }

        // Find the actual editor div (contenteditable element)
        const editor = codeJarComponent.querySelector('[contenteditable]');
        if (!editor) {
          throw new Error('CodeJar editor element not found');
        }

        // Set the content
        editor.innerHTML = content;

        // Trigger input event to notify Angular
        const inputEvent = new Event('input', { bubbles: true });
        editor.dispatchEvent(inputEvent);

        // Also dispatch change event for good measure
        const changeEvent = new Event('change', { bubbles: true });
        editor.dispatchEvent(changeEvent);

        // Get the CodeJar component instance
        const ngCodeJarInstance = Array.from(
          Object.entries(codeJarComponent),
        ).find(
          ([key, value]) =>
            key.startsWith('__ngContext') && value && typeof value === 'object',
        )?.[1];

        // Update the model if possible
        if (ngCodeJarInstance) {
          // Try different property names that could represent the model
          const possibleModelProps = ['code', '_code', 'value'];
          for (const prop of possibleModelProps) {
            if (prop in ngCodeJarInstance) {
              ngCodeJarInstance[prop] = content;
              break;
            }
          }

          // Try to emit the change event
          if (
            'codeChange' in ngCodeJarInstance &&
            typeof ngCodeJarInstance.codeChange?.emit === 'function'
          ) {
            ngCodeJarInstance.codeChange.emit(content);
          }
        }

        return true;
      },
      { selector, content },
    );

    // Small delay to allow Angular to process the change
    await this.window.waitForTimeout(500);

    // Explicitly call the component's onTemplateContentChanged handler
    await this.window.evaluate((selector) => {
      // Find the configuration component
      const configComponent = document.querySelector('dburst-configuration');
      if (!configComponent) return false;

      // Find the Angular component instance with the handler method
      let componentInstance = null;

      // Try different ways to access the component instance
      // Method 1: Look through __ngContext__
      for (const key in configComponent) {
        if (key.startsWith('__ngContext')) {
          const context = configComponent[key];
          // Look for the component instance
          for (
            let i = 0;
            context && Array.isArray(context) && i < context.length;
            i++
          ) {
            if (
              context[i] &&
              typeof context[i].onTemplateContentChanged === 'function'
            ) {
              componentInstance = context[i];
              break;
            }
          }
        }
      }

      // Method 2: Try accessing instance directly
      if (
        !componentInstance &&
        typeof configComponent['onTemplateContentChanged'] === 'function'
      ) {
        componentInstance = configComponent;
      }

      // Call the handler if we found it
      if (componentInstance) {
        const editorContent = document.querySelector(
          `${selector} [contenteditable]`,
        )?.innerHTML;
        if (editorContent) {
          componentInstance.onTemplateContentChanged(editorContent);
          console.log(
            'Successfully called onTemplateContentChanged with content',
          );
          return true;
        }
      }

      console.warn(
        'Could not find component instance with onTemplateContentChanged method',
      );
      return false;
    }, selector);

    // Wait for toast notification indicating save success
    try {
      await this.window.waitForSelector('.alert-success', {
        state: 'visible',
        timeout: 5000,
      });
      console.log('Toast success notification appeared');
    } catch (err) {
      console.warn('No success toast appeared after setting content');
    }
  }
*/

  protected async doWaitOnElementToBecomeReadonlyEditable(
    selector: string,
    isReadonly: boolean,
    waitTime: number,
  ): Promise<void> {
    const locator = this.window.locator(selector);

    if (isReadonly) {
      // Wait for readonly attribute to exist with any value
      return expect(locator).toHaveAttribute('readonly', '', {
        timeout: waitTime,
      });
    } else {
      // Wait for readonly attribute to not exist
      return expect(locator).not.toHaveAttribute('readonly', {
        timeout: waitTime,
      });
    }
  }

  private async doWaitOnElementWithTextToBecome(
    text: string,
    visible: boolean,
    waitTime: number,
  ): Promise<void> {
    //console.log(`waitTime: ${waitTime}`);
    if (visible)
      return expect(this.window.locator(`text=${text}`)).toHaveCount(1, {
        timeout: waitTime,
      });
    else
      return expect(this.window.locator(`text=${text}`)).toHaveCount(0, {
        timeout: waitTime,
      });
  }

  protected async doWaitOnElementToBecomeEnabledDisabled(
    selector: string,
    isEnabled: boolean,
    waitTime: number,
  ): Promise<void> {
    //console.log(`waitTime: ${waitTime}`);
    if (isEnabled)
      return expect(this.window.locator(selector)).toBeEnabled({
        timeout: waitTime,
      });
    else
      return expect(this.window.locator(selector)).toBeDisabled({
        timeout: waitTime,
      });
  }

  private async doCheckElementToContainText(
    selector: string,
    text: string,
  ): Promise<void> {
    return expect(this.window.locator(selector)).toContainText(text);
  }

  private async doCheckSelectedOptionShouldContainText(
    selector: string,
    text: string,
  ): Promise<void> {
    const selectElement = this.window.locator(selector);

    const selectedOption = await selectElement.evaluate((select) => {
      const selectElem = select as HTMLSelectElement;
      return selectElem.options[selectElem.selectedIndex].text;
    });

    expect(selectedOption).toContain(text);
  }

  private async doDropDownSelectOptionHavingLabel(
    selector: string,
    label: string,
  ): Promise<void> {
    const selectElement = this.window.locator(selector);

    selectElement.selectOption({ label: label });
  }

  // Add this private implementation method
  private async doDropDownSelectOptionHavingValue(
    selector: string,
    value: string,
  ): Promise<void> {
    const selectElement = this.window.locator(selector);

    selectElement.selectOption({ value: value });
  }

  // Add this public method
  public setCheckboxState(selector: string, checked: boolean): FluentTester {
    const action = (): Promise<void> =>
      this.doSetCheckboxState(selector, checked);
    this.actions.push(action);
    return this;
  }

  // Add this private implementation method
  private async doSetCheckboxState(
    selector: string,
    checked: boolean,
  ): Promise<void> {
    const isCurrentlyChecked = await this.window.locator(selector).isChecked();

    // Toggle the checkbox only if its current state doesn't match the desired state
    if (isCurrentlyChecked !== checked) {
      await this.window.locator(selector).click();
    }
  }

  private async doClearValue(selector: string): Promise<void> {
    await this.window.locator(selector).fill('');
  }

  private async doSetValue(selector: string, value: string): Promise<void> {
    await this.doClick(selector);
    await this.doTypeText(value);
  }

  private async doSetInputFiles(
    selector: string,
    files: string | readonly string[],
  ): Promise<void> {
    this.focusedElement = this.window.locator(selector);
    await this.focusedElement.setInputFiles(files);
  }

  private async doCheckElementToHaveText(
    selector: string,
    text: string,
  ): Promise<void> {
    return expect(this.window.locator(selector)).toHaveText(
      FluentTester.toLooseTextMatcher(text),
    );
  }

  private async doWaitOnFileToContainText(filePath: string, text: string) {
    //console.log(text);

    const startTime = new Date().getTime();

    let content = '';
    let found = false;

    do {
      content = await jetpack.readAsync(filePath);
      //console.log(`filePath = ${filePath}, content = ${content}`);
      const endTime = new Date().getTime();
      if ((endTime - startTime) / 1000 > Constants.DELAY_FIVE_THOUSANDS_SECONDS)
        throw new Error(
          `File ${filePath} still not containing ${text} after waiting ${Constants.DELAY_FIVE_THOUSANDS_SECONDS} seconds`,
        );

      if (content) found = content.includes(text);
      if (!found) await Helpers.delay(Constants.DELAY_ONE_SECOND);
    } while (!found);
  }

  private async doWaitOnElementToContainText(
    selector: string,
    text: string,
    waitTime?: number,
  ): Promise<void> {
    let wTime = Constants.DELAY_HUNDRED_SECONDS;
    if (waitTime) wTime = waitTime;

    return expect(this.window.locator(selector)).toContainText(text, {
      timeout: wTime,
    });
  }

  private async doCheckElementExists(
    selector: string,
    exists: boolean,
  ): Promise<void> {
    if (exists) {
      //console.log(selector);
      return expect(
        await this.window.locator(selector).count(),
      ).toBeGreaterThan(0);
    } else
      return expect(await this.window.locator(selector).count()).toEqual(0);
  }

  private async doCheckElementEnabledStatus(
    selector: string,
    isEnabled: boolean,
  ): Promise<void> {
    if (isEnabled) return expect(this.window.locator(selector)).toBeEnabled();
    else return expect(this.window.locator(selector)).toBeDisabled();
  }

  private async doCheckElementClass(
    selector: string,
    className: string,
    isPresent: boolean,
  ): Promise<void> {
    const expression: RegExp = new RegExp(className);

    if (isPresent)
      return expect(this.window.locator(selector)).toHaveClass(expression);
    else
      return expect(this.window.locator(selector)).not.toHaveClass(expression);
  }

  private async doWaitOnElementClass(
    selector: string,
    className: string,
    isPresent: boolean,
    waitTime?: number,
  ): Promise<void> {
    let wTime = Constants.DELAY_HUNDRED_SECONDS;
    if (waitTime) wTime = waitTime;

    const expression: RegExp = new RegExp(className);

    if (isPresent)
      return expect(this.window.locator(selector)).toHaveClass(expression, {
        timeout: wTime,
      });
    else
      return expect(this.window.locator(selector)).not.toHaveClass(expression, {
        timeout: wTime,
      });
  }

  private async doCheckInputHasValue(
    selector: string,
    value: string,
  ): Promise<void> {
    return expect(await this.window.locator(selector).inputValue()).toEqual(
      value,
    );
  }

  private async doCheckElementAttributeHasValue(
    selector: string,
    attribute: string,
    value: string,
  ): Promise<void> {
    return expect(
      await this.window.locator(selector).getAttribute(attribute),
    ).toEqual(value);
  }

  private async doCheckElementAttributeExistence(
    selector: string,
    attribute: string,
    isPresent: boolean,
  ): Promise<void> {
    if (isPresent)
      return expect(
        await this.window.locator(selector).getAttribute(attribute),
      ).not.toBeNull();
    else
      return expect(
        await this.window.locator(selector).getAttribute(attribute),
      ).toBeNull();
  }

  private async doCheckCheckBoxValue(
    selector: string,
    value: boolean,
  ): Promise<void> {
    return expect(await this.window.locator(selector).isChecked()).toEqual(
      value,
    );
  }

  private async doAppShouldBeReadyToRunNewJobs(): Promise<void> {
    await this.doWaitOnElementToContainText(
      '#noJobsRunning',
      'No jobs are currently',
      Constants.DELAY_FIVE_THOUSANDS_SECONDS,
    );
  }

  private async doWaitOnSkinToBeCorrectlySaved(skin: string): Promise<void> {
    const configFilePath = path.resolve(
      slash(
        path.join(
          process.env.PORTABLE_EXECUTABLE_DIR,
          PATHS.CONFIG_PATH,
          '/settings.xml',
        ),
      ),
    );

    //console.log(configFilePath);

    return this.doWaitOnFileToContainText(
      configFilePath,
      `<skin>${skin}</skin>`,
    );
  }

  private async doCheckAppStatus(status: string): Promise<void> {
    const selector =
      status === Constants.STATUS_GREAT_NO_ERRORS_NO_WARNINGS
        ? '#btnGreatNoErrorsNoWarnings'
        : status === Constants.STATUS_WARNINGS
          ? '#btnWarnings'
          : '#btnErrors';
    // The status bar is driven by JobManScheduler's 250ms poll of errors.log / warnings.log
    // sizes, broadcast over WebSocket. Right after a failed command, the HTTP response comes
    // back before the next poll tick, so a one-shot count() check races the WebSocket update.
    // Use toHaveCount, which auto-retries until the condition holds (or timeout fires).
    await expect(this.window.locator(selector)).toHaveCount(1, {
      timeout: Constants.DELAY_TEN_SECONDS,
    });
  }

  private async doWaitOnProcessingToStart(howToCheck: string): Promise<void> {
    if (howToCheck === Constants.CHECK_PROCESSING_JAVA) {
      await this.doWaitOnElementToBecomeVisible(
        '.java-started',
        Constants.DELAY_FIVE_THOUSANDS_SECONDS,
      );
    } else if (howToCheck === Constants.CHECK_PROCESSING_STATUS_BAR) {
      await this.doWaitOnElementToContainText(
        '#workingOn',
        'Working on',
        Constants.DELAY_FIVE_THOUSANDS_SECONDS,
      );
    } else {
      await this.doWaitOnFileToContainText(
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/info.log`,
          ),
        ),
        'Program Started',
      );
    }
  }

  private async doWaitOnProcessingToFinish(howToCheck: string): Promise<void> {
    if (howToCheck === Constants.CHECK_PROCESSING_JAVA) {
      await this.doWaitOnElementToBecomeVisible(
        '.java-exited',
        Constants.DELAY_FIVE_THOUSANDS_SECONDS,
      );
    } else if (howToCheck === Constants.CHECK_PROCESSING_STATUS_BAR) {
      await this.doWaitOnElementToContainText(
        '#noJobsRunning',
        'No jobs are currently',
        Constants.DELAY_FIVE_THOUSANDS_SECONDS,
      );
    } else {
      await this.doWaitOnFileToContainText(
        path.resolve(
          slash(
            `${process.env.PORTABLE_EXECUTABLE_DIR}/${PATHS.LOGS_PATH}/info.log`,
          ),
        ),
        'Execution Ended',
      );
    }
  }

  private async doGotoProcessingMergeBurstScreen(): Promise<void> {
    await this.doHover('#topMenuBurst');
    await this.doClick('#topMenuBurst');
    await this.doEnsureSidebarOpen();

    await this.doClick('#leftMenuMergeBurst');
  }

  private async doGotoProcessingReportGeneration(): Promise<void> {
    await this.doHover('#topMenuBurst');
    await this.doClick('#topMenuBurst');
    await this.doClick('#tab-btn-reportGenerationMailMergeTab');
  }

  private async doGotoStart(): Promise<void> {
    //await this.doClick('#supportEmail');

    await this.doGoToBurstScreen();

    //await this.doClick('#burstFile');
    //.sleep(Constants.DELAY_HUNDRED_SECONDS)
    await this.doWaitOnProcessingToFinish(
      Constants.CHECK_PROCESSING_STATUS_BAR,
    );

    await this.doAppShouldBeReadyToRunNewJobs();

    await this.doWaitOnElementToBecomeVisible(
      '#btnGreatNoErrorsNoWarnings',
      Constants.DELAY_FIVE_THOUSANDS_SECONDS,
    );

    await this.doCheckAppStatus(Constants.STATUS_GREAT_NO_ERRORS_NO_WARNINGS);
  }

  private async doGoToBurstScreen(): Promise<void> {
    //await this.doClick('#supportEmail');
    await this.doHover('#topMenuBurst');
    await this.doClick('#topMenuBurst');
    await this.doEnsureSidebarOpen();

    //await this.doClick('#tab-btn-burstTab');
  }

  private async doGotoProcessingQualityAssuranceScreen(): Promise<void> {
    await this.doHover('#topMenuBurst');
    await this.doClick('#topMenuBurst');
    await this.doEnsureSidebarOpen();

    await this.doClick('#leftMenuQualityAssurance');
  }

  private async doEnsureSidebarOpen(): Promise<void> {
    // Screenshot runs document the clean default screen WITHOUT the left sidebar,
    // and no *.screens.ts spec navigates via the left menu. Skip the forced open
    // so the sidebar never flashes on during doc captures. Functional specs (which
    // DO click #leftMenu* items) never run in screenshot mode, so this is safe.
    if (process.env.E2E_SCREENSHOTS) return;
    const isVisible = await this.window.evaluate(() =>
      document.documentElement.classList.contains('sidebar-visible'),
    );
    if (!isVisible) {
      await this.doClick('#btnToggleSidebar');
    }
  }

  private async doGotoConnections(): Promise<void> {
    await this.doHover('#topMenuBurst');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doClick('#topMenuBurst');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doHover('#topMenuConfiguration');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doClick('#topMenuConfiguration');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doHover('#topConfigurationCrud');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doClick('#topConfigurationCrud');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doClick('#btnNavSectionConnections');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doWaitOnElementToBecomeVisible(`#${PATHS.EML_CONTACT_FILE}`);

    await this.doClickAndSelectTableRow(
      `#extConnectionsTable tbody tr:first-child`,
    );

    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doWaitOnElementToBecomeEnabledDisabled(
      '#btnEdit',
      true,
      Constants.DELAY_TEN_SECONDS,
    );

    await this.doWaitOnElementToBecomeEnabledDisabled(
      '#btnDuplicate',
      true,
      Constants.DELAY_TEN_SECONDS,
    );
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
  }

  private async doGotoCubeDefinitions(): Promise<void> {
    await this.doHover('#topMenuBurst');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doClick('#topMenuBurst');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doHover('#topMenuConfiguration');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doClick('#topMenuConfiguration');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doHover('#topConfigurationCrud');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doClick('#topConfigurationCrud');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);

    await this.doClick('#btnNavSectionCubes');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
  }

  private async doNavigateToConnectionsPage(): Promise<void> {
    await this.doHover('#topMenuBurst');
    await this.doClick('#topMenuBurst');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doHover('#topMenuConfiguration');
    await this.doClick('#topMenuConfiguration');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doHover('#topConfigurationCrud');
    await this.doClick('#topConfigurationCrud');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doClick('#btnNavSectionConnections');
    await Helpers.delay(Constants.DELAY_HUNDRED_MILISECONDS);
    await this.doWaitOnElementToBecomeEnabledDisabled('#btnNewDropdown', true, Constants.DELAY_TEN_SECONDS);
  }

  private async doGotoConfiguration(): Promise<void> {
    //await this.doHover('#supportEmail');
    //await this.doClick('#supportEmail');
    await this.doHover('#topMenuBurst');
    await this.doClick('#topMenuBurst');

    await this.doHover('#topMenuConfiguration');
    //await this.doFocus('#topMenuConfiguration');
    await this.doClick('#topMenuConfiguration');
  }

  private async doGotoConfigurationGeneralSettings(): Promise<void> {
    await this.doHover('#topMenuBurst');
    await this.doClick('#topMenuBurst');

    await this.doClick('#topMenuConfiguration');
    await this.doWaitOnElementToBecomeVisible('#topMenuConfigurationLoad_burst_' + PATHS.SETTINGS_CONFIG_FILE);
    await this.doClick(
      '#topMenuConfigurationLoad_burst_' + PATHS.SETTINGS_CONFIG_FILE,
    );
    await this.doClick('#leftMenuGeneralSettings');
  }

  private async doGotoConfigurationEmailSettings(): Promise<void> {
    await this.doHover('#topMenuBurst');
    await this.doClick('#topMenuBurst');

    await this.doClick('#topMenuConfiguration');
    await this.doWaitOnElementToBecomeVisible('#topMenuConfigurationLoad_burst_' + PATHS.SETTINGS_CONFIG_FILE);
    await this.doClick(
      '#topMenuConfigurationLoad_burst_' + PATHS.SETTINGS_CONFIG_FILE,
    );
    await this.doClick('#leftMenuEmailSettings');
    await this.doWaitOnElementToBecomeVisible('#btnSendTestEmail');
  }

  private async doGotoConfigurationSMSSettings(): Promise<void> {
    await this.doHover('#topMenuBurst');
    await this.doClick('#topMenuBurst');

    await this.doClick('#topMenuConfiguration');
    await this.doWaitOnElementToBecomeVisible('#topMenuConfigurationLoad_burst_' + PATHS.SETTINGS_CONFIG_FILE);
    await this.doClick(
      '#topMenuConfigurationLoad_burst_' + PATHS.SETTINGS_CONFIG_FILE,
    );
    await this.doClick('#leftMenuSMSSettings');
  }

  /**
   * Execute an arbitrary shell command in a directory relative to PORTABLE_EXECUTABLE_DIR.
   * Useful for docker compose commands, git operations, etc.
   *
   * @param command - The command to execute (e.g., 'docker compose down', 'git status')
   * @param relativeDir - Directory relative to PORTABLE_EXECUTABLE_DIR (e.g., 'db', 'config'). Defaults to base directory.
   * @param timeoutMs - Command timeout in milliseconds. Defaults to 5 seconds.
   * @returns FluentTester instance for chaining
   *
   * @example
   * // Docker compose down in db folder
   * new FluentTester(page).executeCommand('docker compose down', 'db');
   *
   * @example
   * // Docker compose up without volumes
   * new FluentTester(page).executeCommand('docker compose up -d', 'db', 10000);
   */
  executeCommand(
    command: string,
    relativeDir: string = '',
    timeoutMs: number = Constants.DELAY_FIVE_THOUSANDS_SECONDS
  ): FluentTester {
    this.actions.push(async (): Promise<void> => {
      await this.doExecuteCommand(command, relativeDir, timeoutMs);
    });
    return this;
  }

  private async doExecuteCommand(
    command: string,
    relativeDir: string,
    timeoutMs: number
  ): Promise<void> {
    const baseDir = String(process.env.PORTABLE_EXECUTABLE_DIR || '.');
    const targetDir = relativeDir ? path.resolve(baseDir, relativeDir) : baseDir;
    const isWin = process.platform === 'win32';

    let cmd: string;
    let args: string[];

    if (isWin) {
      cmd = 'powershell.exe';
      args = ['-NoProfile', '-NonInteractive', '-Command', command];
    } else {
      // Split command into parts for non-Windows
      const parts = command.split(/\s+/);
      cmd = parts[0];
      args = parts.slice(1);
    }

    console.log(`[FluentTester] Executing: ${command} (cwd=${targetDir})`);

    const res = spawnSync(cmd, args, {
      cwd: targetDir,
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (res.error) {
      console.error('[FluentTester] spawnSync error:', res.error);
      throw res.error;
    }

    if (res.status !== 0) {
      const out = (res.stdout || '').toString();
      const err = (res.stderr || '').toString();
      console.error(`[FluentTester] Command failed (status=${res.status})\nSTDOUT:\n${out}\nSTDERR:\n${err}`);
      throw new Error(`Command '${command}' failed (status=${res.status}): ${err || out}`);
    }

    if (res.stdout) console.log(res.stdout.toString());
    if (res.stderr) console.error(res.stderr.toString());
    console.log(`[FluentTester] Command completed: ${command}`);
  }
}
