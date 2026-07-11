import { Router } from "express";
import { appendToSheet } from "../services/sheets.js";

const router = Router();

router.post("/mensual", async (req, res) => {
  try {
    const ahora = new Date();
    const mes = ahora.toLocaleString('es-ES', { month: 'long', year: 'numeric' }).toUpperCase();
    
    // Fila separadora (corte)
    const cutoffRow = [
      "======================",
      `CIERRE DE MES: ${mes}`,
      "======================",
      "", "", "", "", "", "", ""
    ];

    // Encabezados profesionales para el próximo mes
    const headerEgresos = ["ID", "FECHA", "CATEGORIA", "CONCEPTO", "PROVEEDOR", "MONTO", "METODO_PAGO", "COMPROBANTE", "CENTRO_COSTOS", "OBSERVACIONES"];
    const headerJornadas = ["ID", "FECHA", "EMPLEADO", "MAQUINA", "HORAS_TRABAJADAS", "KM_INICIO", "KM_FIN", "ESTADO", "OBRA", "DESCRIPCION_TRABAJO"];
    const headerCombustible = ["ID", "FECHA", "MAQUINA", "OPERADOR", "LITROS", "MONTO", "PROVEEDOR", "TICKET"];

    // Append a cada hoja
    await appendToSheet("Egresos", cutoffRow);
    await appendToSheet("Egresos", headerEgresos);

    await appendToSheet("Jornadas", cutoffRow);
    await appendToSheet("Jornadas", headerJornadas);

    await appendToSheet("Combustible", cutoffRow);
    await appendToSheet("Combustible", headerCombustible);

    return res.status(200).json({ message: "Cierre mensual ejecutado exitosamente." });
  } catch (error) {
    console.error("Error en cierre mensual:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
