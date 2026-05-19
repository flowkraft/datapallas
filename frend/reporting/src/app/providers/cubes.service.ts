import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

export interface CubeDefinition {
  id: string;
  name: string;
  description: string;
  connectionId: string;
  dslCode: string;
  activeClicked?: boolean;
  // True for bundled sample cubes (under config/samples-cubes/) — read-only
  isSample?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class CubesService {
  cubeDefinitions: CubeDefinition[] = [];

  protected apiService = inject(ApiService);

  async loadAll(): Promise<CubeDefinition[]> {
    const list = await this.apiService.get('/cubes');
    this.cubeDefinitions = (list || []).map((c: any) => ({
      ...c,
      activeClicked: false,
      // Backend returns isSample as the string "true"/"false" — normalize to boolean
      isSample: c.isSample === true || c.isSample === 'true',
    }));
    return this.cubeDefinitions;
  }

  async load(cubeId: string): Promise<CubeDefinition> {
    const result = await this.apiService.get(`/cubes/${encodeURIComponent(cubeId)}`);
    if (result) {
      // Backend returns isSample as boolean here (load uses Map<String,Object>)
      result.isSample = result.isSample === true || result.isSample === 'true';
    }
    return result;
  }

  async save(cubeId: string, data: Partial<CubeDefinition>): Promise<void> {
    return this.apiService.put(`/cubes/${encodeURIComponent(cubeId)}`, data);
  }

  async create(cubeId: string, name: string): Promise<CubeDefinition> {
    return this.apiService.post('/cubes', { cubeId, name });
  }

  async delete(cubeId: string): Promise<void> {
    return this.apiService.delete(`/cubes/${encodeURIComponent(cubeId)}`);
  }

  async duplicate(
    sourceId: string,
    targetId: string,
    targetName: string,
  ): Promise<CubeDefinition> {
    return this.apiService.post(
      `/cubes/${encodeURIComponent(sourceId)}/duplicate`,
      { targetCubeId: targetId, targetName },
    );
  }

  async parseDsl(dslCode: string): Promise<any> {
    return this.apiService.post('/cubes/parse-dsl', { dslCode });
  }

  async generateSqlFromDsl(
    dslCode: string,
    connectionId: string,
    selectedDimensions: string[],
    selectedMeasures: string[],
    selectedSegments: string[] = [],
  ): Promise<{ sql: string; dialect: string }> {
    return this.apiService.post('/cubes/generate-sql', {
      dslCode,
      connectionId,
      selectedDimensions,
      selectedMeasures,
      selectedSegments,
    });
  }

  async generateSql(
    cubeId: string,
    connectionId: string,
    selectedDimensions: string[],
    selectedMeasures: string[],
    selectedSegments: string[] = [],
  ): Promise<{ sql: string; dialect: string }> {
    return this.apiService.post(
      `/cubes/${encodeURIComponent(cubeId)}/generate-sql`,
      { connectionId, selectedDimensions, selectedMeasures, selectedSegments },
    );
  }
}
