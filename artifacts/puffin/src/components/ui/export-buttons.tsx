import React from "react";
import { Button } from "./button";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import logoUrl from "@assets/logo_puffin_1782946440101.jpeg";

interface Column {
  header: string;
  key: string;
  formatter?: (value: any) => string;
}

interface ExportButtonsProps {
  data: any[];
  columns: Column[];
  filename: string;
  title: string;
}

export function ExportButtons({ data, columns, filename, title }: ExportButtonsProps) {
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF();
      
      // Add Title
      doc.setFontSize(18);
      doc.text("PUFFIN SRL - " + title, 14, 22);
      
      // Add Date
      doc.setFontSize(10);
      doc.text(`Fecha de exportación: ${new Date().toLocaleString()}`, 14, 30);

      // Prepare data
      const tableColumn = columns.map(col => col.header);
      const tableRows = data.map(item => {
        return columns.map(col => {
          const val = item[col.key];
          return col.formatter ? col.formatter(val) : (val?.toString() || "");
        });
      });

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 35,
        theme: 'striped',
        headStyles: { fillColor: [41, 128, 185] }, // Un azul genérico para los encabezados
      });

      doc.save(`${filename}_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success("PDF exportado correctamente");
    } catch (error) {
      console.error(error);
      toast.error("Error al exportar a PDF");
    }
  };

  const handleExportExcel = () => {
    try {
      // Prepare data map
      const excelData = data.map(item => {
        const row: Record<string, string> = {};
        columns.forEach(col => {
          const val = item[col.key];
          row[col.header] = col.formatter ? col.formatter(val) : (val?.toString() || "");
        });
        return row;
      });

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
      
      XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success("Excel exportado correctamente");
    } catch (error) {
      console.error(error);
      toast.error("Error al exportar a Excel");
    }
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleExportPDF} className="flex items-center gap-1.5">
        <FileText className="w-4 h-4 text-red-500" />
        <span className="hidden sm:inline">PDF</span>
      </Button>
      <Button variant="outline" size="sm" onClick={handleExportExcel} className="flex items-center gap-1.5">
        <FileSpreadsheet className="w-4 h-4 text-green-600" />
        <span className="hidden sm:inline">Excel</span>
      </Button>
    </div>
  );
}
