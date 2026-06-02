import { Injectable } from '@angular/core';

type ToastType = 'success' | 'info' | 'error' | 'warning';
type ToastOptions = { messageClass?: string };

const TYPE_CLASS: Record<ToastType, string> = {
  success: 'alert-success',
  info:    'alert-info',
  error:   'alert-error',
  warning: 'alert-warning',
};

@Injectable()
export class ToastrMessagesService {
  private show(type: ToastType, message = '', title = '', timeoutMs = 5000, messageClass?: string): void {
    const container = document.createElement('div');
    container.className = 'toast toast-end toast-bottom';
    container.style.cssText = 'z-index:10000;position:fixed;bottom:1rem;right:1rem;';

    const alert = document.createElement('div');
    alert.className = `alert ${TYPE_CLASS[type]}${messageClass ? ' ' + messageClass : ''}`;
    alert.style.cssText = 'max-width:320px;word-break:break-word;';
    alert.innerHTML = title ? `<strong>${title}</strong> ${message}` : message;

    container.appendChild(alert);
    document.body.appendChild(container);

    setTimeout(() => container.remove(), timeoutMs);
  }

  showSuccess(message?: string, title?: string, override?: ToastOptions) {
    this.show('success', message, title, 5000, override?.messageClass);
  }

  showInfo(message?: string, title?: string, override?: ToastOptions) {
    this.show('info', message, title, 5000, override?.messageClass);
  }

  showError(message?: string, title?: string, override?: ToastOptions) {
    this.show('error', message, title, 5000, override?.messageClass);
  }

  showWarning(message?: string, title?: string, override?: ToastOptions) {
    this.show('warning', message, title, 5000, override?.messageClass);
  }
}
