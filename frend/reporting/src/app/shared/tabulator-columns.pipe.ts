import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
    name: 'tabulatorColumns',
    pure: true,
    standalone: true
})
export class TabulatorColumnsPipe implements PipeTransform {
  transform(columnNames: string[]): { title: string; field: string }[] {
    if (!columnNames || !Array.isArray(columnNames)) {
      return [];
    }

    return columnNames.map((name) => ({
      title: name.replace(/([A-Z])/g, ' $1').trim(),
      field: name,
    }));
  }
}
