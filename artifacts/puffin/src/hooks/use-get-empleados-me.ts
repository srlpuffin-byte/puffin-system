import { useQuery, UseQueryOptions } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Empleado } from "@workspace/api-client-react";

export const getEmpleadosMe = async (options?: RequestInit): Promise<Empleado> => {
  return customFetch<Empleado>("/api/empleados/me", {
    ...options,
    method: "GET",
  });
};

export function useGetEmpleadosMe(
  options?: Omit<UseQueryOptions<Empleado, unknown, Empleado>, "queryKey" | "queryFn">
) {
  return useQuery({
    queryKey: ["/api/empleados/me"],
    queryFn: ({ signal }) => getEmpleadosMe({ signal }),
    ...options,
  });
}
