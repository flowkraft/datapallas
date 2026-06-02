import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import { APP_CONFIG } from '../../environments/environment';

export interface ExtConnection {
  fileName: string;
  filePath: string;
  connectionCode: string;
  connectionName: string;
  connectionType: 'email-connection' | 'database-connection';
  activeClicked: boolean;
  defaultConnection: boolean;
  useForJasperReports: boolean;
  usedBy: string;
  emailserver?: {
    host: string;
    port: string;
    userid: string;
    userpassword: string;
    usessl: boolean;
    usetls: boolean;
    fromaddress: string;
    name: string;
    oauth2provider?: string;
    oauth2clientid?: string;
    oauth2tenantid?: string;
    oauth2authorizeurl?: string;
    oauth2tokenurl?: string;
    oauth2scope?: string;
    oauth2refreshtoken?: string;
    oauth2useremail?: string;
  };
  dbserver?: {
    type: string; // mysql, postgresql, sqlserver, oracle
    host: string;
    port: string;
    database: string;
    userid: string;
    userpassword: string;
    usessl: boolean;
    defaultquery: string;
  };
}

export const newEmailServer = {
  host: 'Email Server Host',
  port: '25',
  userid: 'From Email User ID',
  userpassword: 'From Email Password',
  usessl: false,
  usetls: false,
  fromaddress: 'from@emailaddress.com',
  name: 'From Name',
};

export const newDatabaseServer = {
  type: 'oracle',
  host: 'Database Server Host',
  port: '1521', // SQL Server 1433, MySQL 3306, PostgreSQL 5432, Oracle 1521
  database: 'Database Name',
  userid: 'Database Username',
  userpassword: 'Database Password',
  usessl: false,
  defaultquery: 'SELECT 1 AS connection_test',
};

@Injectable({
  providedIn: 'root',
})
export class ConnectionsService {

  connectionFiles: Array<ExtConnection> = [];

  defaultEmailConnectionFile: ExtConnection;
  defaultDatabaseConnectionFile: ExtConnection;

  _emailConnectionsFiles: ExtConnection[] | null = null;
  _databaseConnectionsFiles: ExtConnection[] | null = null;

  CONFIGURATION_CONNECTIONS_FOLDER_PATH: string;

  connectionsLoading: number = 0;

  public apiService = inject(ApiService);

  constructor() {
    this.CONFIGURATION_CONNECTIONS_FOLDER_PATH = `${APP_CONFIG.folders.config}/connections`;
  }

  // ===== NEW ID-based methods =====

  async loadConnection(connectionId: string): Promise<{
    documentburster: {
      connection: any;
    };
  }> {
    let xmlConnectionSettings = {
      documentburster: { connection: {} },
    };

    xmlConnectionSettings.documentburster = await this.apiService.get(
      `/connections/${encodeURIComponent(connectionId)}`,
    );

    return xmlConnectionSettings;
  }

  async saveConnection(
    connectionId: string,
    xmlConnectionSettings: {
      documentburster: {};
    },
  ) {
    return this.apiService.put(
      `/connections/${encodeURIComponent(connectionId)}`,
      xmlConnectionSettings.documentburster,
    );
  }


  async loadAllConnections(
    configurationFiles: Array<{
      filePath: string;
      useEmlConn?: boolean;
      emlConnCode?: string;
      templateName: string;
      type: string;
    }> = [],
  ) {
    if (this.connectionsLoading == 1) return;

    this.connectionsLoading = 1;

    const emailConnFiles = await this.apiService.get(
      '/connections?type=email',
    );
    const dbConnFiles = await this.apiService.get(
      '/connections?type=database',
    );

    // Combine all connection files
    const connFiles = [...(emailConnFiles || []), ...(dbConnFiles || [])];

    if (connFiles && connFiles.length > 0) {
      this.connectionFiles = connFiles.map((connFile) => {
        const matchingConfigs = configurationFiles
          .filter(
            (conf) =>
              conf.useEmlConn &&
              conf.emlConnCode == connFile.connectionCode &&
              conf.type != 'config-samples',
          )
          .map((conf) => conf.templateName);

        return {
          ...connFile,
          usedBy: matchingConfigs.join(', ') || '--not used--',
        };
      });

      this.defaultEmailConnectionFile = this.getConnectionDetails({
        connectionType: 'email-connection',
        defaultConnection: true,
        connectionCode: '',
      });

      this.defaultDatabaseConnectionFile = this.getConnectionDetails({
        connectionType: 'database-connection',
        defaultConnection: true,
        connectionCode: '',
      });
    } else {
      this.connectionFiles = [];
      this.defaultEmailConnectionFile = null;
      this.defaultDatabaseConnectionFile = null;
    }

    // Invalidate derived caches so they recompute from fresh connectionFiles
    this._emailConnectionsFiles = null;
    this._databaseConnectionsFiles = null;

    this.connectionsLoading = 0;
    return this.connectionFiles;
  }

  getEmailConnectionFiles(): ExtConnection[] {
    if (!this._emailConnectionsFiles) {
      this._emailConnectionsFiles = this.connectionFiles.filter(
        (conn) => conn.connectionType === 'email-connection',
      );
    }
    return this._emailConnectionsFiles;
  }

