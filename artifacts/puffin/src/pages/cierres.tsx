import { useState } from "react";
import { useEjecutarCierreMensual } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Calendar, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export function Cierres() {
  const { mutate: ejecutarCierre, isPending } = useEjecutarCierreMensual();
  const [cierreRealizado, setCierreRealizado] = useState(false);

  const handleCierre = () => {
    if (confirm("¿Estás seguro de que deseas ejecutar el cierre mensual? Esto insertará una fila de corte en los archivos Excel de Google Sheets para iniciar un nuevo periodo. Asegúrate de hacerlo solo al finalizar el mes.")) {
      ejecutarCierre(undefined, {
        onSuccess: () => {
          toast.success("Cierre mensual ejecutado correctamente.");
          setCierreRealizado(true);
        },
        onError: () => {
          toast.error("Hubo un error al ejecutar el cierre mensual.");
        }
      });
    }
  };

  const mesActual = format(new Date(), "MMMM yyyy", { locale: es }).toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Cierre Mensual</h2>
        <p className="text-muted-foreground mt-2">
          Gestiona el cierre de operaciones del mes actual y genera los cortes en las planillas de Google Sheets.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Período Actual: {mesActual}
            </CardTitle>
            <CardDescription>
              Ejecutar el cierre insertará una fila separadora en Egresos, Combustible y Jornadas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4 flex gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-800 dark:text-amber-400">
                <p className="font-semibold mb-1">Información Importante</p>
                <p>
                  Esta acción no borra datos, únicamente organiza las planillas de Excel (Google Sheets) añadiendo una fila 
                  que indica el cierre del mes y los encabezados profesionales para el mes siguiente.
                </p>
              </div>
            </div>
            
            {cierreRealizado && (
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-4 flex gap-3 items-center">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-500" />
                <p className="text-sm font-medium text-green-800 dark:text-green-400">
                  Cierre ejecutado correctamente para este periodo.
                </p>
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleCierre} 
              disabled={isPending || cierreRealizado} 
              className="w-full sm:w-auto"
            >
              {isPending ? "Ejecutando..." : "Ejecutar Cierre de Mes"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
