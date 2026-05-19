import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ConfigurationRepository } from './configuration-repository.service';
import { ApiService } from './api.service';
import { ReportsService } from './reports.service';
import Utilities from '../helpers/utilities';
import { iconSvg } from '../shared/icon-svgs';

export interface SampleInfo {
  id: string;
  name: string;
  visibility: string;
  jobType: string;
  input: {
    data: string[];
    dataUrl?: string[];
    numberOfPages: number;
    tokens: string[];
  };
  step1: string;
  step2: string;
  step3: string;
  output: {
    data: string[];
    folder: string;
  };
  outputHtmlHardcoded: string;
  configurationFilePath: string;
  configurationFileName: string;
  notes: string;
  recipientType: string;
  documentType: string;
  activeClicked: boolean;
  capReportSplitting: boolean;
  capReportDistribution: boolean;
  capReportGenerationMailMerge: boolean;
  documentation?: string;
}

export interface HtmlDocTemplateInfo {
  id: string;
  name: string;
  tags: string[];
  sourceUrl: string;
  gitHubStars: string;
  license: string;
  infoAbout: string;
  templateFilePaths: string[];
  readmeFilePaths?: string[];
  aiPromptFilePaths?: string[];
  previewImagePaths?: string[];
}

export interface HtmlDocTemplateDisplay extends HtmlDocTemplateInfo {
  displayName?: string;
  isLoaded?: boolean;
  htmlContent?: string[];
  readmeContent?: string;
  selectedTemplateModifyPrompt?: string;
  selectedTemplateScratchPrompt?: string;
  category?: string;
  originalTemplate?: HtmlDocTemplateInfo;
  collectionIndex?: number;
  collectionTotal?: number;
  currentVariantIndex?: number;
  assetBaseDir?: string;
}

@Injectable({
  providedIn: 'root',
})
export class SamplesService {
  constructor(
    protected translateService: TranslateService,
    protected settingsService: ConfigurationRepository,
    protected reportsService: ReportsService,
    protected apiService: ApiService,
  ) { }

  countVisibleSamples = -1;