  getDatabaseConnectionFiles(): ExtConnection[] {
    if (!this._databaseConnectionsFiles) {
      this._databaseConnectionsFiles = this.connectionFiles.filter(
        (conn) => conn.connectionType === 'database-connection',
      );
    }
    return this._databaseConnectionsFiles;
  }

  getConnectionDetails({
    connectionType,
    defaultConnection,
    connectionCode,
  }: {
    connectionType: string;
    defaultConnection: boolean;
    connectionCode: string;
  }) {
    let connFiles = [];

    if (this.connectionFiles.length > 0) {
      connFiles = this.connectionFiles.filter((connection: ExtConnection) => {
        return connection.connectionType == connectionType;
      });

      if (defaultConnection) {
        connFiles = connFiles.filter((connection: ExtConnection) => {
          return connection.defaultConnection;
        });
      }

      if (connectionCode && connectionCode.length > 0) {
        connFiles = connFiles.filter((connection: ExtConnection) => {
          return connection.connectionCode == connectionCode;
        });
      }

      if (connFiles && connFiles.length == 1) {
        return connFiles[0];
      }
    }
    return undefined;
  }

  async testConnection(connectionId: string, type: 'email' | 'email-inline' | 'database'): Promise<any> {
    if (type === 'database') {
      return this.apiService.post(`/connections/${connectionId}/test-database`, {});
    } else {
      return this.apiService.post(`/connections/${connectionId}/test-email`, {
        inline: type === 'email-inline' ? 'true' : undefined,
      });
    }
  }

  async deleteConnection(connectionId: string): Promise<void> {
    return this.apiService.delete(`/connections/${connectionId}`);
  }

  async getMetadata(connectionId: string, type: string): Promise<{ exists: string; content: string }> {
    return this.apiService.get(`/connections/${connectionId}/metadata/${type}`);
  }

  async saveMetadata(connectionId: string, type: string, content: string): Promise<void> {
    return this.apiService.put(`/connections/${connectionId}/metadata/${type}`, { content });
  }

  /**
   * Reveal (decrypt) a password from the backend.
   * @param connectionId The connection code (e.g., "eml-contact", "db-northwind-postgres"), or "settings" for report-level passwords
   * @param field 'userpassword' | 'authtoken' | 'accountsid' | 'proxypassword'
   * @param reportId Optional: report identifier for inline SMTP/Twilio/proxy passwords
   */
  async revealPassword(connectionId: string, field: string, reportId?: string): Promise<string> {
    const params: any = { field };
    if (reportId) params.reportId = reportId;
    const result = await this.apiService.post(`/connections/${connectionId}/reveal-password`, params);
    return result.password || '';
  }

  async runCustomSeed(connectionCode: string, script: string, params?: Record<string, any>): Promise<any> {
    return this.apiService.post(`/connections/${encodeURIComponent(connectionCode)}/run-seed`, { script, params });
  }

  async getSeedStatus(connectionCode: string): Promise<{ hasSeedData: boolean; tables: Array<{ name: string; count: number }> }> {
    return this.apiService.get(`/connections/${encodeURIComponent(connectionCode)}/seed-status`);
  }

  async getSeedTemplates(): Promise<Array<{ id: string; displayName: string; description: string; source: string }>> {
    return this.apiService.get('/connections/seed-templates');
  }

  async startEmailOAuth(
    connectionId: string,
    payload: {
      provider: string;
      tenantId?: string;
      clientId: string;
      authorizeUrl?: string;
      tokenUrl?: string;
      scope?: string;
    },
  ): Promise<{ flowId: string }> {
    return this.apiService.post(`/connections/${encodeURIComponent(connectionId)}/oauth-sign-in`, payload);
  }

  async cancelEmailOAuth(connectionId: string, flowId: string): Promise<void> {
    return this.apiService.post(
      `/connections/${encodeURIComponent(connectionId)}/oauth-flow/${flowId}/cancel`,
      {},
    );
  }

  refreshConnectionsUsedByInformation(
    filePath: string,
    xmlSettings: {
      documentburster: any;
    },
    configurationFiles: Array<{
      filePath: string;
      useEmlConn?: boolean;
      emlConnCode?: string;
      templateName: string;
    }>,
  ) {
    // Find and update the specific configuration file
    const configToUpdate = configurationFiles.find(
      (config) => config.filePath === filePath,
    );

    if (configToUpdate) {
      configToUpdate.useEmlConn =
        xmlSettings?.documentburster.settings.emailserver.useconn;
      configToUpdate.emlConnCode =
        xmlSettings?.documentburster.settings.emailserver.conncode;
    }

    // Recalculate "Used By" using the updated configuration
    this.connectionFiles = this.connectionFiles.map((connFile) => {
      const matchingConfigs = configurationFiles
        .filter(
          (conf) =>
            conf.useEmlConn && conf.emlConnCode == connFile.connectionCode,
        )
        .map((conf) => conf.templateName);

      return {
        ...connFile,
        usedBy: matchingConfigs.join(', ') || '--not used--',
      };
    });
  }
}
