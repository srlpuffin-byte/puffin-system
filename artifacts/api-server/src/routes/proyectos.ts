import { Router } from "express";
import { db } from "@workspace/db";
import { proyectosTable, usuariosTable, empleadosTable } from "@workspace/db/schema";
import { eq, or, and, neq } from "drizzle-orm";
import { updateOrAppendToSheet } from "../services/sheets.js";

const router = Router();

// Listar todos los proyectos
router.get("/sync-sheet", async (req, res) => {
  const { google } = await import("googleapis");
  const SHEET_ID = process.env.GOOGLE_SHEET_ID;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) return res.status(500).json({ error: "No credentials" });
  
  const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
  const sheetsClient = google.sheets({ version: "v4", auth });

  const proyectos = await db.select().from(proyectosTable).orderBy(proyectosTable.id);

  const headers = ["ID", "Lugar", "Hectáreas", "Precio x Hectárea", "Ganancia Estimada", "Empleados Asignados", "Máquinas Asignadas", "Estado"];
  const rows = proyectos.map(p => [
    p.id,
    p.lugar,
    p.hectareas,
    p.precio_hectarea,
    p.ganancia_estimada,
    Array.isArray(p.empleados_asignados) ? p.empleados_asignados.join(", ") : "",
    Array.isArray(p.maquinas_asignadas) ? p.maquinas_asignadas.join(", ") : "",
    p.estado || "activo"
  ]);

  const allData = [headers, ...rows];

  await sheetsClient.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: "Proyectos!A:Z" });
  await sheetsClient.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: "Proyectos!A1",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: allData },
  });

  return res.json({ success: true, rowsCount: rows.length });
});

router.get("/", async (req, res) => {
  try {
    let proyectos = await db.select().from(proyectosTable).orderBy(proyectosTable.createdAt);
    
    if (req.user?.rol === "empleado") {
      const [user] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, req.user.id)).limit(1);
      const [emp] = await db.select().from(empleadosTable)
        .where(or(
          eq(empleadosTable.dni, user.usuario),
          and(eq(empleadosTable.nombre, user.nombre), eq(empleadosTable.apellido, user.apellido))
        )).limit(1);
      
      const empId = emp?.id;
      
      proyectos = proyectos.filter(p => {
        const asignados = p.empleados_asignados as number[] | null;
        return asignados && empId && asignados.includes(empId);
      }).map(p => ({
        ...p,
        precio_hectarea: "0",
        ganancia_estimada: "0",
        total_cobrado: "0",
        pagos_historial: [],
      }));
    }
    
    return res.json(proyectos);
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al obtener proyectos" });
  }
});

// Crear un nuevo proyecto
router.post("/", async (req, res) => {
  try {
    const { lugar, hectareas, precio_hectarea, empleados_asignados, maquinas_asignadas, estado } = req.body;
    
    if (!lugar || hectareas === undefined || precio_hectarea === undefined) {
      return res.status(400).json({ error: "Lugar, hectareas y precio_hectarea son obligatorios" });
    }

    const ganancia_estimada = (parseFloat(hectareas) * parseFloat(precio_hectarea)).toString();

    const [proyecto] = await db.insert(proyectosTable).values({
      lugar,
      hectareas: hectareas.toString(),
      precio_hectarea: precio_hectarea.toString(),
      ganancia_estimada,
      empleados_asignados: empleados_asignados || [],
      maquinas_asignadas: maquinas_asignadas || [],
      estado: estado || "activo",
    }).returning();

    if (maquinas_asignadas && Array.isArray(maquinas_asignadas) && maquinas_asignadas.length > 0) {
      const otrosProyectos = await db.select().from(proyectosTable).where(neq(proyectosTable.id, proyecto.id));
      for (const p of otrosProyectos) {
        if (p.maquinas_asignadas && Array.isArray(p.maquinas_asignadas)) {
          const mAsig = maquinas_asignadas.map(m => Number(m));
          const nuevasMaquinas = p.maquinas_asignadas.filter(m => !mAsig.includes(Number(m)));
          if (nuevasMaquinas.length !== p.maquinas_asignadas.length) {
            await db.update(proyectosTable).set({ maquinas_asignadas: nuevasMaquinas }).where(eq(proyectosTable.id, p.id));
          }
        }
      }
    }

    import("../services/sync-sheets.js").then(({ syncAllSheets }) => {
      syncAllSheets().catch(console.error);
    });

    return res.status(201).json(proyecto);
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al crear proyecto" });
  }
});

