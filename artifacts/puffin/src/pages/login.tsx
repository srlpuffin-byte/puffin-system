import React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { useLogin } from "@workspace/api-client-react";
import { setAuthToken } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import logoUrl from "@assets/logo_puffin_1782946440101.jpeg";

const loginSchema = z.object({
  usuario: z.string().min(1, "Usuario requerido"),
  pin: z.string().min(4, "PIN de 4-10 dígitos").max(10, "Máximo 10 dígitos")
});

type LoginForm = z.infer<typeof loginSchema>;

export function Login() {
  const [, setLocation] = useLocation();
  const loginMut = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { usuario: "", pin: "" }
  });

  const onSubmit = (data: LoginForm) => {
    loginMut.mutate(
      { data },
      {
        onSuccess: (res) => {
          setAuthToken(res.token);
          setLocation("/panel");
        },
        onError: () => {
          toast.error("Credenciales inválidas");
        }
      }
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg border-t-4 border-t-primary">
        <CardHeader className="space-y-4 items-center text-center">
          <img src={logoUrl} alt="PUFFIN" className="h-16 w-auto" />
          <div className="space-y-1">
            <CardTitle className="text-2xl font-bold text-primary">Acceso Operativo</CardTitle>
            <CardDescription>Plataforma Integral PUFFIN SRL</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="usuario">Usuario</Label>
              <Input
                id="usuario"
                placeholder="Ej. admin o jgomez"
                {...register("usuario")}
                className={errors.usuario ? "border-red-500" : ""}
              />
              {errors.usuario && <p className="text-sm text-red-500">{errors.usuario.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">PIN de acceso</Label>
              <Input
                id="pin"
                type="password"
                placeholder="4 a 10 dígitos"
                {...register("pin")}
                className={errors.pin ? "border-red-500" : ""}
              />
              {errors.pin && <p className="text-sm text-red-500">{errors.pin.message}</p>}
            </div>
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-white font-semibold py-6 text-lg rounded-sm"
              disabled={loginMut.isPending}
            >
              {loginMut.isPending ? "INGRESANDO..." : "INGRESAR AL SISTEMA"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