  samples: Array<SampleInfo> = [
    {
      id: 'MONTHLY-PAYSLIPS-SPLIT-ONLY',
      name: '1. Monthly Payslips (pdf2pdf)',
      visibility: 'visible',
      jobType: 'burst',
      input: {
        data: ['file:samples/burst/Payslips.pdf'],
        dataUrl: ['file:https://datapallas.com/docs/Payslips.pdf'],
        numberOfPages: 3,
        tokens: [
          'clyde.grew@northridgehealth.org',
          'kyle.butford@northridgehealth.org',
          'alfreda.waldback@northridgehealth.org',
        ],
      },
      step1: 'split',
      step2: '',
      step3: '',
      output: {
        data: [
          'file:clyde.grew@northridgehealth.org.pdf',
          'file:kyle.butford@northridgehealth.org.pdf',
          'file:alfreda.waldback@northridgehealth.org.pdf',
        ],
        folder:
          "output/Payslips.pdf/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      //configurationFilePath: `${this.settingsService.PORTABLE_EXECUTABLE_DIR}/config/samples/split-only/settings.xml`,
      configurationFilePath: `config/samples/split-only/settings.xml`,
      configurationFileName: 'split-only',
      notes: ``,
      recipientType: 'employee',
      documentType: 'payslip',
      capReportSplitting: true,
      capReportDistribution: false,
      capReportGenerationMailMerge: false,
      activeClicked: false,
      documentation:
        'https://www.pdfburst.com/docs/html/userguide/chapter.pdf.html#chapter.pdf.bursting',
    },
    {
      id: 'EXCEL-DISTINCT-SHEETS-SPLIT-ONLY',
      name: '2. Monthly Payslips Excel - split by distinct sheets (xlsx2xlsx)',
      visibility: 'visible',
      jobType: 'burst',
      step1: 'split',
      step2: '',
      step3: '',
      input: {
        data: ['file:samples/burst/Payslips-Distinct-Sheets.xls'],
        dataUrl: [
          'file:https://datapallas.com/docs/Payslips-Distinct-Sheets.xls',
        ],
        numberOfPages: -1,
        tokens: [
          'clyde.grew@northridgehealth.org',
          'kyle.butford@northridgehealth.orgf',
          'alfreda.waldback@northridgehealth.org',
        ],
      },
      output: {
        data: [
          'file:clyde.grew@northridgehealth.org.xls',
          'file:kyle.butford@northridgehealth.org.xls',
          'file:alfreda.waldback@northridgehealth.org.xls',
        ],
        folder:
          "output/${input_document_name}/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded:
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg> clyde.grew@northridgehealth.org.xls employee payslip<br><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg> kyle.butford@northridgehealth.org.xls employee payslip<br><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg> alfreda.waldback@northridgehealth.org.xls employee payslip',
      //configurationFilePath: `${this.settingsService.PORTABLE_EXECUTABLE_DIR}/config/samples/split-only/settings.xml`,
      configurationFilePath: `config/samples/split-only/settings.xml`,
      configurationFileName: 'split-only',
      notes: ``,
      recipientType: 'employee',
      documentType: 'payslip',
      capReportSplitting: true,
      capReportDistribution: false,
      capReportGenerationMailMerge: false,
      activeClicked: false,
      documentation:
        'https://www.pdfburst.com/docs/html/userguide/chapter.excel.html#chapter.excel.bursting.by.distinct.sheets',
    },
    {
      id: 'EXCEL-DISTINCT-COLUMN-VALUES-SPLIT-ONLY',
      name: '3. Customer List/Country Excel - split by distinct column values (xlsx2xlsx)',
      visibility: 'visible',
      jobType: 'burst',
      step1: 'split',
      step2: '',
      step3: '',
      input: {
        data: ['file:samples/burst/Customers-Distinct-Column-Values.xls'],
        dataUrl: [
          'file:https://datapallas.com/docs/Customers-Distinct-Column-Values.xls',
        ],
        numberOfPages: -1,
        tokens: [],
      },
      output: {
        data: [],
        folder:
          "output/${input_document_name}/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded:
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg> United States of America.xls<br><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg> Australia.xls<br><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg> Canada.xls<br><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg> United Kingdom.xls<br><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg> Germany.xls<br>etc... (separate file containing customer list for each country)',
      //configurationFilePath: `${this.settingsService.PORTABLE_EXECUTABLE_DIR}/config/samples/split-only/settings.xml`,
      configurationFilePath: `config/samples/split-only/settings.xml`,
      configurationFileName: 'split-only',
      notes: ``,
      recipientType: 'customer',
      documentType: 'invoices',
      capReportSplitting: true,
      capReportDistribution: false,
      capReportGenerationMailMerge: false,
      activeClicked: false,
      documentation:
        'https://www.pdfburst.com/docs/html/userguide/chapter.excel.html#chapter.excel.bursting.by.distinct.column.values',
    },
    {
      id: 'INVOICES-SPLIT-ONCE-MORE-SPLIT-ONLY',
      name: '4. Customers with Multiple Invoices PDF (pdf2pdf)',
      visibility: 'visible',
      jobType: 'burst',
      step1: 'split',
      step2: '',
      step3: '',
      input: {
        data: ['file:samples/burst/Split2Times.pdf'],
        dataUrl: ['file:https://datapallas.com/docs/Split2Times.pdf'],
        numberOfPages: -1,
        tokens: [],
      },
      output: {
        data: [
          'file:10.pdf (for accounting@alphainsurance.biz)',
          'file:9.pdf (for accounting@alphainsurance.biz)',
          'file:8.pdf (for accounting@alphainsurance.biz)',
          'file:7.pdf (for accounting@alphainsurance.biz)',
          'file:6.pdf (for accounting@betainsurance.biz)',
          'file:5.pdf (for accounting@betainsurance.biz)',
          'file:4.pdf (for accounting@betainsurance.biz)',
          'file:3.pdf (for accounting@gammahealth.biz)',
          'file:2.pdf (for accounting@gammahealth.biz)',
        ],
        folder:
          "output/Payslips.pdf/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      //configurationFilePath: `${this.settingsService.PORTABLE_EXECUTABLE_DIR}/config/samples/split-two-times/settings.xml`,
      configurationFilePath: `config/samples/split-two-times/settings.xml`,
      configurationFileName: 'split-two-times',
      notes: ``,
      recipientType: 'customer',
      documentType: 'invoice',
      capReportSplitting: true,
      capReportDistribution: false,
      capReportGenerationMailMerge: false,
      activeClicked: false,
      documentation:
        'http://www.pdfburst.com/docs/html/userguide/chapter.pdf.html#chapter.config.advanced',
    },
    {
      id: 'INVOICES-MERGE-THEN-SPLIT',
      name: '5. Customer Invoices PDF - Merge and then Process Multiple Files Together (pdf2pdf)',
      visibility: 'visible',
      jobType: 'merge-burst',
      input: {
        data: [
          'file:samples/burst/Invoices-Oct.pdf',
          'file:samples/burst/Invoices-Nov.pdf',
          'file:samples/burst/Invoices-Dec.pdf',
        ],
        dataUrl: [
          'file:https://datapallas.com/docs/Invoices-Oct.pdf',
          'file:https://datapallas.com/docs/Invoices-Nov.pdf',
          'file:https://datapallas.com/docs/Invoices-Dec.pdf',
        ],
        numberOfPages: -1,
        tokens: [],
      },
      step1: 'merge',
      step2: 'split',
      step3: '',
      output: {
        data: [
          'file:0011.pdf',
          'file:0012.pdf',
          'file:0013.pdf',
          'file:0014.pdf',
          'file:0015.pdf',
          'file:0016.pdf',
          'file:0017.pdf',
          'file:0018.pdf',
          'file:0019.pdf',
        ],
        folder:
          "output/${input_document_name}/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      //configurationFilePath: `${this.settingsService.PORTABLE_EXECUTABLE_DIR}/config/samples/split-only/settings.xml`,
      configurationFilePath: `config/samples/split-only/settings.xml`,
      configurationFileName: 'split-only',
      notes: ``,
      recipientType: 'customer',
      documentType: 'invoice',
      capReportSplitting: true,
      capReportDistribution: false,
      capReportGenerationMailMerge: false,
      activeClicked: false,
    },
    {
      id: 'GENERATE-PAYSLIPS-DOCX',
      name: '6. Generate Monthly Payslips (csv2docx)',
      visibility: 'visible',
      jobType: 'generate',
      input: {
        data: ['file:samples/reports/payslips/Payslips.csv'],
        dataUrl: ['file:https://datapallas.com/docs/Payslips.csv'],
        numberOfPages: -1,
        tokens: [
          'clyde.grew@northridgehealth.org',
          'kyle.butford@northridgehealth.org',
          'alfreda.waldback@northridgehealth.org',
        ],
      },
      step1: 'generate',
      step2: '',
      step3: '',
      output: {
        data: [
          'file:clyde.grew@northridgehealth.org.docx',
          'file:kyle.butford@northridgehealth.org.docx',
          'file:alfreda.waldback@northridgehealth.org.docx',
        ],
        folder:
          "output/${input_document_name}/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      configurationFilePath: `config/samples/g-csv2docx/settings.xml`,
      configurationFileName: 'g-csv2docx',
      notes: ``,
      recipientType: 'employee',
      documentType: 'payslip',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
    {
      id: 'GENERATE-PAYSLIPS-HTML',
      name: '7. Generate Monthly Payslips (csv2html)',
      visibility: 'visible',
      jobType: 'generate',
      input: {
        data: ['file:samples/reports/payslips/Payslips.csv'],
        dataUrl: ['file:https://datapallas.com/docs/Payslips.csv'],
        numberOfPages: -1,
        tokens: [
          'clyde.grew@northridgehealth.org',
          'kyle.butford@northridgehealth.org',
          'alfreda.waldback@northridgehealth.org',
        ],
      },
      step1: 'generate',
      step2: '',
      step3: '',
      output: {
        data: [
          'file:clyde.grew@northridgehealth.org.html',
          'file:kyle.butford@northridgehealth.org.html',
          'file:alfreda.waldback@northridgehealth.org.html',
        ],
        folder:
          "output/${input_document_name}/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      configurationFilePath: `config/samples/g-csv2htm/settings.xml`,
      configurationFileName: 'g-csv2htm',
      notes: ``,
      recipientType: 'employee',
      documentType: 'payslip',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
    {
      id: 'GENERATE-PAYSLIPS-PDF',
      name: '8. Generate Monthly Payslips (csv2pdf)',
      visibility: 'visible',
      jobType: 'generate',
      input: {
        data: ['file:samples/reports/payslips/Payslips.csv'],
        dataUrl: ['file:https://datapallas.com/docs/Payslips.csv'],
        numberOfPages: -1,
        tokens: [
          'clyde.grew@northridgehealth.org',
          'kyle.butford@northridgehealth.org',
          'alfreda.waldback@northridgehealth.org',
        ],
      },
      step1: 'generate',
      step2: '',
      step3: '',
      output: {
        data: [
          'file:clyde.grew@northridgehealth.org.pdf',
          'file:kyle.butford@northridgehealth.org.pdf',
          'file:alfreda.waldback@northridgehealth.org.pdf',
        ],
        folder:
          "output/${input_document_name}/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      configurationFilePath: `config/samples/g-csv2pdf/settings.xml`,
      configurationFileName: 'g-csv2pdf',
      notes: ``,
      recipientType: 'employee',
      documentType: 'payslip',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
    {
      id: 'GENERATE-PAYSLIPS-EXCEL',
      name: '9. Generate Monthly Payslips (csv2xlsx)',
      visibility: 'visible',
      jobType: 'generate',
      input: {
        data: ['file:samples/reports/payslips/Payslips.csv'],
        dataUrl: ['file:https://datapallas.com/docs/Payslips.csv'],
        numberOfPages: -1,
        tokens: [
          'clyde.grew@northridgehealth.org',
          'kyle.butford@northridgehealth.org',
          'alfreda.waldback@northridgehealth.org',
        ],
      },
      step1: 'generate',
      step2: '',
      step3: '',
      output: {
        data: [
          'file:clyde.grew@northridgehealth.org.xlsx',
          'file:kyle.butford@northridgehealth.org.xlsx',
          'file:alfreda.waldback@northridgehealth.org.xlsx',
        ],
        folder:
          "output/${input_document_name}/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      configurationFilePath: `config/samples/g-csv2xls/settings.xml`,
      configurationFileName: 'g-csv2xls',
      notes: ``,
      recipientType: 'employee',
      documentType: 'payslip',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
    {
      id: 'GENERATE-PAYSLIPS-EXCEL-XLSX-DS',
      name: '10. Generate Monthly Payslips (xlsx2xlsx)',
      visibility: 'visible',
      jobType: 'generate',
      input: {
        data: ['file:samples/reports/payslips/Payslips.xlsx'],
        dataUrl: ['file:https://datapallas.com/docs/Payslips.xlsx'],
        numberOfPages: -1,
        tokens: [
          'clyde.grew@northridgehealth.org',
          'kyle.butford@northridgehealth.org',
          'alfreda.waldback@northridgehealth.org',
        ],
      },
      step1: 'generate',
      step2: '',
      step3: '',
      output: {
        data: [
          'file:clyde.grew@northridgehealth.org.xlsx',
          'file:kyle.butford@northridgehealth.org.xlsx',
          'file:alfreda.waldback@northridgehealth.org.xlsx',
        ],
        folder:
          "output/${input_document_name}/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      configurationFilePath: `config/samples/g-xls2xls/settings.xml`,
      configurationFileName: 'g-xls2xls',
      notes: ``,
      recipientType: 'employee',
      documentType: 'payslip',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
    {
      id: 'GENERATE-STUDENT-PROFILES-SQL2PDF',
      name: '11. Generate Student Profiles (sql2pdf)',
      visibility: 'visible',
      jobType: 'generate',
      input: {
        data: ['file:db/sample-northwind-sqlite/northwind.db'],
        dataUrl: [],
        numberOfPages: -1,
        tokens: [],
      },
      step1: 'generate',
      step2: '',
      step3: '',
      output: {
        data: ['file:Andrew-Fuller.pdf', 'file:Janet-Leverling.pdf', 'file:Nancy-Davolio.pdf'],
        folder: "output/StudentProfiles/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      configurationFilePath: `config/samples/g-sql2fop-stud/settings.xml`,
      configurationFileName: 'g-sql2fop-stud',
      notes: ``,
      recipientType: 'student',
      documentType: 'report',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
    {
      id: 'GENERATE-CUSTOMER-STATEMENTS-SQL2HTML',
      name: '12. Generate Customer Statements (sql2html)',
      visibility: 'visible',
      jobType: 'generate',
      input: {
        data: ['file:db/sample-northwind-sqlite/northwind.db'],
        dataUrl: [],
        numberOfPages: -1,
        tokens: [],
      },
      step1: 'generate',
      step2: '',
      step3: '',
      output: {
        // the UI will expect burst tokens; for this sample we show the single customer output
        data: [
          'file:ALFKI.html',
          'file:ANATR.html',
          'file:ANTON.html',
          'file:AROUT.html',
          'file:BERGS.html',
          'file:BLAUS.html',
          'file:BONAP.html',
          'file:CACTU.html',
          'file:DRACD.html',
          'file:DUMON.html',
          'file:ERNSH.html',
          'file:FOLKO.html',
          'file:FRANK.html',
          'file:GREAL.html',
          'file:HILAA.html',
          'file:ISLAT.html',
          'file:KOENE.html',
          'file:LEHMS.html',
          'file:LILAS.html',
          'file:MAGAA.html',
          'file:MORGK.html',
          'file:OTTIK.html',
          'file:QUICK.html',
          'file:TOMSP.html',
          'file:WANDK.html'
        ],
        folder: "output/CustomerStatements/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      configurationFilePath: `config/samples/g-sql2htm-cst-stmt/settings.xml`,
      configurationFileName: 'g-sql2htm-cst-stmt',
      notes: ``,
      recipientType: 'customer',
      documentType: 'statement',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
    {
      id: 'GENERATE-CUSTOMER-SALES-SUMMARY-SQL2XLSX',
      name: '13. Customer Sales Summary (sql2xlsx - one output file)',
      visibility: 'visible',
      jobType: 'generate',
      input: {
        data: ['file:db/sample-northwind-sqlite/northwind.db'],
        dataUrl: [],
        numberOfPages: -1,
        tokens: [],
      },
      step1: 'generate',
      step2: '',
      step3: '',
      output: {
        data: ['file:CustomerSalesSummary.xlsx'],
        folder: "output/CustomerSales/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      configurationFilePath: `config/samples/g-sql2xls-cst-sles/settings.xml`,
      configurationFileName: 'g-sql2xls-cst-sles',
      notes: ``,
      recipientType: '',
      documentType: 'report',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
    {
      id: 'GENERATE-CUSTOMER-INVOICES-MASTER-DETAILS-SCRIPT2HTML',
      name: '14. Generate Customer Invoices (script2html - master-details)',
      visibility: 'visible',
      jobType: 'generate',
      input: {
        data: ['file:db/sample-northwind-sqlite/northwind.db'],
        dataUrl: [],
        numberOfPages: -1,
        tokens: [],
      },
      step1: 'generate',
      step2: '',
      step3: '',
      output: {
        // UI shows representative output files (order-based filenames)
        data: [
          'file:invoice_1.html',
          'file:invoice_2.html',
          'file:invoice_4.html',
          'file:invoice_5.html',
          'file:invoice_8.html',
          'file:invoice_9.html',
          'file:invoice_33.html',
          'file:invoice_34.html',
          'file:invoice_58.html',
          'file:invoice_59.html',
        ],
        folder: "output/CustomerInvoices/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      configurationFilePath: `config/samples/g-scr2htm-cst-invo/settings.xml`,
      configurationFileName: 'g-scr2htm-cst-invo',
      notes: ``,
      recipientType: 'customer',
      documentType: 'invoice',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
    // Insert after the GENERATE-STUDENT-PROFILES-SQL2PDF sample
    {
      id: 'GENERATE-CATEGORY-REGION-CROSSTAB-SCRIPT2HTML',
      name: '15. Category-Region Crosstab (script2html - one output file)',
      visibility: 'visible',
      jobType: 'generate',
      input: {
        data: ['file:db/sample-northwind-sqlite/northwind.db'],
        dataUrl: [],
        numberOfPages: -1,
        tokens: [],
      },
      step1: 'generate',
      step2: '',
      step3: '',
      output: {
        // single representative output file
        data: ['file:CategoryRegionCrosstab.html'],
        folder: "output/CategoryRegionCrosstab/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      configurationFilePath: `config/samples/g-scr2htm-cross/settings.xml`,
      configurationFileName: 'g-scr2htm-cross',
      notes: ``,
      recipientType: '',
      documentType: 'report',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
    {
      id: 'GENERATE-MONTHLY-SALES-TREND-SCRIPT2HTML',
      name: '16. Monthly Sales Trend (script2html - one output file)',
      visibility: 'visible',
      jobType: 'generate',
      input: {
        data: ['file:db/sample-northwind-sqlite/northwind.db'],
        dataUrl: [],
        numberOfPages: -1,
        tokens: [],
      },
      step1: 'generate',
      step2: '',
      step3: '',
      output: {
        // single representative output file
        data: ['file:MonthlySalesTrend.html'],
        folder: "output/MonthlySalesTrend/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      configurationFilePath: `config/samples/g-scr2htm-trend/settings.xml`,
      configurationFileName: 'g-scr2htm-trend',
      notes: ``,
      recipientType: '',
      documentType: 'report',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
    {
      id: 'GENERATE-SUPPLIER-SCORECARDS-SCRIPT2HTML',
      name: '17. Supplier Scorecards (script2html)',
      visibility: 'visible',
      jobType: 'generate',
      input: {
        data: ['file:db/sample-northwind-sqlite/northwind.db'],
        dataUrl: [],
        numberOfPages: -1,
        tokens: [],
      },
      step1: 'generate',
      step2: '',
      step3: '',
      output: {
        // representative per-supplier output filenames
        data: [
          'file:supplier_1_scorecard.html',
          'file:supplier_2_scorecard.html',
          'file:supplier_3_scorecard.html',
          'file:supplier_4_scorecard.html',
          'file:supplier_5_scorecard.html',
          'file:supplier_6_scorecard.html',
        ],
        folder: "output/SupplierScorecards/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      configurationFilePath: `config/samples/g-scr2htm-supc/settings.xml`,
      configurationFileName: 'g-scr2htm-supc',
      notes: ``,
      recipientType: 'supplier',
      documentType: 'scorecard',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
    {
      id: 'NORTHWIND-SALES-DASHBOARD',
      name: '18. Sales Dashboard (interactive)',
      visibility: 'visible',
      jobType: 'dashboard',
      input: {
        data: ['file:db/sample-northwind-sqlite/northwind.db'],
        dataUrl: [],
        numberOfPages: -1,
        tokens: [],
      },
      step1: 'dashboard',
      step2: '',
      step3: '',
      output: {
        data: [],
        folder: '',
      },
      outputHtmlHardcoded: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/></svg> Interactive dashboard (no output files)',
      configurationFilePath: `config/samples/g-dashboard/settings.xml`,
      configurationFileName: 'g-dashboard',
      notes: ``,
      recipientType: '',
      documentType: 'dashboard',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
    {
      id: 'NORTHWIND-SALES-PIVOTTABLE',
      name: '19. Sales PivotTable (data warehouse)',
      visibility: 'visible',
      jobType: 'dashboard',
      input: {
        data: ['file:db/sample-northwind-duckdb/northwind.duckdb'],
        dataUrl: [],
        numberOfPages: -1,
        tokens: [],
      },
      step1: 'dashboard',
      step2: '',
      step3: '',
      output: {
        data: [],
        folder: '',
      },
      outputHtmlHardcoded: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/></svg> Interactive pivot table (no output files)',
      configurationFilePath: `config/samples/g-pivottable/settings.xml`,
      configurationFileName: 'g-pivottable',
      notes: ``,
      recipientType: '',
      documentType: 'dashboard',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
    {
      id: 'GENERATE-ADHOC-EMPLOYEE-PROFILE-SCRIPT2PDF',
      name: '20. Ad-hoc Employee Profile (script2pdf - report parameters, no database)',
      visibility: 'visible',
      jobType: 'generate',
      input: {
        data: ['Adhoc (user provided data)'],
        dataUrl: [],
        numberOfPages: -1,
        tokens: [],
      },
      step1: 'generate',
      step2: '',
      step3: '',
      output: {
        data: ['file:E001-John-Doe.pdf'],
        folder: "output/AdhocEmployeeProfile/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      configurationFilePath: `config/samples/g-scr2pdf-adhoc/settings.xml`,
      configurationFileName: 'g-scr2pdf-adhoc',
      notes: ``,
      recipientType: '',
      documentType: 'report',
      capReportSplitting: false,
      capReportDistribution: false,
      capReportGenerationMailMerge: true,
      activeClicked: false,
    },
  ];

  samplesNotYetImplemented: Array<SampleInfo> = [
    {
      id: 'MAIL-MERGE-EMAIL-LETTERS-TO-STUDENTS',
      name: '7. Mail Merge Email Letters to All Students',
      visibility: 'hidden',
      jobType: 'burst',
      input: {
        data: ['file:samples/All-Payslips.csv'],
        numberOfPages: -1,
        tokens: [
          'clyde.grew@northridgehealth.org',
          'kyle.butford@northridgehealth.org.pdf',
          'alfreda.waldback@northridgehealth.org',
        ],
      },
      step1: 'mail-merge-emails',
      step2: 'email',
      step3: '',
      output: {
        data: [
          'email:clyde.grew@northridgeschool.edu',
          'email:kyle.butford@northridgeschool.edu',
          'email:alfreda.waldback@northridgeschool.edu',
        ],
        folder:
          "output/${input_document_name}/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded:
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg> letter to student clyde.grew@northridgeschool.edu<br><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg> letter to student kyle.butford@northridgeschool.edu<br><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg> letter to student alfreda.waldback@northridgeschool.edu',
      //configurationFilePath: `${this.settingsService.PORTABLE_EXECUTABLE_DIR}/config/samples/mail-merge-emails/settings.xml`,
      configurationFilePath: `config/samples/mail-merge-emails/settings.xml`,
      configurationFileName: 'split-only',
      notes: ``,
      recipientType: 'student',
      documentType: 'letter',
      capReportSplitting: true,
      capReportDistribution: false,
      capReportGenerationMailMerge: false,
      activeClicked: false,
    },
    {
      id: 'NEWSLETTER1',
      name: '8. Newsletter 1',
      visibility: 'hidden',
      jobType: 'burst',
      input: {
        data: ['file:samples/All-Payslips.csv'],
        numberOfPages: -1,
        tokens: [
          'clyde.grew@northridgehealth.org',
          'kyle.butford@northridgehealth.org.pdf',
          'alfreda.waldback@northridgehealth.org',
        ],
      },
      step1: 'mail-merge-documents',
      step2: 'email',
      step3: '',
      output: {
        data: [
          'email-file-attached:clyde.grew@northridgeschool.edu.docx',
          'email-file-attached:kyle.butford@northridgeschool.edu.docx',
          'email-file-attached:alfreda.waldback@northridgeschool.edu.docx',
        ],
        folder:
          "output/${input_document_name}/${timestamp?format['yyyy.MM.dd_HH.mm.ss.SSS']}",
      },
      outputHtmlHardcoded: '',
      //configurationFilePath: `${this.settingsService.PORTABLE_EXECUTABLE_DIR}/config/samples/newsletter-1/settings.xml`,
      configurationFilePath: `config/samples/newsletter-1/settings.xml`,
      configurationFileName: 'split-only',
      notes: ``,
      recipientType: 'student',
      documentType: 'letter',
      capReportSplitting: true,
      capReportDistribution: false,
      capReportGenerationMailMerge: false,
      activeClicked: false,
    },
  ];

  getInputHtml(id: string, fullDetails?: boolean) {
    const sample = this.samples.find((sample) => sample.id == id);
    const inputs: string[] = sample.input.data;
    const inputsUrl: string[] = sample.input.dataUrl;

    let inputLabel = inputs[0].replace('file:', '');
    let inputUrl: string;

    if (inputsUrl && inputsUrl.length) {
      inputUrl = inputsUrl[0].replace('file:', '');
    }

    let inputFileIconSvg = iconSvg('file-pdf-o');
    if (inputLabel.endsWith('.xls')) {
      inputFileIconSvg = iconSvg('file-excel-o');
    } else if (inputLabel.endsWith('.csv')) {
      inputFileIconSvg = iconSvg('file-text-o');
    } else if (inputLabel.endsWith('.db') || inputLabel.endsWith('.duckdb')) {
      inputFileIconSvg = iconSvg('database');
    }

    let inputHtml = `${inputFileIconSvg}&nbsp;${inputLabel}`;
    if (fullDetails)
      inputHtml = `${inputFileIconSvg}&nbsp;${inputLabel}`;

    if (inputUrl) {
      inputHtml = `${inputFileIconSvg}&nbsp;<a href="${inputUrl}" target="_blank">${inputLabel}</a>`;
      if (fullDetails)
        inputHtml = `${inputFileIconSvg}&nbsp;<a href="${inputUrl}" target="_blank">${inputLabel}</a>`;
    }

    for (let index = 1; index < inputs.length; index++) {
      inputLabel = inputs[index].replace('file:', '');
      let currentHtml = `${inputFileIconSvg}&nbsp;${inputLabel}`;
      if (fullDetails)
        currentHtml = `${inputFileIconSvg}&nbsp;${inputLabel}`;

      if (inputUrl) {
        inputUrl = inputsUrl[index].replace('file:', '');
        // Fixed: Added missing quote in target="_blank" attribute
        currentHtml = `${inputFileIconSvg}&nbsp;<a href="${inputUrl}" target="_blank">${inputLabel}</a>`;
        if (fullDetails)
          currentHtml = `${inputFileIconSvg}&nbsp;<a href="${inputUrl}" target="_blank">${inputLabel}</a>`;
      }

      inputHtml = `${inputHtml}<br>${currentHtml}`;
    }

    return inputHtml;
  }

  getOutputType(sampleId: string): string {
    const sample = this.samples.find((sample) => sample.id == sampleId);
    return sample.output.data[0].split('.').pop().toLowerCase();
  }

  getOutputHtml(sampleId: string, fullDetails?: boolean): string {
    const sample = this.samples.find((sample) => sample.id == sampleId);

    //console.log(`sample = ${JSON.stringify(sample)}`);

    if (sample.outputHtmlHardcoded) return sample.outputHtmlHardcoded;

    const outputs: string[] = sample.output.data;
    let outputLabel = outputs[0].replace('file:', '');

    const SVG_FILE = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"/></svg>';
    const SVG_ENVELOPE = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"/></svg>';
    const SVG_AT = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" style="display:inline-block;width:1rem;height:1rem;"><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zm0 0c0 1.657 1.007 3 2.25 3S21 13.657 21 12a9 9 0 10-2.636 6.364M16.5 12V8.25"/></svg>';

    let outputHtml = '';
    if (fullDetails) {
      const inputs: string[] = sample.input.data;
      if (inputs.length == 1) {
        const inputFileName = Utilities.basename(inputs[0]);

        //outputHtml = `<strong>Folder</strong><br>${this.settingsService.PORTABLE_EXECUTABLE_DIR}/output/${inputFileName}/\${now?format["yyyy.MM.dd_HH.mm.ss.SSS"]}<br>${outputHtml}`;
        outputHtml = `<strong>Folder</strong><br>output/${inputFileName}/\${now?format["yyyy.MM.dd_HH.mm.ss.SSS"]}<br>${outputHtml}`;
      }
    } else {
      if (sample.capReportDistribution)
        outputHtml = `${SVG_ENVELOPE} ${sample.recipientType} with ${SVG_AT} ${sample.documentType} ${SVG_FILE} ${outputLabel}`;
      else
        outputHtml = `${SVG_FILE} ${outputLabel} ${sample.recipientType} ${sample.documentType}`;
    }

    //console.log(`outputHtml = ${outputHtml}`);

    if (!fullDetails) {
      for (let index = 1; index < outputs.length; index++) {
        outputLabel = outputs[index].replace('file:', '');
        let currentHtml = `${SVG_ENVELOPE} ${sample.recipientType} with ${SVG_AT} ${sample.documentType} ${SVG_FILE} ${outputLabel}`;
        if (!sample.capReportDistribution)
          currentHtml = `${SVG_FILE} ${outputLabel} ${sample.recipientType} ${sample.documentType}`;

        outputHtml = `${outputHtml}<br>${currentHtml}`;
      }
    } else {
      outputHtml = `${outputHtml}<strong>Files</strong>`;

      for (let index = 0; index < outputs.length; index++) {
        outputLabel = outputs[index].replace('file:', '');
        //console.log(`outputLabel = ${outputLabel}`);

        let currentHtml = `${SVG_ENVELOPE} ${sample.recipientType} with ${SVG_AT} ${sample.documentType} ${SVG_FILE} ${outputLabel}`;
        if (!sample.capReportDistribution)
          currentHtml = `${SVG_FILE} ${outputLabel} ${sample.recipientType} ${sample.documentType}`;

        outputHtml = `${outputHtml}<br>${currentHtml}`;
      }

      if (sample.capReportDistribution) {
        outputHtml = `${outputHtml}<br><strong>Emails</strong>`;

        for (let index = 0; index < outputs.length; index++) {
          outputLabel = outputs[index].replace('file:', '');
          let currentHtml = `${SVG_ENVELOPE} ${sample.recipientType} with ${SVG_AT} ${sample.documentType} ${SVG_FILE} ${outputLabel}`;
          outputHtml = `${outputHtml}<br>${currentHtml}`;
        }
      }
    }

    return outputHtml;
  }

  async fillSamplesNotes() {
    //if not yet loaded
    if (this.samples[0].notes.length == 0) {
      const sampleConfigurations =
        this.settingsService.getSampleConfigurations();

      if (sampleConfigurations && sampleConfigurations.length) {
        for (let sample of this.samples) {
          //console.log(JSON.stringify(sampleConfigurations));
          const sampleConfigurationValues = sampleConfigurations.find(
            (configuration) => {
              return sample.configurationFilePath.endsWith(
                configuration.filePath,
              );
            },
          );

          if (sampleConfigurationValues) {
            sample.capReportDistribution =
              sampleConfigurationValues.capReportDistribution;
            sample.capReportGenerationMailMerge =
              sampleConfigurationValues.capReportGenerationMailMerge;
          }

          const notes = await this.translateService.instant(
            `SAMPLES.${sample.id}.NOTES.INNER-HTML`,
          );
          sample.notes = notes;
        }

        this.countVisibleSamples = this.samples.filter(
          (sample) => sample.visibility == 'visible',
        ).length;
      }
    }
  }

  async toggleSampleVisibility(sample: SampleInfo, visibility: string) {
    const reportId = Utilities.basename(Utilities.dirname(sample.configurationFilePath));
    const settingsXmlConfigurationValues =
      await this.reportsService.loadReportSettings(reportId);

    settingsXmlConfigurationValues.documentburster.settings.visibility =
      visibility;

    await this.reportsService.saveReportSettings(
      reportId,
      settingsXmlConfigurationValues,
    );

    sample.visibility = visibility;

    const sampleConfiguration = this.settingsService
      .getSampleConfigurations()
      .find((configuration) =>
        sample.configurationFilePath.endsWith(configuration.filePath),
      );
    this.countVisibleSamples = this.samples.filter(
      (sample) => sample.visibility == 'visible',
    ).length;
  }

  async hideAllSamples() {
    for (let sample of this.samples) {
      this.toggleSampleVisibility(sample, 'hidden');
    }
  }

  //HTML DOC TEMPLATES START
  htmlDocTemplatesSamples: Array<HtmlDocTemplateInfo> = [
    {
      id: 'HTML-INVOICE-TEMPLATES-BASIC-PDF',
      name: 'Simple table layout payslip template demonstrating colors and variables (PDF output)',
      tags: ['payslip', 'table-layout', 'colors', 'variables'],
      sourceUrl: '',
      license: '',
      gitHubStars: '',
      infoAbout:
        'Simple table layout payslip template demonstrating colors and variables (PDF output)',
      templateFilePaths: ['templates/gallery/_basic/payslips-template.html'],
    },
    {
      id: 'HTML-INVOICE-TEMPLATES-BASIC-EXCEL',
      name: 'Simple table layout payslip template demonstrating colors and variables (Excel output)',
      tags: ['excel', 'payslip', 'table-layout', 'colors', 'variables'],
      sourceUrl: '',
      license: '',
      gitHubStars: '',
      infoAbout:
        'Simple table layout payslip template demonstrating colors and variables (Excel output)',
      templateFilePaths: [
        'templates/gallery/_basic/payslips-template-excel.html',
      ],
    },
    {
      id: 'HTML-INVOICE-TEMPLATES-BS3GRID-GOOGLE-FONTS',
      name: '3x clean, modern, responsive html invoice templates based on Bootstrap 3`s grid system and support for Google Fonts',
      tags: ['invoice', 'grid-layout', 'google-fonts', 'responsive'],
      sourceUrl: 'https://github.com/nirajrajgor/html-invoice-templates',
      license: 'MIT',
      gitHubStars: '26',
      infoAbout:
        '3x clean, modern, responsive html invoice templates based on Bootstrap 3`s grid system and support for Google Fonts',
      templateFilePaths: [
        'templates/gallery/nirajrajgor-html-invoice-templates/invoice1.html',
        'templates/gallery/nirajrajgor-html-invoice-templates/invoice2.html',
        'templates/gallery/nirajrajgor-html-invoice-templates/invoice3.html',
      ],
    },
    {
      id: 'SPARKSUITE-HTML-INVOICE-TEMPLATE',
      name: 'A modern, clean, and very simple responsive HTML invoice template, because sometimes you just need something quick and simple',
      tags: [
        'invoice',
        'minimalist',
        'table-layout',
        'system-fonts',
        'responsive',
        'rtl-support',
      ],
      sourceUrl: 'https://github.com/sparksuite/simple-html-invoice-template',
      license: 'MIT',
      gitHubStars: '1.7k',
      infoAbout:
        'A modern, clean, and very simple responsive HTML invoice template',
      templateFilePaths: [
        'templates/gallery/sparksuite-simple-html-invoice-template/invoice.html',
      ],
    },
    {
      id: 'ANVIL-HTML-INVOICE-TEMPLATE',
      name: 'An HTML invoice template with support for generating PDFs',
      tags: [
        'invoice',
        'minimalist',
        'table-layout',
        'pdf-optimized',
        'paginated',
      ],
      sourceUrl: 'https://github.com/anvilco/html-pdf-invoice-template',
      license: 'MIT',
      gitHubStars: '81',
      infoAbout: 'An HTML invoice template with support for generating PDFs',
      templateFilePaths: [
        'templates/gallery/anvilco-html-pdf-invoice-template/invoice.html',
      ],
    },
    {
      id: 'COMPLEX-HTML-INVOICE-TEMPLATE',
      name: "Complex invoice template with a grid layout similar with Bootstrap 3's grid system and support for generating PDFs",
      tags: ['invoice', 'complex', 'grid-layout', 'pdf'],
      sourceUrl: 'https://github.com/barbosa89/invoice-template',
      license: 'MIT',
      gitHubStars: '24',
      infoAbout:
        "Complex invoice template with a grid layout similar with Bootstrap 3's grid system and support for generating PDFs",
      templateFilePaths: [
        'templates/gallery/barbosa89-invoice-template/invoice.html',
      ],
    },
    /*{
      id: 'HTML-MAILCHIMP-EMAIL-MODULAR-TEMPLATE-PATTERNS',
      name: 'Modular blocks of common design patterns',
      tags: ['mailchimp-email-blueprints', 'modular-blocks-patterns'],
      sourceUrl: 'https://github.com/mailchimp/email-blueprints',
      license: 'Creative Commons Attribution-ShareAlike 3.0 Unported',
      gitHubStars: '7000',
      infoAbout:
        'Contains a single template built out of modular blocks of common design patterns.',
      templateFilePaths: [
        'templates/mailchimp-email-blueprints/modular-template-patterns/modular-template-patterns.html',
      ],
    },*/
    {
      id: 'HTML-MAILCHIMP-EMAIL-2COLUMN-QUERY-RESPONSIVE',
      name: 'Responsive Two-Column Email Template',
      tags: ['mailchimp-email-blueprints', 'responsive', 'two-column'],
      sourceUrl: 'https://github.com/mailchimp/email-blueprints',
      license: 'Creative Commons Attribution-ShareAlike 3.0 Unported',
      gitHubStars: '7000',
      infoAbout:
        'A classic, fully responsive two-column email template from Mailchimp, featuring modular content blocks, repeatable sections, and mobile-friendly styles. Ideal for newsletters, announcements, and marketing campaigns.',
      templateFilePaths: [
        'templates/mailchimp-email-blueprints/responsive-templates/base_boxed_2column_query.html',
      ],
    },
    {
      id: 'HTML-MAILCHIMP-EMAIL-2COLUMN-LEFTSIDEBAR',
      name: 'Fixed-Width Two-Column Email with Left Sidebar',
      tags: [
        'mailchimp-email-blueprints',
        'fixed-width',
        'two-column',
        'left-sidebar',
      ],
      sourceUrl: 'https://github.com/mailchimp/email-blueprints',
      license: 'Creative Commons Attribution-ShareAlike 3.0 Unported',
      gitHubStars: '7000',
      infoAbout:
        'A fixed-width, two-column email template from Mailchimp featuring a prominent left sidebar for navigation or social links, modular repeatable content blocks, and a clean, professional layout. Ideal for newsletters, announcements, and marketing campaigns.',
      templateFilePaths: [
        'templates/mailchimp-email-blueprints/templates/2col-1-2-leftsidebar.html',
      ],
    },
  ];

  async getHtmlDocTemplates(): Promise<HtmlDocTemplateInfo[]> {
    // Return a copy of the templates array to avoid accidental mutations
    return [...this.htmlDocTemplatesSamples];
  }
  //HTML DOC TEMPLATES END
}