// Obtener un proyecto por ID
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    let [proyecto] = await db.select().from(proyectosTable).where(eq(proyectosTable.id, id)).limit(1);
    if (!proyecto) return res.status(404).json({ error: "Proyecto no encontrado" });

    if (req.user?.rol === "empleado") {
      const [user] = await db.select().from(usuariosTable).where(eq(usuariosTable.id, req.user.id)).limit(1);
      const [emp] = await db.select().from(empleadosTable)
        .where(or(
          eq(empleadosTable.dni, user.usuario),
          and(eq(empleadosTable.nombre, user.nombre), eq(empleadosTable.apellido, user.apellido))
        )).limit(1);
      
      const empId = emp?.id;
      const asignados = proyecto.empleados_asignados as number[] | null;
      if (!asignados || !empId || !asignados.includes(empId)) {
        return res.status(403).json({ error: "No tienes permiso para ver este proyecto" });
      }
      
      proyecto = {
        ...proyecto,
        precio_hectarea: "0",
        ganancia_estimada: "0",
        total_cobrado: "0",
        pagos_historial: [],
      };
    }

    return res.json(proyecto);
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al obtener proyecto" });
  }
});

// Actualizar un proyecto
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const { lugar, hectareas, precio_hectarea, empleados_asignados, maquinas_asignadas, estado, estado_pago, total_cobrado, pagos_historial } = req.body;
    
    const updateData: Record<string, any> = {};
    if (lugar !== undefined) updateData.lugar = lugar;
    if (hectareas !== undefined) updateData.hectareas = hectareas.toString();
    if (precio_hectarea !== undefined) updateData.precio_hectarea = precio_hectarea.toString();
    if (empleados_asignados !== undefined) updateData.empleados_asignados = empleados_asignados;
    if (maquinas_asignadas !== undefined) updateData.maquinas_asignadas = maquinas_asignadas;
    if (estado !== undefined) updateData.estado = estado;
    if (estado_pago !== undefined) updateData.estado_pago = estado_pago;
    if (total_cobrado !== undefined) updateData.total_cobrado = total_cobrado.toString();
    if (pagos_historial !== undefined) updateData.pagos_historial = pagos_historial;

    if (maquinas_asignadas !== undefined && Array.isArray(maquinas_asignadas) && maquinas_asignadas.length > 0) {
      const otrosProyectos = await db.select().from(proyectosTable).where(neq(proyectosTable.id, id));
      for (const p of otrosProyectos) {
        if (p.maquinas_asignadas && Array.isArray(p.maquinas_asignadas)) {
          const mAsig = maquinas_asignadas.map((m: any) => Number(m));
          const nuevasMaquinas = p.maquinas_asignadas.filter(m => !mAsig.includes(Number(m)));
          if (nuevasMaquinas.length !== p.maquinas_asignadas.length) {
            await db.update(proyectosTable).set({ maquinas_asignadas: nuevasMaquinas }).where(eq(proyectosTable.id, p.id));
          }
        }
      }
    }

    // Recalcular ganancia si se actualiza alguno de los factores
    if (hectareas !== undefined || precio_hectarea !== undefined) {
      const current = await db.select({ h: proyectosTable.hectareas, p: proyectosTable.precio_hectarea }).from(proyectosTable).where(eq(proyectosTable.id, id)).limit(1);
      if (current.length > 0) {
        const h = hectareas !== undefined ? parseFloat(hectareas) : parseFloat(current[0].h);
        const p = precio_hectarea !== undefined ? parseFloat(precio_hectarea) : parseFloat(current[0].p);
        updateData.ganancia_estimada = (h * p).toString();
      }
    }

    const [proyecto] = await db.update(proyectosTable).set(updateData).where(eq(proyectosTable.id, id)).returning();
    if (!proyecto) return res.status(404).json({ error: "Proyecto no encontrado" });

    import("../services/sync-sheets.js").then(({ syncAllSheets }) => {
      syncAllSheets().catch(console.error);
    });

    return res.json(proyecto);
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al actualizar proyecto" });
  }
});

