import { Injectable } from '@angular/core';
import { ApiService } from '../../providers/api.service';

@Injectable({
  providedIn: 'root',
})
export class FileExplorerService {
  private endpoint = '/system/fs/explorer';

  constructor(private apiService: ApiService) {}

  /**
   * Get meta information about the file explorer (title, description, quick links)
   */
  async getMetaInfo(): Promise<any> {
    return this.apiService.get(`${this.endpoint}/meta-info`);
  }

  /**
   * Get file tree structure for the specified directory
   * @param directory Directory path to explore
   */
  async getFileTree(directory: string): Promise<any> {
    return this.apiService.get(`${this.endpoint}/file-tree`, {
      dir: encodeURIComponent(directory),
    });
  }

  /**
   * View file content - opens file viewer
   * @param path Full path to the file
   */
  viewFile(path: string): void {
    const url = `${this.apiService.BACKEND_URL}${this.endpoint}/file-viewer?file=${encodeURIComponent(path)}`;
    window.open(url, '_blank');
  }

  /**
   * Download a file
   * @param path Full path to the file
   */
  downloadFile(path: string): void {
    const url = `${this.apiService.BACKEND_URL}${this.endpoint}/file-downloader?file=${encodeURIComponent(path)}`;
    window.location.href = url;
  }

  /**
   * Check if file is viewable by its extension
   * @param filename Name of the file to check
   */
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

  /**
   * Create a new directory
   * @param path Parent directory path
   * @param dirName Name of the new directory
   */
  async createDirectory(path: string, dirName: string): Promise<boolean> {
    try {
      return await this.apiService.post(`${this.endpoint}/create-directory`, {
        path,
        name: dirName,
      });
    } catch (error) {
      console.error('Error creating directory:', error);
      return false;
    }
  }

  /**
   * Delete a file or directory
   * @param path Path to file or directory to delete
   */
  async delete(path: string): Promise<boolean> {
    try {
      return await this.apiService.delete(`${this.endpoint}/delete`, { path });
    } catch (error) {
      console.error('Error deleting file/directory:', error);
      return false;
    }
  }

  /**
   * Upload a file to the current directory
   * @param directory Current directory path
   * @param file File to upload
   */
  async uploadFile(directory: string, file: File): Promise<boolean> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('dir', directory);

      // Need to handle FormData in your ApiService or modify this approach
      const response = await fetch(
        `${this.apiService.BACKEND_URL}${this.endpoint}/upload`,
        {
          method: 'POST',
          body: formData,
        },
      );

      return response.ok;
    } catch (error) {
      console.error('Error uploading file:', error);
      return false;
    }
  }

  /**
   * Get file content as text
   * @param path Full path to the file
   */
  async getFileContent(path: string): Promise<string> {
    return this.apiService.get(
      `${this.endpoint}/file-content`,
      { file: encodeURIComponent(path) },
      undefined,
      'text',
    );
  }
}
