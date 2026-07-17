import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface Proyecto {
  id: number;
  empresa_id: number;
  lugar: string;
  hectareas: string;
  precio_hectarea: string;
  ganancia_estimada: string | null;
  empleados_asignados: number[] | null;
  maquinas_asignadas: number[] | null;
  estado: string;
  createdAt: string;
  updatedAt: string;
}

export function useGetProyectos() {
  return useQuery({
    queryKey: ["/api/proyectos"],
    queryFn: async () => {
      const res = await apiFetch("/proyectos");
      return res as Proyecto[];
    },
  });
}

export function useGetProyecto(id: number) {
  return useQuery({
    queryKey: [`/api/proyectos/${id}`],
    queryFn: async () => {
      const res = await apiFetch(`/proyectos/${id}`);
      return res as Proyecto;
    },
    enabled: !!id,
  });
}

export function useCreateProyecto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Proyecto>) => {
      const res = await apiFetch("/proyectos", {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res as Proyecto;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proyectos"] });
    },
  });
}

export function useUpdateProyecto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Proyecto> }) => {
      const res = await apiFetch(`/proyectos/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      return res as Proyecto;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proyectos"] });
    },
  });
}

export function useDeleteProyecto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await apiFetch(`/proyectos/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proyectos"] });
    },
  });
}
