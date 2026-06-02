import { Component, inject, OnInit, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FileExplorerService } from './file-explorer.service';

@Component({
    selector: 'dburst-file-explorer',
    templateUrl: './file-explorer.component.html',
    // Enhanced styles to enforce column widths and prevent overflow
    styles: [
        `
      .selected-file {
        background-color: #d9edf7 !important; /* Light blue background */
        font-weight: bold;
      }

      /* Table layout control - adjusted column widths */
      .file-explorer-table {
        table-layout: fixed !important;
        width: 100% !important;
        border-collapse: collapse !important;
        /* Prevent table from causing horizontal scroll on its own */
        overflow-x: hidden;
      }

      /* Column width classes with forced inheritance using !important */
      .file-explorer-table col.col-filename {
        /* Allow filename to take up remaining space */
        width: auto !important;
        min-width: 150px !important; /* Ensure minimum width */
      }
      .file-explorer-table col.col-permission {
        width: 15% !important;
        max-width: 100px !important; /* Add max-width */
      }
      .file-explorer-table col.col-size {
        width: 10% !important;
        max-width: 80px !important; /* Add max-width */
      }
      .file-explorer-table col.col-date {
        width: 20% !important;
        max-width: 120px !important; /* Add max-width */
      }
      .file-explorer-table col.col-actions {
        width: 10% !important;
        max-width: 90px !important; /* Add max-width */
      }

      /* Apply the same widths to table cells */
      .file-explorer-table td.col-filename {
        width: auto !important;
        min-width: 150px !important;
      }
      .file-explorer-table td.col-permission {
        width: 15% !important;
        max-width: 100px !important;
      }
      .file-explorer-table td.col-size {
        width: 10% !important;
        max-width: 80px !important;
      }
      .file-explorer-table td.col-date {
        width: 20% !important;
        max-width: 120px !important;
      }
      .file-explorer-table td.col-actions {
        width: 10% !important;
        max-width: 90px !important;
      }

      /* Apply the same widths to table headers */
      .file-explorer-table th.col-filename {
        width: auto !important;
        min-width: 150px !important;
      }
      .file-explorer-table th.col-permission {
        width: 15% !important;
        max-width: 100px !important;
      }
      .file-explorer-table th.col-size {
        width: 10% !important;
        max-width: 80px !important;
      }
      .file-explorer-table th.col-date {
        width: 20% !important;
        max-width: 120px !important;
      }
      .file-explorer-table th.col-actions {
        width: 10% !important;
        max-width: 90px !important;
      }

      /* Text overflow control */
      .file-explorer-table td,
      .file-explorer-table th {
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        /* Add padding for better spacing */
        padding: 8px 5px !important;
      }

      /* Make breadcrumb wrap properly to avoid affecting table layout */
      .breadcrumb {
        word-wrap: break-word !important;
        white-space: normal !important;
        max-width: 100% !important;
      }

      /* Compact breadcrumb styles */
      .compact-breadcrumb {
        padding: 4px 8px !important;
        margin-bottom: 10px !important;
        font-size: 12px !important;
        overflow: hidden !important;
        white-space: nowrap !important;
        text-overflow: ellipsis !important;
      }

      /* Compact table styles */
      .compact-table {
        table-layout: fixed !important; /* Ensures independence from breadcrumb */
        width: 100% !important;
      }

      /* Define strict column widths - Adjusted */
      .compact-table .col-name {
        width: 35% !important; /* Reduced width further */
      }

      .compact-table .col-permission {
        width: 10% !important;
        max-width: 80px !important;
      }

      .compact-table .col-size {
        width: 15% !important; /* Adjusted width */
        max-width: 80px !important; /* Adjusted max-width */
      }

      .compact-table .col-date {
        width: 25% !important; /* Adjusted width */
        max-width: 140px !important; /* Adjusted max-width */
      }

      .compact-table .col-actions {
        width: 15% !important;
        max-width: 90px !important;
      }

      /* Enforce text overflow handling */
      .compact-table th,
      .compact-table td {
        white-space: nowrap !important;
        overflow: hidden !important; /* Ensures content doesn't affect layout */
        text-overflow: ellipsis !important; /* Shows ellipsis for overflow */
        padding: 4px !important;
        font-size: 12px !important;
      }

      /* Ensure filename appears properly */
      .col-filename span.glyphicon {
        margin-right: 5px !important;
      }

      .table {
        table-layout: fixed;
        width: 100%;
        margin-bottom: 0;
      }

      .col-filename {
        width: 40%;
        max-width: 0; /* Forces truncation */
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .col-permission {
        width: 15%;
        max-width: 80px;
      }

      .col-size {
        width: 15%;
        max-width: 60px;
      }

      .col-date {
        width: 20%;
        max-width: 120px;
      }

      .col-actions {
        width: 10%;
        max-width: 80px;
      }

      .breadcrumb {
        padding: 4px 8px;
        margin-bottom: 10px;
        font-size: 12px;
        white-space: normal;
        word-break: break-word;
        min-height: 30px;
        line-height: 1.2;
      }

      .breadcrumb > li {
        display: inline-block;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: middle;
      }

      .breadcrumb > li + li:before {
        padding: 0 3px;
      }

      /* Compact spacing for table cells */
      .table > thead > tr > th,
      .table > tbody > tr > td {
        padding: 4px 8px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: 1.2;
        height: 26px;
      }

      /* Quick links styling */
      .list-inline {
        margin: 0;
        padding: 4px 0;
        li {
          padding: 0 8px 0 0;
          a {
            font-size: 12px;
          }
        }
      }
    `,
    ],
    standalone: true,
    imports: [CommonModule],
})
export class FileExplorerComponent implements OnInit {
  showPermissionsColumn = input<boolean>(false);
  showActionsColumn = input<boolean>(false);

