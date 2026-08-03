import { db } from "./src/index.js";
import { auditoriaTable, usuariosTable } from "./src/schema/index.js";
import { desc } from "drizzle-orm";
import fs from "fs";

async function exportCSV() {
  console.log("Conectando a la base de datos...");
  try {
    const auditoria = await db.select().from(auditoriaTable).orderBy(desc(auditoriaTable.createdAt)).limit(1000);
    const usuariosList = await db.select({ id: usuariosTable.id, nombre: usuariosTable.nombre }).from(usuariosTable);
    
    let csvContent = "Fecha y Hora,Administrador,Acción,Sección,Detalles,ID\n";
    
    const reversed = [...auditoria].reverse();
    
    for (const a of reversed) {
      const usuario = a.usuario_id ? usuariosList.find(u => u.id === a.usuario_id) : null;
      
      const fecha = a.createdAt ? new Date(a.createdAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" }) : "";
      const admin = usuario ? usuario.nombre : (a.dispositivo === "WhatsApp Bot" ? "Pia (Asistente)" : "Sistema");
      const accion = (a.accion || "").replace(/"/g, '""');
      const seccion = (a.entidad || "").replace(/"/g, '""');
      const detalles = a.valor_nuevo ? JSON.stringify(a.valor_nuevo).replace(/"/g, '""') : "";
      const id = a.id;
      
      csvContent += `"${fecha}","${admin}","${accion}","${seccion}","${detalles}","${id}"\n`;
    }
    
    const desktopPath = "C:\\Users\\Carlos\\Desktop\\auditoria_rescatada.csv";
    fs.writeFileSync(desktopPath, csvContent, "utf-8");
    console.log(`¡Éxito! Archivo CSV guardado en: ${desktopPath}`);
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

exportCSV();
