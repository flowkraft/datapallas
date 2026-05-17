import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { ConfigurationRepository } from '../../providers/configuration-repository.service';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';
import { AskForFeatureDialogComponent } from './ask-for-feature-dialog.component';
@Injectable()
export class AskForFeatureService {
  alreadyImplementedFeatures = [
    'ds.sqlquery',
    'ds.scriptfile',
    'ds.dashboard',
    'ds.xmlfile',
    'ds.csvfile',
    'ds.tsvfile',
    'ds.fixedwidthfile',
    'ds.excelfile',
    'output.none',
    'output.docx',
    'output.pdf',
    'output.xlsx',
    'output.html',
    'output.dashboard',
    'output.fop2pdf',
    'output.any',
    'output.jasper',
  ];

  messageTemplate = {
    to: 'support@datapallas.com',
    subject: "New Feature Request - '{{nameYourFeatureHere}}'",
    message: `Hello,
    
My name is {{YourNameHere}} and I work for {{YourCompanyNameHere}} where I am {{YourTitleHere}}.
    
We would be interested to get the new feature '{{nameYourFeatureHere}}' implemented faster in DocumentBurster.

Functional Requirements 

{{describeYourFunctionalRequirementsAsClearyAsPossibleHere}}

Non-Functional and Performance Related Requirements 

{{describeYourExpectedVolumeHere}}

{{describeYourOtherNonFunctionalRequirementsHere}}
    
Timeline

Ideally, we would need this new feature to be delivered no later than 

{{YourTimelineHere}}

Please let us know if it would be possible to get this feature implemented in DocumentBurster.

Sincerely,
{{YourNameHere}}
{{YourTitleHere}},{{YourCompanyNameHere}}
`,
  };

  modalRef?: BsModalRef;
  constructor(
    protected modalService: BsModalService,
    protected translateService: TranslateService,
    protected messagesService: ToastrMessagesService,
    protected settingsService: ConfigurationRepository,
  ) {}

  showAskForFeature(options: any): Promise<any> {
    const titleLabel = this.translateService.instant(
      'COMPONENTS.ASK-FOR-FEATURE-DIALOG.TITLE',
    );

    const confirmLabel = this.translateService.instant(
      'COMPONENTS.ASK-FOR-FEATURE-DIALOG.CONFIRM',
    );

    return new Promise((resolve, reject) => {
      this.modalRef = this.modalService.show(AskForFeatureDialogComponent, {
        class: 'modal-lg',
      });

      this.modalRef.content.msgTo = this.messageTemplate.to;

      let requestedFeatureFriendly = '';

      const requestedFeature = options.requestedFeature;
      switch (requestedFeature) {
        case 'ds.tsvfile':
          requestedFeatureFriendly = 'TSV File (DataSource)';
          break;
        case 'ds.fixedwidthfile':
          requestedFeatureFriendly = 'Fixed-Width File (DataSource)';
          break;
        case 'ds.excelfile':
          requestedFeatureFriendly = 'Excel File (DataSource)';
          break;
        case 'ds.gsheet':
          requestedFeatureFriendly =
            'Google Sheets (cloud/saas service) (DataSource)';
          break;
        case 'ds.o365sheet':
          requestedFeatureFriendly =
            'Microsoft Office365 Excel (cloud/saas service) (DataSource)';
          break;
        case 'ds.sqlquery':
          requestedFeatureFriendly = 'SQL query (DataSource)';
          break;
        case 'ds.dashboard':
          requestedFeatureFriendly = 'Dashboard Scripts (DataSource)';
          break;
        case 'output.pdf':
          requestedFeatureFriendly = 'PDF Files (Output Type)';
          break;
        case 'output.xlsx':
          requestedFeatureFriendly = 'Excel (xlsx) Files (Output Type)';
          break;
        case 'output.html':
          requestedFeatureFriendly = 'HTML Files (Output Type)';
          break;
        case 'output.dashboard':
          requestedFeatureFriendly = 'Dashboard (Output Type)';
          break;
        default:
          requestedFeatureFriendly = '';
      }

      if (requestedFeatureFriendly) {
        this.modalRef.content.msgSubject = this.messageTemplate.subject.replace(
          '{{nameYourFeatureHere}}',
          requestedFeatureFriendly,
        );
        this.modalRef.content.msgMessage = this.messageTemplate.message.replace(
          '{{nameYourFeatureHere}}',
          requestedFeatureFriendly,
        );
      } else {
        this.modalRef.content.msgSubject = this.messageTemplate.subject;
        this.modalRef.content.msgMessage = this.messageTemplate.message;
      }

      this.modalRef.content.title = options.title ? options.title : titleLabel;
      this.modalRef.content.confirmLabel = options.confirmLabel
        ? options.confirmLabel
        : confirmLabel;

      this.modalRef.content.onClose.subscribe((result: boolean) => {
        resolve(result);
      });
    });
  }
}
