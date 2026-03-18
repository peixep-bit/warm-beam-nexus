declare module 'read-excel-file' {
  type CellValue = string | number | boolean | Date | null;
  export default function readXlsxFile(file: File): Promise<CellValue[][]>;
}
