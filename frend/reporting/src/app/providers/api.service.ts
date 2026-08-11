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
   * Set the installation API key (read from the file system via Electron IPC).
   * Only ever called for a standalone deployment — see InitService for why a server never gets one.
   */
  setApiKey(key: string): void {
    this.apiKey = key || '';
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
    return this.apiKey ? this.apiKey : null;
  }

  /**
   * Called when the backend answers 401. Set by AuthService during bootstrap so this service can
   * signal "you are logged out" without importing AuthService and creating a DI cycle — AuthService
   * needs ApiService to perform the login call itself.
   */
  public onUnauthorized: (() => void) | null = null;

  /**
   * Called when the backend answers 403. Set by AuthService alongside {@link onUnauthorized}, and for
   * the same reason — this service cannot import a toast without dragging half the app into its
   * dependency graph.
   */
  public onForbidden: (() => void) | null = null;

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

    // Authentication.
    //
    // This is the ONE place it can go: this service talks to the backend with raw fetch(), not
    // Angular's HttpClient, so an HttpInterceptor would never see any of this traffic.
    //
    // Two mechanisms, not alternatives — both are set when available:
    //  - X-API-Key identifies a machine caller holding the installation. It is set only in a
    //    standalone deployment; a server deliberately has none, so that its login is the way in.
    //  - X-XSRF-TOKEN accompanies a browser session. Spring Security puts the token in the
    //    XSRF-TOKEN cookie and expects it echoed back in this header; without it every POST/PUT/DELETE
    //    from web mode is rejected.
    if (this.apiKey) {
      headers.set('X-API-Key', this.apiKey);
    }

    const xsrfToken = this.getXsrfToken();
    if (xsrfToken) {
      headers.set('X-XSRF-TOKEN', xsrfToken);
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
      this.checkError(response.status, method);
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

  /**
   * A 401 means the session is gone — expired, logged out in another tab, or the server restarted.
   * Tell AuthService so it can clear the identity and route to the login screen.
   *
   * In standalone mode that never fires: the backend authenticates the loopback caller itself, so
   * there is nothing to expire and the desktop never sees a login screen.
   *
   * A 403 means the rules worked. It is announced here, centrally, because the alternative is what
   * this codebase used to do: rethrow a bare status, let each screen's `catch` swallow it, and leave
   * the user watching a Save button do nothing at all. A refusal that looks identical to a broken
   * feature is worse than the refusal — nobody can tell which one they are looking at, and the honest
   * reading is "the app is broken". Saying it once, here, means every screen reports it whether or not
   * anyone remembered to handle it.
   *
   * The status still propagates afterwards, so a screen that wants to say something better (the Users
   * screen names the license limit, for instance) is free to.
   *
   * <p><b>Only writes announce a refusal.</b> A GET that comes back 403 is almost never something the
   * user asked for — it is a screen loading a list it should not have asked for in the first place, and
   * announcing it means someone signs in and is told, out of nowhere, that they lack permission for
   * something they never touched. That is worse than silence: it looks like the application is broken.
   * The right repair for a 403 on a GET is to stop making the call, which is why they are still
   * rethrown and logged for whoever is reading the console.
   *
   * <p>A POST, PUT, PATCH or DELETE is different — somebody pressed something. That is when a refusal
   * needs saying out loud, and that is the case this exists for.
   */
  private checkError(status: any, method?: RequestMethod): any {
    if (status === 401 && this.onUnauthorized) {
      this.onUnauthorized();
    }
    if (status === 403 && this.onForbidden && method && method !== RequestMethod.get) {
      this.onForbidden();
    }
    throw status;
  }
}
