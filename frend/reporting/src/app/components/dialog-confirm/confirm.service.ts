import { Injectable } from '@angular/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { ConfirmDialogComponent } from './confirm-dialog.component';

@Injectable()
export class ConfirmService {
  modalRef?: BsModalRef;
  constructor(protected modalService: BsModalService) {}

  askConfirmation(options: any, modalConfig?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      // Use the modalConfig parameter if provided, otherwise empty object
      this.modalRef = this.modalService.show(
        ConfirmDialogComponent,
        modalConfig || {},
      );
      this.modalRef.content.title = options.title
        ? options.title
        : 'Confirmation';
      this.modalRef.content.message = options.message;
      this.modalRef.content.confirmLabel = options.confirmLabel
        ? options.confirmLabel
        : 'Yes';
      this.modalRef.content.declineLabel = options.declineLabel
        ? options.declineLabel
        : 'No';

      this.modalRef.content.confirmAction = options.confirmAction;
      this.modalRef.content.confirmationText = options.confirmationText || null;

      this.modalRef.content.onClose.subscribe((result: boolean) => {
        resolve(result);
      });
    });
  }
}