  metaInfo: any = {
    title: 'File Explorer',
    description: 'Browse files and directories',
    quickLinks: {},
  };

  fileTree: any = null;
  currentDirectory: string = '/';

  // Callback for single click
  onFileClicked: (file: any) => void = null;
  // Add new callback for double click
  onFileDoubleClicked: (file: any) => void = null;

  // Add this property to track selected file
  selectedFile: string = null;

  // Base directory path - will be initialized from meta info
  baseDirPath: string = '/'; // Initialize to prevent errors on early clicks

  private fileExplorerService = inject(FileExplorerService);

  ngOnInit() {
    this.loadMetaInfo();
    this.loadFileTree(this.currentDirectory);
  }

  async loadMetaInfo() {
    try {
      const metaInfo = await this.fileExplorerService.getMetaInfo();
      this.metaInfo = metaInfo;
      // Store the base directory path from meta info
      if (metaInfo && metaInfo.baseDirPath) {
        this.baseDirPath = metaInfo.baseDirPath;
      }
    } catch (error) {
      console.error('Error loading meta info:', error);
    }
  }

  async loadFileTree(directory: string) {
    try {
      const fileTree = await this.fileExplorerService.getFileTree(directory);
      this.fileTree = fileTree;
      this.currentDirectory = fileTree.currentDirectory.fullName;
    } catch (error) {
      console.error('Error loading file tree:', error);
    }
  }

  navigateToDirectoryFromLink(value: any): void {
    if (value === null || value === undefined) {
      console.warn('Invalid directory path:', value);
      return;
    }

    // Handle special case for Home link
    if (value === 'Home' || value === '/db') {
      this.navigateToDirectory(this.baseDirPath);
      return;
    }

    const path = String(value); // Convert to string explicitly
    this.navigateToDirectory(path);
  }

  async navigateToDirectory(path: string) {
    await this.loadFileTree(path);
  }

  getBreadcrumbSegments(): string[] {
    if (!this.fileTree?.currentDirectory?.fullName) {
      return [];
    }
    return this.fileTree.currentDirectory.fullName
      .split('/')
      .filter((s) => s !== '');
  }

  /**
   * Gets the full path up to a specific segment index
   */
  getBreadcrumbPath(index: number): string {
    const segments = this.getBreadcrumbSegments();
    let path = '';
    for (let i = 0; i <= index; i++) {
      path += '/' + segments[i];
    }
    return path;
  }

  /**
   * Gets the display path for breadcrumb segments (relative to base dir)
   * Shows only paths at or below the base directory
   */
  getRelativeBreadcrumbSegments(): string[] {
    if (!this.fileTree?.currentDirectory?.fullName) {
      return [];
    }

    const fullPath = this.fileTree.currentDirectory.fullName;
    const basePath = this.baseDirPath;

    // If we're at or below base directory, show only the relative part
    if (fullPath.startsWith(basePath)) {
      const relativePath = fullPath.substring(basePath.length);
      return relativePath.split(/[\/\\]/).filter((s) => s !== '');
    }

    // For paths outside base directory, show full path
    return fullPath.split(/[\/\\]/).filter((s) => s !== '');
  }

  getRelativeBreadcrumbPath(index: number): string {
    const relativeSegments = this.getRelativeBreadcrumbSegments();
    return (
      this.baseDirPath + '/' + relativeSegments.slice(0, index + 1).join('/')
    );
  }

  /**
   * Returns segments for display in the breadcrumb (only relative to base dir)
   */
  getDisplayPathSegments(): string[] {
    if (!this.fileTree?.currentDirectory?.fullName || !this.baseDirPath) {
      return [];
    }

    // Normalize paths to use forward slashes for consistent comparison
    const fullPath = this.fileTree.currentDirectory.fullName.replace(
      /\\/g,
      '/',
    );
    const basePath = this.baseDirPath.replace(/\\/g, '/');

    // Handle root case or identical paths
    if (fullPath === basePath || fullPath + '/' === basePath) {
      return [];
    }

    // Check if the full path starts with the base path
    if (fullPath.startsWith(basePath)) {
      // Get the part after the base path
      const relativePath = fullPath.substring(basePath.length);
      // Split and filter empty segments (e.g., from trailing slashes)
      return relativePath.split('/').filter((s) => s !== '');
    }

    console.warn(
      `Current path "${fullPath}" is not within base path "${basePath}". Hiding segments.`,
    );
    return []; // Return empty array as the path is outside the allowed scope
  }

