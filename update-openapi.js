const fs = require('fs');

const path = 'C:/Users/Carlos/.gemini/antigravity-ide/scratch/puffin-system/lib/api-spec/openapi.yaml';
let yaml = fs.readFileSync(path, 'utf8');

// We need to add /egresos and /search to paths, and /mantenimientos/{id}/estado
// Also we need to add the schemas for Egreso, EgresoInput, etc.

const mantenimientosEstadoPath = `
  /mantenimientos/{id}/estado:
    patch:
      operationId: updateMantenimientoEstado
      tags: [mantenimientos]
      summary: Actualizar estado de mantenimiento
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: integer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                estado:
                  type: string
                  enum: [pendiente, realizado, cancelado]
      responses:
        "200":
          description: Estado actualizado
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Mantenimiento"
`;

const egresosPaths = `
  /egresos:
    get:
      operationId: getEgresos
      tags: [egresos]
      summary: Listar egresos
      parameters:
        - name: categoria
          in: query
          schema:
            type: string
        - name: centro_costos
          in: query
          schema:
            type: string
        - name: proveedor
          in: query
          schema:
            type: string
        - name: search
          in: query
          schema:
            type: string
      responses:
        "200":
          description: Lista de egresos
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/Egreso"
    post:
      operationId: createEgreso
      tags: [egresos]
      summary: Registrar egreso
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/EgresoInput"
      responses:
        "201":
          description: Egreso registrado
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Egreso"
`;

const searchPaths = `
  /search:
    get:
      operationId: globalSearch
      tags: [search]
      summary: Búsqueda global
      parameters:
        - name: q
          in: query
          schema:
            type: string
      responses:
        "200":
          description: Resultados de búsqueda
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/SearchResults"
`;

const schemas = `
    Egreso:
      type: object
      required: [id, fecha, categoria, concepto, monto]
      properties:
        id:
          type: integer
        empresa_id:
          type: integer
        fecha:
          type: string
        categoria:
          type: string
        concepto:
          type: string
        proveedor:
          type: ["string", "null"]
        monto:
          type: number
        metodo_pago:
          type: ["string", "null"]
        comprobante:
          type: boolean
        centro_costos:
          type: ["string", "null"]
        observaciones:
          type: ["string", "null"]

    EgresoInput:
      type: object
      required: [fecha, categoria, concepto, monto]
      properties:
        fecha:
          type: string
        categoria:
          type: string
        concepto:
          type: string
        proveedor:
          type: string
        monto:
          type: number
        metodo_pago:
          type: string
        comprobante:
          type: boolean
        centro_costos:
          type: string
        observaciones:
          type: string

    SearchResults:
      type: object
      properties:
        jornadas:
          type: array
          items:
            $ref: "#/components/schemas/Jornada"
        maquinas:
          type: array
          items:
            $ref: "#/components/schemas/Maquina"
        empleados:
          type: array
          items:
            $ref: "#/components/schemas/Empleado"
        mantenimientos:
          type: array
          items:
            $ref: "#/components/schemas/Mantenimiento"
        incidentes:
          type: array
          items:
            $ref: "#/components/schemas/Incidente"
`;

// Insert the new paths before the components: section
yaml = yaml.replace("components:", mantenimientosEstadoPath + egresosPaths + searchPaths + "\ncomponents:");

// Insert schemas at the end
yaml = yaml + schemas;

fs.writeFileSync(path, yaml);
console.log("Updated openapi.yaml");
