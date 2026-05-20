import { ChangeDetectorRef, Component, OnInit, OnDestroy, viewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import _ from 'lodash';

import { tabsTemplate } from './templates/connections/_tabs';
import { tabExternalConnectionsTemplate } from './templates/connections/tab-configuration-connection';

import { tabLicenseTemplate } from './templates/connections/tab-license';
import { ConfirmService } from '../../components/dialog-confirm/confirm.service';
import { ToastrMessagesService } from '../../providers/toastr-messages.service';

import { ActivatedRoute, Router } from '@angular/router';
import { ExecutionStatsService } from '../../providers/execution-stats.service';
import { InfoService } from '../../components/dialog-info/info.service';
import {
  ExtConnection,
  newDatabaseServer,
  newEmailServer,
  ConfigurationRepository,
} from '../../providers/configuration-repository.service';
import { FsService } from '../../providers/fs.service';
import { ConnectionsService } from '../../providers/connections.service';
import { ConnectionDetailsComponent } from '../../components/connection-details/connection-details.component';

@Component({
    selector: 'dburst-connection-list',
    template: `
    <div>${tabsTemplate}</div>
    ${tabExternalConnectionsTemplate}
    <dburst-connection-details
      #connectionDetailsModal
    ></dburst-connection-details>
    ${tabLicenseTemplate}
  `,
    standalone: false
})
export class ConnectionListComponent implements OnInit, OnDestroy {
  connectionDetailsModalInstance = viewChild.required<ConnectionDetailsComponent>('connectionDetailsModal');

  goBackLocation = '';
  configurationFilePath = '';
  configurationFileName = '';

  private showSamplesSub?: Subscription;

  constructor(
    protected confirmService: ConfirmService,
    protected messagesService: ToastrMessagesService,
    protected fsService: FsService,
    protected settingsService: ConfigurationRepository,
    protected connectionsService: ConnectionsService,
    protected infoService: InfoService,
    protected executionStatsService: ExecutionStatsService,
    protected route: ActivatedRoute,
    protected router: Router,
  ) { }

  async ngOnInit() {
    this.settingsService.numberOfUserVariables = 20;
    this.settingsService.currentConfigurationTemplateName = '';
    this.settingsService.currentConfigurationTemplatePath = '';

    this.settingsService.configurationFiles =
      await this.settingsService.loadAllReports();

    await this.settingsService.loadAllConnections();

    // Check which DB connection is set for JasperReports via datasource.properties
    await this.loadJasperReportsConnectionFlag();

    if (!this.settingsService.defaultEmailConnectionFile) {
      if (
        this.settingsService.connectionFiles &&
        this.settingsService.connectionFiles.length > 0
      ) {
        this.messagesService.showWarning(
          'Choose a single email connection to be the `Default` email cnnection',
        );
      } else {
        this.messagesService.showInfo(
          'Multiple email connections can be configured and one should be selected to be the `Default` email connection`',
        );
      }
    }

    this.route.queryParams.subscribe(async (queryParams) => {
      if (queryParams.goBackLocation) {
        this.goBackLocation = queryParams.goBackLocation;
        this.configurationFilePath = queryParams.configurationFilePath;
        this.configurationFileName = queryParams.configurationFileName;
      }
    });

    // Reload list when the user toggles the "Show samples" preference.
    let firstEmission = true;
    this.showSamplesSub = this.settingsService.showSamples$.subscribe(async () => {
      if (firstEmission) {
        firstEmission = false;
        return;
      }
      await this.settingsService.loadAllConnections();
    });
  }

  ngOnDestroy() {
    this.showSamplesSub?.unsubscribe();
  }

  //generate inline a function at this location

  onItemClick(item: { connectionCode: string }) {
    for (const connectionFile of this.settingsService.connectionFiles) {
      connectionFile.activeClicked =
        connectionFile.connectionCode === item.connectionCode;
    }
  }

  getSelectedConnection() {
    if (!this.settingsService.connectionFiles) {
      return undefined;
    }

    return this.settingsService.connectionFiles.find(
      (connection) => connection.activeClicked,
    );
  }

  onDeleteSelectedConnection() {
    const selectedConnection = this.getSelectedConnection(); // Get the full connection object
    if (!selectedConnection) {
      this.messagesService.showWarning('No connection selected to delete.');
      return;
    }

    // Customize confirmation message
    let dialogQuestion = `Are you sure you want to delete the ${selectedConnection.connectionType || 'item'} '${selectedConnection.connectionName}'?`;
    if (selectedConnection.connectionType === 'database-connection') {
      dialogQuestion +=
        '\nThis will also delete its associated schema, ER diagram, and ubiquitous language files.';
    }

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        const originalFilePath = selectedConnection.filePath; // Path to the .xml file, used for removing from list

        try {
          // Use the connections API — backend handles both directory (db) and file (email) deletion
          await this.connectionsService.deleteConnection(selectedConnection.connectionCode);

          // Remove the connection from the frontend list using its original unique filePath
          _.remove(
            this.settingsService.connectionFiles,
            (o) => o.filePath === originalFilePath,
          );

          // If the deleted connection was marked default, clear the app-level default pointer(s)
          if (selectedConnection.defaultConnection) {
            // clear database default if it pointed to this file
            if ((this.settingsService as any).defaultDatabaseConnectionFile &&
              (this.settingsService as any).defaultDatabaseConnectionFile.filePath === originalFilePath) {
              (this.settingsService as any).defaultDatabaseConnectionFile = null;
            }
            // clear email default if it pointed to this file
            if (this.settingsService.defaultEmailConnectionFile &&
              this.settingsService.defaultEmailConnectionFile.filePath === originalFilePath) {
              this.settingsService.defaultEmailConnectionFile = null;
            }
          }

          // Ensure the in-memory array reference is updated so bindings re-evaluate
          this.settingsService.connectionFiles = [...(this.settingsService.connectionFiles || [])];

          // If there are no connections left, ensure no default remains
          if (!this.settingsService.connectionFiles || this.settingsService.connectionFiles.length === 0) {
            (this.settingsService as any).defaultDatabaseConnectionFile = null;
            this.settingsService.defaultEmailConnectionFile = null;
          }

          this.messagesService.showInfo(
            `Connection '${selectedConnection.connectionName}' deleted successfully.`,
          );
          // Potentially clear any displayed details of the deleted connection if necessary
          // this.clearDisplayedConnectionDetails();
        } catch (error) {
          console.error(
            `Error deleting connection '${selectedConnection.connectionName}':`,
            error,
          );
          this.messagesService.showError(
            `Failed to delete connection: ${(error as any).message || 'Unknown error'}`,
          );
        }
      },
    });
  }

  async doTestSMTPConnection() {
    // Delegate to the modal component, passing the selected connection
    const selectedConnection = this.getSelectedConnection();
    if (!selectedConnection) {
      this.messagesService.showWarning('No connection selected.');
      return;
    }
    // Show the modal in update mode for the selected connection
    await this.connectionDetailsModalInstance().showCrudModal(
      'update',
      'email-connection',
      false,
      selectedConnection
    );
    // Call the test method on the modal instance
    await this.connectionDetailsModalInstance().doTestSMTPConnection();
  }

  async doTestDatabaseConnection() {
    // Delegate to the modal component, passing the selected connection
    const selectedConnection = this.getSelectedConnection();
    if (!selectedConnection) {
      this.messagesService.showWarning('No connection selected.');
      return;
    }
    // Show the modal in update mode for the selected connection
    await this.connectionDetailsModalInstance().showCrudModal(
      'update',
      'database-connection',
      false,
      selectedConnection
    );
    // Call the test method on the modal instance
    await this.connectionDetailsModalInstance().doTestDatabaseConnection();
  }

  async showCrudModal(
    crudMode: string,
    connectionType: string = 'email-connection',
    duplicate?: boolean,
  ) {
    //console.log('ConfigurationConnectionsComponet: showCrudModal()');
    this.connectionDetailsModalInstance().showCrudModal(
      crudMode,
      connectionType,
      duplicate,
      this.getSelectedConnection(),
    );
  }

  goBack() {
    this.router.navigate(
      [
        '/configuration',
        'emailSettingsMenuSelected',
        this.configurationFilePath,
        this.configurationFileName,
        true,
      ],
      { skipLocationChange: true },
    );
  }

  async toggleDefault() {
    const selectedConnection = this.getSelectedConnection();

    if (!selectedConnection) {
      this.messagesService.showWarning('No connection selected.');
      return;
    }

    const dialogQuestion = `Make '${selectedConnection.connectionName}' connection the 'Default' ${selectedConnection.connectionType}?`;

    this.confirmService.askConfirmation({
      message: dialogQuestion,
      confirmAction: async () => {
        const previousDefaultConnection =
          this.settingsService.connectionFiles.find(
            (connection) =>
              connection.defaultConnection &&
              connection.connectionType === selectedConnection.connectionType, // Use strict equality
          );

        // tempConnectionInfo serves as a template for the data structure to be saved.
        // We will populate either the 'email' or 'database' part of it.
        const tempConnectionInfo = {
          email: {
            documentburster: {
              connection: {
                code: '',
                name: '',
                defaultConnection: false,
                emailserver: { ...newEmailServer },
              },
            },
          },
          database: {
            documentburster: {
              connection: {
                code: '',
                name: '',
                defaultConnection: false,
                databaseserver: { ...newDatabaseServer },
              },
            },
          },
        };

        let payloadForPreviousToSave: any;
        let payloadForSelectedToSave: any;

        // --- Handle PREVIOUS default connection ---
        if (previousDefaultConnection) {
          previousDefaultConnection.defaultConnection = false; // Update local object state

          if (previousDefaultConnection.connectionType === 'email-connection') {
            const connToUpdate =
              tempConnectionInfo.email.documentburster.connection;
            connToUpdate.defaultConnection = false;
            connToUpdate.code = previousDefaultConnection.connectionCode;
            connToUpdate.name = previousDefaultConnection.connectionName;
            connToUpdate.emailserver = {
              ...(previousDefaultConnection.emailserver || newEmailServer),
            };
            payloadForPreviousToSave = tempConnectionInfo.email;
          } else if (
            previousDefaultConnection.connectionType === 'database-connection'
          ) {
            const connToUpdate =
              tempConnectionInfo.database.documentburster.connection;
            connToUpdate.defaultConnection = false;
            connToUpdate.code = previousDefaultConnection.connectionCode;
            connToUpdate.name = previousDefaultConnection.connectionName;
            connToUpdate.databaseserver = {
              ...(previousDefaultConnection.dbserver || newDatabaseServer),
            };
            payloadForPreviousToSave = tempConnectionInfo.database;
          } else {
            this.messagesService.showError(
              `Invalid connection type for previous default: ${previousDefaultConnection.connectionType}`,
            );
            return; // Abort
          }

          try {
            await this.connectionsService.saveConnection(
              previousDefaultConnection.connectionCode,
              payloadForPreviousToSave,
            );
          } catch (error) {
            this.messagesService.showError(
              `Failed to update previous default '${previousDefaultConnection.connectionName}': ${(error as any).message || 'Unknown error'}`,
            );
            previousDefaultConnection.defaultConnection = true; // Revert local change on error
            return; // Abort
          }
        }

        // --- Handle NEW (selected) default connection ---
        selectedConnection.defaultConnection = true; // Update local object state

        if (selectedConnection.connectionType === 'email-connection') {
          const connToUpdate =
            tempConnectionInfo.email.documentburster.connection;
          connToUpdate.defaultConnection = true;
          connToUpdate.code = selectedConnection.connectionCode;
          connToUpdate.name = selectedConnection.connectionName;
          connToUpdate.emailserver = {
            ...(selectedConnection.emailserver || newEmailServer),
          };
          payloadForSelectedToSave = tempConnectionInfo.email;
          this.settingsService.defaultEmailConnectionFile = selectedConnection;
        } else if (
          selectedConnection.connectionType === 'database-connection'
        ) {
          const connToUpdate =
            tempConnectionInfo.database.documentburster.connection;
          connToUpdate.defaultConnection = true;
          connToUpdate.code = selectedConnection.connectionCode;
          connToUpdate.name = selectedConnection.connectionName;
          connToUpdate.databaseserver = {
            ...(selectedConnection.dbserver || newDatabaseServer),
          };
          payloadForSelectedToSave = tempConnectionInfo.database;
          // Ensure ConfigurationRepository has defaultDatabaseConnectionFile property and logic
          (this.settingsService as any).defaultDatabaseConnectionFile =
            selectedConnection;
        } else {
          this.messagesService.showError(
            `Invalid connection type for selected: ${selectedConnection.connectionType}`,
          );
          selectedConnection.defaultConnection = false; // Revert local change
          if (previousDefaultConnection) {
            previousDefaultConnection.defaultConnection = true; // Revert previous if it was changed
          }
          return; // Abort
        }

        try {
          await this.connectionsService.saveConnection(
            selectedConnection.connectionCode,
            payloadForSelectedToSave,
          );
          this.messagesService.showInfo(
            `Connection '${selectedConnection.connectionName}' is now the Default ${selectedConnection.connectionType}.`,
          );
        } catch (error) {
          this.messagesService.showError(
            `Failed to set '${selectedConnection.connectionName}' as default: ${(error as any).message || 'Unknown error'}`,
          );
          // Revert local changes on error
          selectedConnection.defaultConnection = false;
          if (selectedConnection.connectionType === 'email-connection') {
            this.settingsService.defaultEmailConnectionFile =
              previousDefaultConnection || null;
          } else {
            (this.settingsService as any).defaultDatabaseConnectionFile =
              previousDefaultConnection || null;
          }
          if (previousDefaultConnection) {
            previousDefaultConnection.defaultConnection = true;
          }
        }
        // UI should update based on changes to this.settingsService.connectionFiles items
        // If not, a ChangeDetectorRef.detectChanges() or similar might be needed,
        // or re-assigning the array: this.settingsService.connectionFiles = [...this.settingsService.connectionFiles];
      },
    });
  }

  copyConnectionCode(code: string) {
    navigator.clipboard.writeText(code).then(() => {
      this.messagesService.showInfo('Connection code copied to clipboard!', 'Copied');
    });
  }

  async loadJasperReportsConnectionFlag() {
    try {
      const dsPropsPath = 'config/reports-jasper/datasource.properties';
      const exists = await this.fsService.existsAsync(dsPropsPath);
      if (exists) {
        const content = await this.fsService.readAsync(dsPropsPath);
        const match = content?.match(/connectionCode\s*=\s*(.+)/);
        if (match) {
          const jasperConnCode = match[1].trim();
          for (const conn of this.settingsService.connectionFiles) {
            conn.useForJasperReports = conn.connectionCode === jasperConnCode;
          }
        }
      }
    } catch (e) {
      // datasource.properties doesn't exist yet — that's fine
    }
  }

  async toggleUseForJasperReports() {
    const selectedConnection = this.getSelectedConnection();
    if (!selectedConnection || selectedConnection.connectionType !== 'database-connection') {
      return;
    }

    const dsPropsPath = 'config/reports-jasper/datasource.properties';
    const isCurrentlySet = selectedConnection.useForJasperReports;

    if (isCurrentlySet) {
      this.confirmService.askConfirmation({
        message: `Remove '${selectedConnection.connectionName}' as the JasperReports database connection?`,
        confirmAction: async () => {
          try {
            await this.fsService.removeAsync(dsPropsPath);
            for (const conn of this.settingsService.connectionFiles) {
              conn.useForJasperReports = false;
            }
            this.messagesService.showInfo(
              `Connection '${selectedConnection.connectionName}' is no longer used for JasperReports.`,
            );
          } catch (error) {
            this.messagesService.showError(`Failed to remove JasperReports connection: ${(error as any).message || 'Unknown error'}`);
          }
        },
      });
    } else {
      const previousJasperConn = this.settingsService.connectionFiles.find(
        (c) => c.useForJasperReports,
      );
      const replaceMsg = previousJasperConn
        ? `Replace '${previousJasperConn.connectionName}' with '${selectedConnection.connectionName}' as the database connection for JasperReports?`
        : `Use '${selectedConnection.connectionName}' as the database connection for JasperReports?`;

      this.confirmService.askConfirmation({
        message: replaceMsg,
        confirmAction: async () => {
          try {
            // Always remove existing file first, then create new one
            const exists = await this.fsService.existsAsync(dsPropsPath);
            if (exists) {
              await this.fsService.removeAsync(dsPropsPath);
            }
            await this.fsService.writeAsync(
              dsPropsPath,
              `connectionCode=${selectedConnection.connectionCode}\n`,
            );
            for (const conn of this.settingsService.connectionFiles) {
              conn.useForJasperReports = conn.filePath === selectedConnection.filePath;
            }
            this.messagesService.showInfo(
              `Connection '${selectedConnection.connectionName}' is now used for JasperReports.`,
            );
          } catch (error) {
            this.messagesService.showError(`Failed to set JasperReports connection: ${(error as any).message || 'Unknown error'}`);
          }
        },
      });
    }
  }
}