// Registrar un nuevo pago en el historial del proyecto
router.post("/:id/pagos", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido" });

    const { fecha, tipo, monto_monetario, descripcion, comprobante_url, addToInventory } = req.body;
    
    // Obtener proyecto actual
    const [proyecto] = await db.select().from(proyectosTable).where(eq(proyectosTable.id, id)).limit(1);
    if (!proyecto) return res.status(404).json({ error: "Proyecto no encontrado" });

    let currentPagos: any[] = [];
    if (Array.isArray(proyecto.pagos_historial)) {
      currentPagos = proyecto.pagos_historial;
    } else if (typeof proyecto.pagos_historial === 'string') {
      try { currentPagos = JSON.parse(proyecto.pagos_historial); } catch(e) {}
    }
    const nuevoPago = {
      id: Date.now().toString(),
      fecha,
      tipo,
      monto_monetario: parseFloat(monto_monetario || "0"),
      descripcion,
      comprobante_url
    };

    const newPagosList = [...currentPagos, nuevoPago];
    
    let newTotal = parseFloat(proyecto.total_cobrado || "0");
    if (tipo !== 'especie') {
      newTotal += nuevoPago.monto_monetario;
    }

    // Auto determinar estado (si el total pagado es >= ganancia estimada)
    const ganancia = parseFloat(proyecto.ganancia_estimada || "0");
    let nuevoEstado = "parcial";
    if (newTotal >= ganancia && ganancia > 0) {
      nuevoEstado = "saldado";
    }

    await db.update(proyectosTable).set({
      pagos_historial: newPagosList,
      total_cobrado: newTotal.toString(),
      estado_pago: nuevoEstado
    }).where(eq(proyectosTable.id, id));

    // Si el usuario marcó para enviar al inventario
    if ((tipo === 'especie' || tipo === 'vehiculo') && addToInventory) {
      const { maquinasTable } = await import("@workspace/db");
      await db.insert(maquinasTable).values({
        codigo: `INV-PROY-${id}-${Date.now().toString().slice(-4)}`,
        nombre: descripcion.substring(0, 50),
        tipo: "Otro",
        marca: "N/A",
        modelo: "N/A",
        anio: new Date().getFullYear(),
        patente: "",
        horometro: "0",
        kilometros: "0",
        categoria: "inventario",
        estado: "activa",
        descripcion: `Recibido como pago en proyecto: ${proyecto.lugar}`
      });
    }

    import("../services/sync-sheets.js").then(({ syncAllSheets }) => {
      syncAllSheets().catch(console.error);
    });

    return res.json({ success: true, pago: nuevoPago });
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al registrar pago" });
  }
});

// Eliminar un pago
router.delete("/:id/pagos/:pagoId", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { pagoId } = req.params;

    const [proyecto] = await db.select().from(proyectosTable).where(eq(proyectosTable.id, id)).limit(1);
    if (!proyecto) return res.status(404).json({ error: "Proyecto no encontrado" });

    let currentPagos: any[] = [];
    if (Array.isArray(proyecto.pagos_historial)) {
      currentPagos = proyecto.pagos_historial;
    } else if (typeof proyecto.pagos_historial === 'string') {
      try { currentPagos = JSON.parse(proyecto.pagos_historial); } catch(e) {}
    }

    const pagoToDelete = currentPagos.find((p: any) => p.id === pagoId);
    if (!pagoToDelete) return res.status(404).json({ error: "Pago no encontrado" });

    const newPagosList = currentPagos.filter((p: any) => p.id !== pagoId);
    
    let newTotal = parseFloat(proyecto.total_cobrado || "0");
    if (pagoToDelete.tipo !== 'especie' && pagoToDelete.tipo !== 'vehiculo') {
      newTotal -= (pagoToDelete.monto_monetario || 0);
      if (newTotal < 0) newTotal = 0;
    }

    const ganancia = parseFloat(proyecto.ganancia_estimada || "0");
    let nuevoEstado = "pendiente";
    if (newTotal > 0 && newTotal < ganancia) {
      nuevoEstado = "parcial";
    } else if (newTotal >= ganancia && ganancia > 0) {
      nuevoEstado = "saldado";
    } else if (newTotal > 0 && ganancia === 0) {
      nuevoEstado = "saldado";
    }

    await db.update(proyectosTable).set({
      pagos_historial: newPagosList,
      total_cobrado: newTotal.toString(),
      estado_pago: nuevoEstado
    }).where(eq(proyectosTable.id, id));

    return res.json({ success: true });
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al eliminar pago" });
  }
});

// Eliminar un proyecto
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(proyectosTable).where(eq(proyectosTable.id, id)).returning();
    if (!deleted) return res.status(404).json({ error: "Proyecto no encontrado" });
    return res.json({ message: "Proyecto eliminado correctamente" });
  } catch (err: any) {
    req.log.error(err);
    return res.status(500).json({ error: "Error al eliminar proyecto" });
  }
});

export default router;