  /**
   * Navigate to a specific segment in the path, ensuring it's relative to the base.
   */
  navigateToSegmentPath(index: number): void {
    const segments = this.getDisplayPathSegments();
    if (index < 0 || index >= segments.length) {
      return;
    }

    // Reconstruct the path relative to the base dir
    const relativePath = segments.slice(0, index + 1).join('/');
    const pathToNavigate = this.baseDirPath.endsWith('/')
      ? this.baseDirPath + relativePath
      : this.baseDirPath + '/' + relativePath;

    this.navigateToDirectory(pathToNavigate);
  }

  /**
   * Check if we're at the base directory
   */
  isAtBaseDir(): boolean {
    if (!this.fileTree?.currentDirectory?.fullName || !this.baseDirPath) {
      return false;
    }
    return this.fileTree.currentDirectory.fullName === this.baseDirPath;
  }

  isViewableFile(filename: string): boolean {
    const viewableExtensions = [
      '.txt',
      '.log',
      '.html',
      '.htm',
      '.xml',
      '.json',
      '.md',
      '.css',
      '.js',
      '.yaml',
      '.yml',
    ];
    return viewableExtensions.some((ext) =>
      filename.toLowerCase().endsWith(ext),
    );
  }

  viewFile(path: string) {
    // Find the file object in the file tree
    const file = this.fileTree?.files?.find((f) => f.fullName === path);

    // Call the onFileClicked callback if it exists
    if (file && this.onFileClicked) {
      this.onFileClicked(file);
    }

    // Then proceed with viewing the file
    this.fileExplorerService.viewFile(path);
  }

  /**
   * Select a file (handles single click)
   * @param file The file object to select
   */
  selectFile(file: any) {
    // If receiving a file object directly
    if (file && typeof file === 'object') {
      this.selectedFile = file.fullName; // Update the selectedFile property

      // Call the onFileClicked callback if it exists
      if (this.onFileClicked) {
        this.onFileClicked(file);
      }
      //console.log('File selected:', file.fullName);
      return;
    }

    // If receiving just the path
    const path = typeof file === 'string' ? file : null;
    if (!path) return;

    // Find the file object in the file tree
    const fileObj = this.fileTree?.files?.find((f) => f.fullName === path);

    // Call the onFileClicked callback if it exists
    if (fileObj && this.onFileClicked) {
      this.selectedFile = path; // Update the selectedFile property
      this.onFileClicked(fileObj);
      //console.log('File selected by path:', path);
    }
  }

  /**
   * Handle double-click on a file
   * @param file The file object double-clicked
   */
  selectAndConfirmFile(file: any) {
    // First, ensure the file is selected visually and internally
    this.selectFile(file);
    // Then, trigger the double-click callback if it exists
    if (this.onFileDoubleClicked) {
      this.onFileDoubleClicked(file);
      //console.log('File double-clicked and confirmed:', file.fullName);
    }
  }

  downloadFile(path: string) {
    this.fileExplorerService.downloadFile(path);
  }

  /**
   * Create a new directory in the current location
   * @param dirName Name of the directory to create
   */
  async createDirectory(dirName: string) {
    try {
      const success = await this.fileExplorerService.createDirectory(
        this.currentDirectory,
        dirName,
      );
      if (success) {
        // Refresh the file tree to show the new directory
        await this.loadFileTree(this.currentDirectory);
      }
      return success;
    } catch (error) {
      console.error('Error creating directory:', error);
      return false;
    }
  }

  /**
   * Delete a file or directory
   * @param path Path to the file or directory to delete
   */
  async deleteItem(path: string) {
    try {
      const success = await this.fileExplorerService.delete(path);
      if (success) {
        // Refresh the file tree
        await this.loadFileTree(this.currentDirectory);
      }
      return success;
    } catch (error) {
      console.error('Error deleting item:', error);
      return false;
    }
  }

  /**
   * Handle file upload
   * @param event File input change event
   */
  async onFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      try {
        const file = input.files[0];
        const success = await this.fileExplorerService.uploadFile(
          this.currentDirectory,
          file,
        );

        if (success) {
          // Refresh file tree after upload
          await this.loadFileTree(this.currentDirectory);
        }

        // Reset the file input
        input.value = '';

        return success;
      } catch (error) {
        console.error('Error uploading file:', error);
        return false;
      }
    }
    return false;
  }

  // Add method to get display name of base directory
  getBaseName(): string {
    if (!this.baseDirPath) {
      return '';
    }
    // Get the last segment of the base path
    return (
      this.baseDirPath
        .split(/[\/\\]/)
        .filter((s) => s !== '')
        .pop() || 'Home'
    );
  }
}
