CREATE TABLE "actividad" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"tipo" text NOT NULL,
	"descripcion" text NOT NULL,
	"usuario_id" integer,
	"usuario_nombre" text,
	"entidad_tipo" text,
	"entidad_id" integer,
	"entidad_nombre" text,
	"fecha" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "alertas" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"tipo" text NOT NULL,
	"prioridad" text DEFAULT 'azul' NOT NULL,
	"descripcion" text NOT NULL,
	"estado" text DEFAULT 'activa' NOT NULL,
	"entidad_tipo" text,
	"entidad_id" integer,
	"entidad_nombre" text,
	"fecha" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"usuario_id" integer,
	"accion" text NOT NULL,
	"entidad" text NOT NULL,
	"entidad_id" integer,
	"valor_anterior" jsonb,
	"valor_nuevo" jsonb,
	"ip" text,
	"dispositivo" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"tipo" text NOT NULL,
	"frecuencia" text,
	"archivo_url" text NOT NULL,
	"tamano_bytes" integer,
	"creado_por" integer,
	"exitoso" boolean DEFAULT true,
	"error_mensaje" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "combustible" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"empleado_id" integer NOT NULL,
	"maquina_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"litros" numeric(10, 2) NOT NULL,
	"precio" numeric(10, 2),
	"importe" numeric(10, 2),
	"estacion" text,
	"ubicacion" text,
	"kilometraje" numeric(10, 1),
	"foto_ticket" text,
	"foto_surtidor" text,
	"estado" text DEFAULT 'activo' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"tipo" text NOT NULL,
	"descripcion" text,
	"entidad_tipo" text,
	"entidad_id" integer,
	"fecha_vencimiento" date NOT NULL,
	"archivo_url" text,
	"estado_doc" text DEFAULT 'vigente' NOT NULL,
	"activo" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "egresos" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"fecha" date NOT NULL,
	"categoria" text NOT NULL,
	"concepto" text NOT NULL,
	"proveedor" text,
	"monto" numeric(12, 2) NOT NULL,
	"metodo_pago" text,
	"comprobante" boolean DEFAULT false,
	"centro_costos" text,
	"observaciones" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "empleados" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"dni" text NOT NULL,
	"telefono" text,
	"contacto_familiar_nombre" text,
	"contacto_familiar_telefono" text,
	"contacto_familiar_relacion" text,
	"cargo" text,
	"estado" text DEFAULT 'activo' NOT NULL,
	"fecha_ingreso" date,
	"telefono_whatsapp" text,
	"vencimiento_carnet" date,
	"recibir_alertas_whatsapp" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"logo_url" text,
	"activa" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "fotografias" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"entidad_tipo" text NOT NULL,
	"entidad_id" integer NOT NULL,
	"url" text NOT NULL,
	"descripcion" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "incidentes" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"empleado_id" integer,
	"maquina_id" integer,
	"tipo" text DEFAULT 'otro' NOT NULL,
	"descripcion" text NOT NULL,
	"foto_url" text,
	"fecha" date NOT NULL,
	"estado" text DEFAULT 'activo' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"nombre" text NOT NULL,
	"apellido" text NOT NULL,
	"usuario" text NOT NULL,
	"pin_hash" text NOT NULL,
	"rol" text DEFAULT 'empleado' NOT NULL,
	"activo" boolean DEFAULT true,
	"intentos_fallidos" integer DEFAULT 0,
	"bloqueado" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "usuarios_usuario_unique" UNIQUE("usuario")
);
--> statement-breakpoint
CREATE TABLE "maquinas" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"codigo" text,
	"categoria" text DEFAULT 'maquinaria' NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"marca" text,
	"modelo" text,
	"anio" integer,
	"patente" text,
	"dominio" text,
	"chasis" text,
	"motor" text,
	"horometro" numeric(10, 1) DEFAULT '0',
	"kilometros" numeric(10, 1) DEFAULT '0',
	"estado" text DEFAULT 'activa' NOT NULL,
	"satcom_id" integer,
	"ultimo_service" text,
	"proximo_service" text,
	"filtro_tipo" text,
	"filtro_codigo" text,
	"filtro_fecha_cambio" date,
	"filtro_proximo_cambio" date,
	"descripcion" text,
	"vencimiento_seguro" date,
	"vencimiento_vtv" date,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "jornadas" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"empleado_id" integer NOT NULL,
	"maquina_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"ubicacion" text,
	"nombre_obra" text,
	"tipo_trabajo" text,
	"descripcion_trabajo" text,
	"hora_inicio" text,
	"hora_fin" text,
	"km_inicio" numeric(10, 1),
	"km_fin" numeric(10, 1),
	"horometro_inicio" numeric(10, 1),
	"horometro_fin" numeric(10, 1),
	"combustible_nivel" text,
	"aceite_estado" text,
	"danos_choques" text,
	"checklist_previo" text,
	"checklist_ok" text,
	"estado_equipo_inicio" text,
	"estado_equipo_fin" text,
	"foto_tablero_inicio" text,
	"foto_tablero_fin" text,
	"observaciones" text,
	"problemas" text,
	"estado" text DEFAULT 'en_curso' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mantenimientos" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"maquina_id" integer NOT NULL,
	"empleado_id" integer,
	"fecha" date NOT NULL,
	"horas" numeric(10, 1),
	"tipo" text NOT NULL,
	"descripcion" text,
	"proximo_service" text,
	"estado" text DEFAULT 'realizado' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "proyectos" (
	"id" serial PRIMARY KEY NOT NULL,
	"empresa_id" integer DEFAULT 1 NOT NULL,
	"lugar" text NOT NULL,
	"hectareas" numeric(10, 2) NOT NULL,
	"precio_hectarea" numeric(10, 2) NOT NULL,
	"ganancia_estimada" numeric(12, 2),
	"pagos_historial" jsonb DEFAULT '[]'::jsonb,
	"estado_pago" text DEFAULT 'pendiente' NOT NULL,
	"total_cobrado" numeric(12, 2) DEFAULT '0',
	"empleados_asignados" integer[],
	"maquinas_asignadas" integer[],
	"estado" text DEFAULT 'activo' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "whatsapp_sesiones" (
	"phone" text PRIMARY KEY NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estado" text DEFAULT 'idle' NOT NULL,
	"datos_pendientes" jsonb,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "combustible_fecha_idx" ON "combustible" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "combustible_empleado_idx" ON "combustible" USING btree ("empleado_id");--> statement-breakpoint
CREATE INDEX "combustible_maquina_idx" ON "combustible" USING btree ("maquina_id");--> statement-breakpoint
CREATE INDEX "egresos_fecha_idx" ON "egresos" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "egresos_categoria_idx" ON "egresos" USING btree ("categoria");--> statement-breakpoint
CREATE INDEX "emp_estado_idx" ON "empleados" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "entidad_idx" ON "fotografias" USING btree ("entidad_tipo","entidad_id");--> statement-breakpoint
CREATE INDEX "incidentes_fecha_idx" ON "incidentes" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "incidentes_empleado_idx" ON "incidentes" USING btree ("empleado_id");--> statement-breakpoint
CREATE INDEX "incidentes_maquina_idx" ON "incidentes" USING btree ("maquina_id");--> statement-breakpoint
CREATE INDEX "estado_idx" ON "maquinas" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "categoria_idx" ON "maquinas" USING btree ("categoria");--> statement-breakpoint
CREATE INDEX "empleado_idx" ON "jornadas" USING btree ("empleado_id");--> statement-breakpoint
CREATE INDEX "maquina_idx" ON "jornadas" USING btree ("maquina_id");--> statement-breakpoint
CREATE INDEX "fecha_idx" ON "jornadas" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "mantenimientos_fecha_idx" ON "mantenimientos" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "mantenimientos_empleado_idx" ON "mantenimientos" USING btree ("empleado_id");--> statement-breakpoint
CREATE INDEX "mantenimientos_maquina_idx" ON "mantenimientos" USING btree ("maquina_id");