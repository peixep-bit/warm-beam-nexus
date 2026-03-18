declare module 'read-excel-file' {
  type CellValue = string | number | boolean | Date | null;
  export default function readXlsxFile(file: File): Promise<CellValue[][]>;
}

declare module 'read-excel-file/web' {
  type CellValue = string | number | boolean | Date | null;
  export default function readXlsxFile(file: File): Promise<CellValue[][]>;
}
