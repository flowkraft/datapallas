import { Injectable, inject } from '@angular/core';
import Utilities from '../helpers/utilities';
import { HttpParams } from '@angular/common/http';
import { StateStoreService } from './state-store.service';
import { InitService } from './init.service';

export enum RequestMethod {
  get = 'GET',
  head = 'HEAD',
  post = 'POST',
  put = 'PUT',
  delete = 'DELETE',
  options = 'OPTIONS',
  patch = 'PATCH',
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  public BACKEND_URL = '/api';

  private headers: Headers;
  private jwtToken: string;
  private apiKey: string = '';

  protected stateStore = inject(StateStoreService);

  constructor() {
    this.headers = new Headers({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });

    this.jwtToken = '';

    // Authentication modes:
    // 1. Electron: Uses API key from file system (set via setApiKey())
    // 2. Web mode: Uses session + CSRF (Spring Security standard pattern)
    //    - Session cookie (JSESSIONID) sent automatically by browser
    //    - CSRF token (XSRF-TOKEN) read from cookie and sent as header

    //console.log(
    //  `apiService.constructor - stateStore.configSys.sysInfo.setup = ${JSON.stringify(stateStore.configSys.sysInfo.setup)}`,
    //);
  }

  /**
   * Set the API key (read from file system via Electron IPC).
   * This is called during app initialization for Electron mode only.
   */
  setApiKey(key: string): void {
    // TEMP: API key usage disabled for rollback
    // this.apiKey = key;
    this.apiKey = '';
  }

  /**
   * Read XSRF token from cookie (for web mode).
   * Spring Security sets XSRF-TOKEN cookie, Angular reads it and sends as X-XSRF-TOKEN header.
   * This is the standard Spring Security + Angular pattern.
   */
  private getXsrfToken(): string | null {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'XSRF-TOKEN') {
        return decodeURIComponent(value);
      }
    }
    return null;
  }

  private serialize(obj: any): HttpParams {
    let params = new HttpParams();

    for (const key in obj) {
      if (obj.hasOwnProperty(key) && !Utilities.looseInvalid(obj[key])) {
        params = params.set(key, obj[key]);
      }
    }

    return params;
  }

  private extractTokenFromHttpResponse(headers: Headers): string | null {
    const authorization = headers.get('Authorization');
    if (authorization && authorization.startsWith('Bearer ')) {
      return authorization.substring(7);
    }
    return null;
  }

  private setToken(token: string) {
    this.jwtToken = token;
  }

  public getToken(): string {
    return this.jwtToken;
  }

  /**
   * Get the API key for WebSocket authentication (Electron mode).
   * Returns the API key if set, otherwise null.
   */
  public getApiKey(): string | null {
    // TEMP: API key disabled during rollback
    return null;
  }

  private async request(
    path: string,
    method: RequestMethod,
    body: any = '',
    customHeaders?: Headers,
    responseType?: string,
  ): Promise<any> {
    //console.log(
    //  `this.stateStore.configSys.sysInfo.setup = ${JSON.stringify(this.stateStore.configSys.sysInfo.setup)}`,
    // );

    if (
      this.stateStore.configSys.info.FRONTEND == 'electron' &&
      this.BACKEND_URL == '/api'
    ) {
      //console.log(
      //  `apiService.constructor stateStore.configSys.sysInfo.setup.BACKEND_URL: ${JSON.stringify(this.stateStore.configSys.sysInfo.setup.BACKEND_URL)}`,
      //);

      this.BACKEND_URL = this.stateStore.configSys.sysInfo.setup.BACKEND_URL;
    }

    const url = `${this.BACKEND_URL}${path}`;

    const headers = new Headers(customHeaders || this.headers);
    
    // Authentication: Add appropriate header based on mode
    if (false) {
      // TEMP: API key header disabled during rollback
      // Electron/Grails/WordPress: Use API key from file system
      // headers.set('X-API-Key', this.apiKey);
    } else {
      // TEMP (2025-12-19): XSRF header injection disabled for rollback/testing.
      // Original XSRF header logic preserved below for easy re-enable.
      // Web mode: Use CSRF token (Spring Security standard pattern)
      // Spring sets XSRF-TOKEN cookie, we send it as X-XSRF-TOKEN header
      // const xsrfToken = this.getXsrfToken();
      // if (xsrfToken) {
      //   headers.set('X-XSRF-TOKEN', xsrfToken);
      // }
    }
    
    const options: RequestInit = {
      method,
      headers,
      credentials: 'include',  // Important: sends cookies (JSESSIONID, XSRF-TOKEN)
    };

    if (
      method === RequestMethod.post ||
      method === RequestMethod.put ||
      method === RequestMethod.patch
    ) {
      if (body instanceof FormData) {
        options.body = body;
        // Remove the Content-Type header so the browser can set it
        headers.delete('Content-Type');
      } else if (customHeaders?.get('Content-Type') === 'text/plain') {
        options.body = body;
      } else {
        options.body = JSON.stringify(body);
        headers.set('Content-Type', 'application/json');
      }
    }
    //console.log(`options.body = ${JSON.stringify(options.body)}`);

    if (!this.stateStore.configSys.sysInfo.setup.java.isJavaOk) return;

    // console.log('[DEBUG] api.service: calling fetch for', url);
    const response = await fetch(url, options);
    // console.log('[DEBUG] api.service: fetch returned, status=', response.status);

    if (!response.ok) {
      //this.stateStore.configSys.sysInfo.setup.java.isJavaOk = false;
      this.checkError(response.status);
      throw new Error(`Request failed with status ${response.status}`);
    }

    const jwtToken = this.extractTokenFromHttpResponse(response.headers);
    if (jwtToken) {
      this.setToken(jwtToken);
    }

    // Handle blob response type
    if (responseType === 'blob') {
      return response.blob();
    }
    // Add this new line to handle text response type
    else if (responseType === 'text') {
      return response.text();
    }

    let data = {};
    if (response.headers.get('Content-Length') === '0') {
      // console.log('[DEBUG] api.service: Content-Length is 0, returning empty object');
    } else {
      const contentType = response.headers.get('content-type');
      // console.log('[DEBUG] api.service: Content-Type=', contentType);
      if (contentType && contentType.includes('application/json')) {
        // console.log('[DEBUG] api.service: parsing JSON response...');
        data = await response.json();
        // console.log('[DEBUG] api.service: JSON parsed successfully');
      } else if (contentType && contentType.includes('text/plain')) {
        data = await response.text();
      }
    }
    // console.log('[DEBUG] api.service: returning data');
    return data;
  }

  public get(
    path: string,
    args?: any,
    customHeaders?: Headers,
    responseType?: string,
  ): Promise<any> {
    const params = args ? this.serialize(args).toString() : '';
    const fullPath = params ? `${path}?${params}` : path;

    return this.request(
      fullPath,
      RequestMethod.get,
      undefined,
      customHeaders,
      responseType,
    );
  }

  public post(path: string, body?: any, customHeaders?: Headers): Promise<any> {
    return this.request(path, RequestMethod.post, body, customHeaders);
  }

  public put(path: string, body: any, customHeaders?: Headers): Promise<any> {
    return this.request(path, RequestMethod.put, body, customHeaders);
  }

  public patch(path: string, body?: any, customHeaders?: Headers): Promise<any> {
    return this.request(path, RequestMethod.patch, body, customHeaders);
  }

  public delete(path: string, body?: any): Promise<any> {
    return this.request(path, RequestMethod.delete, body);
  }

  // Display error if logged in, otherwise redirect to IDP
  private checkError(error: any): any {
    // this.displayError(error);
    throw error;
  }
}
